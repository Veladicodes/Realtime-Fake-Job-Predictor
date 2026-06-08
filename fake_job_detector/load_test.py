"""Tier-0 load test runner for the real-time fraud detection pipeline.

This script replays real job rows from the configured source dataset through
FastAPI ingestion and validates downstream persistence in PostgreSQL.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

import psycopg2

DEFAULT_SOURCE = os.getenv("JOBS_SOURCE_FILE", "data/raw/fake_job_postings.csv")


def _load_db_settings() -> Dict[str, Any]:
    database_url = os.getenv("DATABASE_URL", "").strip()

    if database_url:
        parsed = urlparse(database_url)
        if parsed.scheme in {"postgresql", "postgres"}:
            return {
                "host": parsed.hostname or "localhost",
                "dbname": parsed.path.lstrip("/") or "fake_jobs_db",
                "user": unquote(parsed.username or "postgres"),
                "password": unquote(parsed.password or ""),
                "port": parsed.port or 5432,
            }

    return {
        "host": os.getenv("PGHOST", "localhost"),
        "dbname": os.getenv("PGDATABASE", "fake_jobs_db"),
        "user": os.getenv("PGUSER", "postgres"),
        "password": os.getenv("PGPASSWORD", ""),
        "port": int(os.getenv("PGPORT", "5432")),
    }


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_event(raw: Dict[str, str]) -> Dict[str, str]:
    return {
        "title": (raw.get("title") or "").strip(),
        "description": (raw.get("description") or raw.get("job_description") or raw.get("requirements") or "").strip(),
        "company": (raw.get("company") or raw.get("company_name") or raw.get("company_profile") or "").strip(),
    }


def iter_source_events(csv_path: Path) -> Iterable[Dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            event = normalize_event(dict(row))
            if event["title"]:
                yield event


@dataclass
class IngestResult:
    ok: bool
    latency_ms: float
    job_id: str
    error: str | None = None


def post_ingest(api_base_url: str, payload: Dict[str, Any], timeout_seconds: float) -> IngestResult:
    start = time.perf_counter()
    request = Request(
        url=f"{api_base_url.rstrip('/')}/jobs/ingest",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            response.read()
        latency_ms = max(0.0, (time.perf_counter() - start) * 1000.0)
        return IngestResult(ok=True, latency_ms=latency_ms, job_id=payload["id"])
    except HTTPError as exc:
        latency_ms = max(0.0, (time.perf_counter() - start) * 1000.0)
        return IngestResult(ok=False, latency_ms=latency_ms, job_id=payload["id"], error=f"HTTP {exc.code}")
    except URLError as exc:
        latency_ms = max(0.0, (time.perf_counter() - start) * 1000.0)
        return IngestResult(ok=False, latency_ms=latency_ms, job_id=payload["id"], error=f"Network error: {exc.reason}")
    except Exception as exc:  # pragma: no cover - best effort runner
        latency_ms = max(0.0, (time.perf_counter() - start) * 1000.0)
        return IngestResult(ok=False, latency_ms=latency_ms, job_id=payload["id"], error=str(exc))


def build_payloads(source_events: Iterable[Dict[str, str]], total_events: int, run_id: str) -> List[Dict[str, Any]]:
    payloads: List[Dict[str, Any]] = []
    source_cache: List[Dict[str, str]] = []

    for event in source_events:
        source_cache.append(event)
        if len(source_cache) >= total_events:
            break

    if not source_cache:
        raise RuntimeError("No valid source events found in CSV")

    for index in range(total_events):
        base = source_cache[index % len(source_cache)]
        payloads.append(
            {
                "id": f"load-{run_id}-{index}",
                "title": base["title"],
                "description": base["description"],
                "company": base["company"],
                "timestamp": utc_now_iso(),
            }
        )

    return payloads


def fetch_processed_count(db_settings: Dict[str, Any], run_prefix: str) -> int:
    conn = psycopg2.connect(**db_settings)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*)
                FROM job_predictions
                WHERE job_id LIKE %s
                """,
                (f"{run_prefix}%",),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0
    finally:
        conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run production load test against real ingestion pipeline")
    parser.add_argument("--api-base-url", default="http://127.0.0.1:8000", help="FastAPI base URL")
    parser.add_argument("--source", default=DEFAULT_SOURCE, help="Real source CSV file path")
    parser.add_argument("--total-events", type=int, default=10000, help="Number of events to ingest")
    parser.add_argument("--concurrency", type=int, default=40, help="Parallel ingest workers")
    parser.add_argument("--request-timeout-seconds", type=float, default=5.0, help="Per request timeout")
    parser.add_argument("--settle-timeout-seconds", type=float, default=240.0, help="Max wait for DB persistence")
    parser.add_argument("--poll-interval-seconds", type=float, default=2.0, help="DB poll interval")
    parser.add_argument("--output", default="", help="Optional output file path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_path = Path(args.source)
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    run_id = uuid.uuid4().hex[:12]
    run_prefix = f"load-{run_id}-"
    db_settings = _load_db_settings()

    payloads = build_payloads(
        source_events=iter_source_events(source_path),
        total_events=max(1, int(args.total_events)),
        run_id=run_id,
    )

    results: List[IngestResult] = []
    start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=max(1, int(args.concurrency))) as executor:
        futures = [
            executor.submit(
                post_ingest,
                args.api_base_url,
                payload,
                max(0.5, float(args.request_timeout_seconds)),
            )
            for payload in payloads
        ]

        for future in as_completed(futures):
            results.append(future.result())

    ingest_elapsed = max(0.001, time.perf_counter() - start)

    success_results = [item for item in results if item.ok]
    failures = len(results) - len(success_results)
    latencies = [item.latency_ms for item in success_results]

    success_count = len(success_results)
    avg_latency = (sum(latencies) / len(latencies)) if latencies else 0.0
    max_latency = max(latencies) if latencies else 0.0
    throughput = success_count / ingest_elapsed
    error_rate = failures / max(1, len(results))

    processed = 0
    settle_deadline = time.monotonic() + max(1.0, float(args.settle_timeout_seconds))
    while time.monotonic() < settle_deadline:
        processed = fetch_processed_count(db_settings, run_prefix=run_prefix)
        if processed >= success_count:
            break
        time.sleep(max(0.1, float(args.poll_interval_seconds)))

    output = {
        "run_id": run_id,
        "total_sent": len(results),
        "total_processed": processed,
        "avg_latency": round(avg_latency, 3),
        "max_latency": round(max_latency, 3),
        "throughput_jobs_per_sec": round(throughput, 3),
        "failures": failures,
        "error_rate": round(error_rate, 6),
        "ingest_elapsed_sec": round(ingest_elapsed, 3),
    }

    output_json = json.dumps(output, indent=2)
    print(output_json)

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output_json + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
