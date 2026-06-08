"""FastAPI service for fake-job detection telemetry and realtime updates.

This API is intentionally lightweight:
- no simulated data generation
- no in-request heavy ML inference
- reads persisted results from PostgreSQL
- accepts new job events and forwards them to Kafka for async processing
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import sys
import threading
import time
import uuid
from contextlib import asynccontextmanager, contextmanager, suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Generator, List
from urllib.parse import unquote, urlparse

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from kafka import KafkaProducer
from pydantic import BaseModel, Field
from psycopg2 import DatabaseError, OperationalError, pool
from psycopg2.extras import RealDictCursor

try:
    from spark.model_loader import load_model_and_vectorizer
except ModuleNotFoundError:
    from model_loader import load_model_and_vectorizer

try:
    from utils.db_writer import connect_db as ensure_writer_schema
except ModuleNotFoundError:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))
    from utils.db_writer import connect_db as ensure_writer_schema


def _load_db_settings() -> Dict[str, Any]:
    """Resolve DB settings from DATABASE_URL first, then PG* env vars."""
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


def _parse_bootstrap_target(bootstrap_servers: str) -> tuple[str, int]:
    first_server = bootstrap_servers.split(",")[0].strip()
    if not first_server:
        return "localhost", 9092

    if ":" in first_server:
        host, port_str = first_server.rsplit(":", 1)
        try:
            return host or "localhost", int(port_str)
        except ValueError:
            return host or "localhost", 9092

    return first_server, 9092


_DB_SETTINGS = _load_db_settings()
DB_HOST = _DB_SETTINGS["host"]
DB_NAME = _DB_SETTINGS["dbname"]
DB_USER = _DB_SETTINGS["user"]
DB_PASSWORD = _DB_SETTINGS["password"]
DB_PORT = int(_DB_SETTINGS["port"])

POOL_MIN_CONN = int(os.getenv("API_DB_POOL_MIN", "1"))
POOL_MAX_CONN = int(os.getenv("API_DB_POOL_MAX", "10"))
WS_PUSH_INTERVAL_SECONDS = float(os.getenv("API_WS_INTERVAL_SECONDS", "1.0"))
WS_HEARTBEAT_SECONDS = float(os.getenv("API_WS_HEARTBEAT_SECONDS", "5.0"))
WS_MAX_EVENTS_PER_CYCLE = int(os.getenv("API_WS_MAX_EVENTS_PER_CYCLE", "50"))
SPARK_DOWN_LAG_THRESHOLD = int(os.getenv("SPARK_DOWN_LAG_THRESHOLD", "2000"))

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
JOBS_TOPIC = os.getenv("KAFKA_JOBS_TOPIC", "jobs")

DEFAULT_CORS = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ORIGINS = [origin.strip() for origin in os.getenv("API_CORS_ORIGINS", DEFAULT_CORS).split(",") if origin.strip()]

_DB_POOL: pool.SimpleConnectionPool | None = None
_KAFKA_PRODUCER: KafkaProducer | None = None
_KAFKA_LOCK = asyncio.Lock()
_EVENT_LOOP: asyncio.AbstractEventLoop | None = None
_STREAM_TASK: asyncio.Task[None] | None = None

SESSION_ID = str(uuid.uuid4())

logging.basicConfig(
    level=os.getenv("API_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("fake_job_detector.api")

_MODE_LOCK = threading.Lock()
_MODE_STATE = {
    "mode": "normal",
    "last_changed": time.monotonic(),
}


def log_event(event: str, **fields: Any) -> None:
    payload = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **fields,
    }
    logger.info(json.dumps(payload, default=str))


class ConnectionManager:
    """Track active websocket clients and broadcast JSON payloads."""

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
            total = len(self.active_connections)
        client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
        logger.info("WS connect: client=%s active=%d", client, total)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
            total = len(self.active_connections)
        client = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
        logger.info("WS disconnect: client=%s active=%d", client, total)

    async def connection_count(self) -> int:
        async with self._lock:
            return len(self.active_connections)

    async def broadcast(self, payload: Dict[str, Any]) -> None:
        async with self._lock:
            targets = list(self.active_connections)

        if not targets:
            return

        stale_connections: List[WebSocket] = []
        for target in targets:
            try:
                await target.send_json(payload)
            except Exception:
                stale_connections.append(target)

        for stale in stale_connections:
            await self.disconnect(stale)
            with suppress(Exception):
                await stale.close(code=1011)


manager = ConnectionManager()


class IngestJobRequest(BaseModel):
    id: str | None = None
    title: str = Field(..., min_length=1)
    description: str = ""
    company: str = ""
    timestamp: str | None = None


class AnalyzeJobRequest(BaseModel):
    title: str = Field(..., min_length=1)
    description: str = ""
    requirements: str = ""
    company_info: str | None = None
    company_profile: str | None = None


def init_connection_pool() -> pool.SimpleConnectionPool:
    """Initialize and return shared PostgreSQL pool."""
    global _DB_POOL

    if _DB_POOL is None:
        try:
            ensure_writer_schema()
            _DB_POOL = pool.SimpleConnectionPool(
                minconn=POOL_MIN_CONN,
                maxconn=POOL_MAX_CONN,
                host=DB_HOST,
                dbname=DB_NAME,
                user=DB_USER,
                password=DB_PASSWORD,
                port=DB_PORT,
            )
        except OperationalError as exc:
            raise RuntimeError(f"Database connection error: {exc}") from exc

    return _DB_POOL


def close_connection_pool() -> None:
    """Close all pooled PostgreSQL connections."""
    global _DB_POOL

    if _DB_POOL is not None:
        _DB_POOL.closeall()
        _DB_POOL = None


@contextmanager
def get_db_connection() -> Generator[Any, None, None]:
    """Yield one pooled connection and return it safely."""
    try:
        db_pool = init_connection_pool()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc

    conn = None
    try:
        conn = db_pool.getconn()
        yield conn
    except OperationalError as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    finally:
        if conn is not None:
            db_pool.putconn(conn)


def to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def normalize_label(prediction: int | str) -> str:
    if isinstance(prediction, str):
        return "FAKE" if prediction.strip().upper() == "FAKE" else "REAL"
    return "FAKE" if int(prediction) == 1 else "REAL"


def serialize_job(row: Dict[str, Any]) -> Dict[str, Any]:
    created_at = row.get("created_at")
    event_timestamp = row.get("event_timestamp")
    confidence = row.get("confidence")
    confidence_value = float(confidence) if confidence is not None else 0.0

    prediction_raw = row.get("prediction")
    label = normalize_label(prediction_raw if prediction_raw is not None else 0)

    original_score_value = float(row.get("original_score") or 0.0)
    updated_score_raw = row.get("updated_score")
    updated_score_value = float(updated_score_raw) if updated_score_raw is not None else original_score_value
    is_corrected = bool(row.get("is_corrected") or False)

    risk_score = updated_score_value
    if risk_score <= 0:
        risk_score = confidence_value if label == "FAKE" else max(0.0, 1.0 - confidence_value)

    reason_tags_raw = row.get("reason_tags_json")
    reason_tags: List[str] = []
    if isinstance(reason_tags_raw, str) and reason_tags_raw.strip():
        try:
            parsed = json.loads(reason_tags_raw)
            if isinstance(parsed, list):
                reason_tags = [str(item) for item in parsed if str(item).strip()]
        except Exception:
            reason_tags = []

    is_anomaly = bool(row.get("is_anomaly") or False)
    created_dt = created_at if hasattr(created_at, "isoformat") else None
    event_dt = event_timestamp if hasattr(event_timestamp, "isoformat") else None
    latency_ms = None
    if created_dt is not None and event_dt is not None:
        try:
            latency_ms = max(0.0, (created_dt - event_dt).total_seconds() * 1000.0)
        except Exception:
            latency_ms = None

    return {
        "id": str(row.get("id")) if row.get("id") is not None else str(row.get("job_id") or ""),
        "job_id": row.get("job_id"),
        "title": row.get("title"),
        "prediction": prediction_raw,
        "label": label,
        "confidence": confidence_value,
        "risk_score": max(0.0, min(1.0, risk_score)),
        "reason": row.get("reason") or "",
        "reason_tags": reason_tags,
        "is_anomaly": is_anomaly,
        "anomaly_reason": row.get("anomaly_reason"),
        "suspicious_keywords": row.get("suspicious_keywords") or "",
        "domain_pattern": row.get("domain_pattern"),
        "cluster_id": row.get("cluster_id"),
        "version": int(row.get("version") or 1),
        "is_corrected": is_corrected,
        "original_score": max(0.0, min(1.0, original_score_value)),
        "updated_score": max(0.0, min(1.0, updated_score_value)),
        "correction_reason": row.get("correction_reason"),
        "event_timestamp": to_iso(event_timestamp),
        "latency_ms": latency_ms,
        "created_at": to_iso(created_at),
    }


def fetch_jobs(sql_query: str, params: tuple[Any, ...] = ()) -> List[Dict[str, Any]]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(sql_query, params)
                rows = cursor.fetchall()
                return [serialize_job(dict(row)) for row in rows]
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def fetch_latest_prediction_pk() -> int:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT COALESCE(MAX(id), 0) FROM job_predictions")
                row = cursor.fetchone()
                return int(row[0]) if row else 0
    except Exception:
        return 0


def fetch_predictions_since(last_seen_id: int, limit: int = 200) -> tuple[int, List[Dict[str, Any]]]:
    query = """
        SELECT
            id,
            job_id,
            title,
            prediction,
            confidence,
            reason,
            reason_tags_json,
            risk_score,
            is_anomaly,
            anomaly_reason,
            suspicious_keywords,
            domain_pattern,
            event_timestamp,
            cluster_id,
            version,
            is_corrected,
            original_score,
            updated_score,
            correction_reason,
            created_at
        FROM job_predictions
        WHERE id > %s
        ORDER BY id ASC
        LIMIT %s
    """

    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, (last_seen_id, limit))
                rows = [dict(row) for row in cursor.fetchall()]
    except Exception:
        return last_seen_id, []

    latest_id = last_seen_id
    normalized: List[Dict[str, Any]] = []
    for row in rows:
        row_id = int(row.get("id") or 0)
        latest_id = max(latest_id, row_id)
        normalized.append(serialize_job(row))

    return latest_id, normalized


def fetch_dashboard_metrics() -> Dict[str, Any]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    WITH cluster_pressure AS (
                        SELECT cluster_id, COUNT(*)::int AS count_24h
                        FROM job_clusters
                        WHERE created_at >= NOW() - INTERVAL '24 hours'
                        GROUP BY cluster_id
                    )
                    SELECT
                        COUNT(*)::int AS total_jobs,
                        COALESCE(SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END), 0)::int AS fake_jobs,
                        COALESCE(AVG(confidence), 0)::float AS avg_confidence,
                        MAX(created_at) AS last_processed_at,
                        COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '1 minute' THEN 1 ELSE 0 END), 0)::int AS jobs_last_minute,
                        COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) * 1000, 0)::float AS processing_latency_ms,
                        COALESCE(SUM(CASE WHEN is_corrected THEN 1 ELSE 0 END), 0)::int AS corrected_jobs,
                        (
                            SELECT COALESCE(COUNT(*), 0)::int
                            FROM cluster_pressure
                            WHERE LN(count_24h + 1) > 1.0
                        ) AS high_pressure_clusters
                    FROM job_predictions
                    """
                )
                row = dict(cursor.fetchone() or {})

        total_jobs = int(row.get("total_jobs", 0))
        fake_jobs = int(row.get("fake_jobs", 0))
        real_jobs = max(total_jobs - fake_jobs, 0)
        fake_percentage = round((fake_jobs / total_jobs) * 100, 2) if total_jobs else 0.0
        jobs_last_minute = int(row.get("jobs_last_minute", 0))
        throughput = round(jobs_last_minute / 60, 2)

        return {
            "total_jobs": total_jobs,
            "fake_jobs": fake_jobs,
            "real_jobs": real_jobs,
            "fake_percentage": fake_percentage,
            "throughput": throughput,
            "avg_confidence": float(row.get("avg_confidence", 0.0) or 0.0),
            "last_processed_at": to_iso(row.get("last_processed_at")),
            "processing_latency_ms": float(row.get("processing_latency_ms", 0.0) or 0.0),
            "corrected_jobs": int(row.get("corrected_jobs", 0) or 0),
            "high_pressure_clusters": int(row.get("high_pressure_clusters", 0) or 0),
        }
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def fetch_alerts(limit: int) -> List[Dict[str, Any]]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        id,
                        job_id,
                        title,
                        prediction,
                        confidence,
                        reason,
                        cluster_id,
                        is_corrected,
                        original_score,
                        updated_score,
                        correction_reason,
                        created_at
                    FROM job_predictions
                    WHERE prediction = 1
                    ORDER BY COALESCE(updated_score, original_score, confidence) DESC, created_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = [dict(row) for row in cursor.fetchall()]

        alerts: List[Dict[str, Any]] = []
        for row in rows:
            confidence = float(row.get("confidence") or 0.0)
            original_score = float(row.get("original_score") or 0.0)
            updated_score = float(row.get("updated_score") if row.get("updated_score") is not None else original_score)
            risk_score = max(0.0, min(1.0, updated_score if updated_score > 0 else confidence))
            risk = round(risk_score * 100, 2)

            is_corrected = bool(row.get("is_corrected") or False)
            level = "critical" if (is_corrected or risk >= 90) else "warning" if risk >= 75 else "info"

            correction_reason = row.get("correction_reason")
            if is_corrected:
                reason = (
                    f"UPDATED FRAUD DETECTION: "
                    f"{correction_reason or row.get('reason') or 'Fraud escalation detected: cluster risk threshold exceeded'}"
                )
            else:
                reason = row.get("reason") or "Model flagged suspicious fraud pattern."

            alerts.append(
                {
                    "id": str(row.get("id")),
                    "job_id": row.get("job_id"),
                    "job_title": row.get("title") or "Untitled Posting",
                    "risk": risk,
                    "risk_score": risk_score,
                    "reason": reason,
                    "timestamp": to_iso(row.get("created_at")),
                    "level": level,
                    "is_corrected": is_corrected,
                    "cluster_id": row.get("cluster_id"),
                    "correction_reason": correction_reason,
                }
            )
        return alerts
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def fetch_trends(window_hours: int) -> List[Dict[str, Any]]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    WITH buckets AS (
                        SELECT generate_series(
                            date_trunc('hour', NOW() - make_interval(hours => %s)),
                            date_trunc('hour', NOW()),
                            INTERVAL '1 hour'
                        ) AS bucket_start
                    ),
                    aggregate AS (
                        SELECT
                            date_trunc('hour', created_at) AS bucket_start,
                            COUNT(*)::int AS total_jobs,
                            COALESCE(SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END), 0)::int AS fake_jobs
                        FROM job_predictions
                        WHERE created_at >= NOW() - make_interval(hours => %s)
                        GROUP BY 1
                    )
                    SELECT
                        b.bucket_start,
                        COALESCE(a.total_jobs, 0) AS total_jobs,
                        COALESCE(a.fake_jobs, 0) AS fake_jobs
                    FROM buckets b
                    LEFT JOIN aggregate a ON a.bucket_start = b.bucket_start
                    ORDER BY b.bucket_start ASC
                    """,
                    (window_hours, window_hours),
                )
                rows = [dict(row) for row in cursor.fetchall()]

        points: List[Dict[str, Any]] = []
        for row in rows:
            total_jobs = int(row.get("total_jobs", 0))
            fake_jobs = int(row.get("fake_jobs", 0))
            bucket = row.get("bucket_start")
            timestamp = bucket.strftime("%H:%M") if bucket else "--:--"
            points.append(
                {
                    "timestamp": timestamp,
                    "bucket_start": to_iso(bucket),
                    "total_jobs": total_jobs,
                    "fake_jobs": fake_jobs,
                    "real_jobs": max(total_jobs - fake_jobs, 0),
                    "throughput": round(total_jobs / 3600, 3),
                }
            )

        return points
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def fetch_corrections(limit: int) -> List[Dict[str, Any]]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        c.job_id,
                        p.title,
                        p.cluster_id,
                        c.old_score,
                        c.new_score,
                        c.reason,
                        c.correction_type,
                        c.updated_at
                    FROM job_corrections c
                    LEFT JOIN job_predictions p ON p.job_id = c.job_id
                    ORDER BY c.updated_at DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = [dict(row) for row in cursor.fetchall()]

        return [
            {
                "job_id": row.get("job_id"),
                "job_title": row.get("title") or "Untitled Posting",
                "cluster_id": row.get("cluster_id"),
                "old_score": float(row.get("old_score") or 0.0),
                "new_score": float(row.get("new_score") or 0.0),
                "reason": row.get("reason") or "Fraud escalation detected: cluster risk threshold exceeded",
                "correction_type": row.get("correction_type") or "RISK_INCREASE",
                "updated_at": to_iso(row.get("updated_at")),
            }
            for row in rows
        ]
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def fetch_top_clusters(limit: int) -> List[Dict[str, Any]]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        jc.cluster_id,
                        COALESCE(SUM(CASE WHEN jc.created_at >= NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END), 0)::int AS jobs_1h,
                        COALESCE(SUM(CASE WHEN jc.created_at >= NOW() - INTERVAL '6 hours' THEN 1 ELSE 0 END), 0)::int AS jobs_6h,
                        COUNT(*)::int AS jobs_24h,
                        LN(COUNT(*) + 1)::float AS pressure_score,
                        COALESCE(SUM(CASE WHEN jp.is_corrected THEN 1 ELSE 0 END), 0)::int AS corrected_jobs,
                        COALESCE(MAX(jp.updated_score), 0)::float AS peak_score
                    FROM job_clusters jc
                    LEFT JOIN job_predictions jp ON jp.job_id = jc.job_id
                    WHERE jc.created_at >= NOW() - INTERVAL '24 hours'
                    GROUP BY jc.cluster_id
                    ORDER BY pressure_score DESC, corrected_jobs DESC, jobs_24h DESC
                    LIMIT %s
                    """,
                    (limit,),
                )
                rows = [dict(row) for row in cursor.fetchall()]

        return [
            {
                "cluster_id": row.get("cluster_id"),
                "jobs_1h": int(row.get("jobs_1h") or 0),
                "jobs_6h": int(row.get("jobs_6h") or 0),
                "jobs_24h": int(row.get("jobs_24h") or 0),
                "pressure_score": float(row.get("pressure_score") or 0.0),
                "corrected_jobs": int(row.get("corrected_jobs") or 0),
                "peak_score": float(row.get("peak_score") or 0.0),
            }
            for row in rows
            if row.get("cluster_id")
        ]
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def fetch_cluster_spikes(window_hours: int) -> List[Dict[str, Any]]:
    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    WITH buckets AS (
                        SELECT generate_series(
                            date_trunc('hour', NOW() - make_interval(hours => %s)),
                            date_trunc('hour', NOW()),
                            INTERVAL '1 hour'
                        ) AS bucket_start
                    ),
                    cluster_agg AS (
                        SELECT
                            date_trunc('hour', created_at) AS bucket_start,
                            COUNT(*)::int AS cluster_jobs
                        FROM job_clusters
                        WHERE created_at >= NOW() - make_interval(hours => %s)
                        GROUP BY 1
                    ),
                    correction_agg AS (
                        SELECT
                            date_trunc('hour', updated_at) AS bucket_start,
                            COUNT(*)::int AS corrections
                        FROM job_corrections
                        WHERE updated_at >= NOW() - make_interval(hours => %s)
                        GROUP BY 1
                    )
                    SELECT
                        b.bucket_start,
                        COALESCE(c.cluster_jobs, 0)::int AS cluster_jobs,
                        COALESCE(r.corrections, 0)::int AS corrections
                    FROM buckets b
                    LEFT JOIN cluster_agg c ON c.bucket_start = b.bucket_start
                    LEFT JOIN correction_agg r ON r.bucket_start = b.bucket_start
                    ORDER BY b.bucket_start ASC
                    """,
                    (window_hours, window_hours, window_hours),
                )
                rows = [dict(row) for row in cursor.fetchall()]

        points: List[Dict[str, Any]] = []
        for row in rows:
            bucket = row.get("bucket_start")
            timestamp = bucket.strftime("%H:%M") if bucket else "--:--"
            points.append(
                {
                    "timestamp": timestamp,
                    "bucket_start": to_iso(bucket),
                    "cluster_jobs": int(row.get("cluster_jobs") or 0),
                    "corrections": int(row.get("corrections") or 0),
                }
            )

        return points
    except HTTPException:
        raise
    except DatabaseError as exc:
        raise HTTPException(status_code=503, detail="database query failed") from exc


def check_db_connected() -> bool:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        return True
    except Exception:
        return False


def check_ml_loaded() -> bool:
    try:
        load_model_and_vectorizer()
        return True
    except Exception:
        return False


def check_kafka_running() -> bool:
    host, port = _parse_bootstrap_target(KAFKA_BOOTSTRAP_SERVERS)
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except OSError:
        return False


def fetch_recent_activity_count(window_minutes: int = 2) -> int:
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM job_predictions
                    WHERE created_at >= NOW() - make_interval(mins => %s)
                    """,
                    (window_minutes,),
                )
                return int(cursor.fetchone()[0])
    except Exception:
        return 0


def fetch_system_metrics(window_minutes: int = 5) -> Dict[str, Any]:
    fallback = {
        "throughput_jobs_per_sec": 0.0,
        "avg_latency_ms": 0.0,
        "error_rate": 0.0,
        "fraud_rate": 0.0,
        "anomaly_rate": 0.0,
        "kafka_lag": 0,
        "spark_batch_time_ms": 0.0,
        "db_insert_time_ms": 0.0,
        "queue_backlog": 0,
        "samples": 0,
    }

    try:
        with get_db_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        COALESCE(AVG(throughput_jobs_per_sec), 0)::float AS throughput_jobs_per_sec,
                        COALESCE(AVG(avg_latency_ms), 0)::float AS avg_latency_ms,
                        COALESCE(AVG(error_rate), 0)::float AS error_rate,
                        COALESCE(AVG(fraud_rate), 0)::float AS fraud_rate,
                        COALESCE(AVG(anomaly_rate), 0)::float AS anomaly_rate,
                        COALESCE(AVG(kafka_lag), 0)::float AS kafka_lag,
                        COALESCE(AVG(spark_batch_time_ms), 0)::float AS spark_batch_time_ms,
                        COALESCE(AVG(db_insert_time_ms), 0)::float AS db_insert_time_ms,
                        COALESCE(MAX(queue_backlog), 0)::int AS queue_backlog,
                        COUNT(*)::int AS samples
                    FROM pipeline_metrics
                    WHERE created_at >= NOW() - make_interval(mins => %s)
                    """,
                    (window_minutes,),
                )
                row = dict(cursor.fetchone() or {})

            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(
                    """
                    SELECT
                        COALESCE(COUNT(*), 0)::int AS total_jobs,
                        COALESCE(SUM(CASE WHEN prediction = 1 THEN 1 ELSE 0 END), 0)::int AS fake_jobs,
                        COALESCE(SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END), 0)::int AS anomaly_jobs
                    FROM job_predictions
                    WHERE created_at >= NOW() - make_interval(mins => %s)
                    """,
                    (window_minutes,),
                )
                rate_row = dict(cursor.fetchone() or {})

        total_jobs = int(rate_row.get("total_jobs") or 0)
        fake_jobs = int(rate_row.get("fake_jobs") or 0)
        anomaly_jobs = int(rate_row.get("anomaly_jobs") or 0)

        fraud_rate = (fake_jobs / total_jobs) if total_jobs else float(row.get("fraud_rate") or 0.0)
        anomaly_rate = (anomaly_jobs / total_jobs) if total_jobs else float(row.get("anomaly_rate") or 0.0)

        return {
            "throughput_jobs_per_sec": max(0.0, float(row.get("throughput_jobs_per_sec") or 0.0)),
            "avg_latency_ms": max(0.0, float(row.get("avg_latency_ms") or 0.0)),
            "error_rate": max(0.0, float(row.get("error_rate") or 0.0)),
            "fraud_rate": max(0.0, min(1.0, float(fraud_rate))),
            "anomaly_rate": max(0.0, min(1.0, float(anomaly_rate))),
            "kafka_lag": max(0, int(float(row.get("kafka_lag") or 0.0))),
            "spark_batch_time_ms": max(0.0, float(row.get("spark_batch_time_ms") or 0.0)),
            "db_insert_time_ms": max(0.0, float(row.get("db_insert_time_ms") or 0.0)),
            "queue_backlog": int(row.get("queue_backlog") or 0),
            "samples": int(row.get("samples") or 0),
        }
    except Exception:
        return fallback


def _derive_system_mode(status: Dict[str, Any]) -> tuple[str, List[str]]:
    messages: List[str] = []

    if status.get("kafka") != "running":
        messages.append("Kafka Down - ingestion degraded")
    if status.get("spark") == "down":
        messages.append("Spark Down - streaming inference unavailable")
    if status.get("db") != "connected":
        messages.append("Database Disconnected - persistence degraded")
    if status.get("ml") != "loaded":
        messages.append("ML Model Unloaded - fraud scoring degraded")

    healthy = len(messages) == 0

    with _MODE_LOCK:
        previous_mode = str(_MODE_STATE.get("mode", "normal"))
        last_changed = float(_MODE_STATE.get("last_changed", time.monotonic()))

        if healthy:
            if previous_mode == "degraded":
                _MODE_STATE["mode"] = "recovery"
                _MODE_STATE["last_changed"] = time.monotonic()
            elif previous_mode == "recovery" and (time.monotonic() - last_changed) > 30:
                _MODE_STATE["mode"] = "normal"
                _MODE_STATE["last_changed"] = time.monotonic()
        else:
            if previous_mode != "degraded":
                _MODE_STATE["mode"] = "degraded"
                _MODE_STATE["last_changed"] = time.monotonic()

        mode = str(_MODE_STATE["mode"])

    if mode == "recovery" and not messages:
        messages.append("Recovery Mode - reconnecting services and validating stream health")

    return mode, messages


def fetch_system_status() -> Dict[str, Any]:
    kafka_running = check_kafka_running()
    db_connected = check_db_connected()
    ml_loaded = check_ml_loaded()
    spark_activity = fetch_recent_activity_count(window_minutes=2)
    system_metrics = fetch_system_metrics(window_minutes=5)

    if spark_activity > 0:
        spark_state = "active"
    elif kafka_running and int(system_metrics.get("kafka_lag", 0)) > SPARK_DOWN_LAG_THRESHOLD:
        spark_state = "down"
    elif not kafka_running:
        spark_state = "down"
    else:
        spark_state = "idle"

    status = {
        "kafka": "running" if kafka_running else "down",
        "spark": spark_state,
        "db": "connected" if db_connected else "disconnected",
        "ml": "loaded" if ml_loaded else "unloaded",
    }
    status["degraded"] = any(
        [
            status["kafka"] != "running",
            status["db"] != "connected",
            status["ml"] != "loaded",
        ]
    )
    status["processing_latency_ms"] = float(system_metrics.get("avg_latency_ms", 0.0)) if db_connected else 0.0
    mode, messages = _derive_system_mode(status)
    status["mode"] = mode
    status["messages"] = messages
    status["degraded"] = mode != "normal"
    status["error_rate"] = float(system_metrics.get("error_rate", 0.0))
    status["throughput_jobs_per_sec"] = float(system_metrics.get("throughput_jobs_per_sec", 0.0))
    status["anomaly_rate"] = float(system_metrics.get("anomaly_rate", 0.0))
    status["kafka_lag"] = int(system_metrics.get("kafka_lag", 0))
    status["spark_batch_time_ms"] = float(system_metrics.get("spark_batch_time_ms", 0.0))
    status["checked_at"] = datetime.now(timezone.utc).isoformat()
    return status


def _stream_message(event_type: str, payload: Any) -> Dict[str, Any]:
    mode = "normal"
    try:
        mode = str(fetch_system_status().get("mode") or "normal")
    except Exception:
        mode = "degraded"

    return {
        "type": event_type,
        "data": payload,
        "payload": payload,
        "session_id": SESSION_ID,
        "source": "live_stream",
        "pipeline": "producer->kafka->spark->ml->postgres",
        "mode": mode,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def build_alert_from_prediction(prediction: Dict[str, Any]) -> Dict[str, Any]:
    risk_score = float(
        prediction.get("risk_score")
        if prediction.get("risk_score") is not None
        else prediction.get("updated_score")
        if prediction.get("updated_score") is not None
        else prediction.get("confidence")
        if prediction.get("confidence") is not None
        else 0.0
    )
    risk_score = max(0.0, min(1.0, risk_score))
    risk = round(risk_score * 100, 2)
    is_corrected = bool(prediction.get("is_corrected") or False)
    level = "critical" if (is_corrected or risk >= 90) else "warning" if risk >= 75 else "info"

    correction_reason = prediction.get("correction_reason")
    if is_corrected:
        reason = f"UPDATED FRAUD DETECTION: {correction_reason or prediction.get('reason') or 'Fraud escalation detected'}"
    else:
        reason = str(prediction.get("reason") or "Model flagged suspicious fraud pattern.")

    return {
        "id": str(prediction.get("id") or prediction.get("job_id") or "alert-unknown"),
        "job_id": prediction.get("job_id"),
        "job_title": prediction.get("title") or "Untitled Posting",
        "risk": risk,
        "risk_score": risk_score,
        "reason": reason,
        "timestamp": prediction.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "level": level,
        "is_corrected": is_corrected,
        "cluster_id": prediction.get("cluster_id"),
        "correction_reason": correction_reason,
    }


def build_snapshot() -> Dict[str, Any]:
    metrics = {
        "total_jobs": 0,
        "fake_jobs": 0,
        "real_jobs": 0,
        "fake_percentage": 0.0,
        "throughput": 0.0,
        "avg_confidence": 0.0,
        "last_processed_at": None,
        "processing_latency_ms": 0.0,
        "corrected_jobs": 0,
        "high_pressure_clusters": 0,
    }
    alerts: List[Dict[str, Any]] = []
    trends: List[Dict[str, Any]] = []
    corrections: List[Dict[str, Any]] = []
    top_clusters: List[Dict[str, Any]] = []
    cluster_spikes: List[Dict[str, Any]] = []
    system_metrics = fetch_system_metrics(window_minutes=5)

    try:
        metrics = fetch_dashboard_metrics()
    except Exception:
        logger.warning("snapshot metrics unavailable", exc_info=True)

    try:
        alerts = fetch_alerts(limit=25)
    except Exception:
        logger.warning("snapshot alerts unavailable", exc_info=True)

    try:
        trends = fetch_trends(window_hours=24)
    except Exception:
        logger.warning("snapshot trends unavailable", exc_info=True)

    try:
        corrections = fetch_corrections(limit=25)
    except Exception:
        logger.warning("snapshot corrections unavailable", exc_info=True)

    try:
        top_clusters = fetch_top_clusters(limit=8)
    except Exception:
        logger.warning("snapshot clusters unavailable", exc_info=True)

    try:
        cluster_spikes = fetch_cluster_spikes(window_hours=24)
    except Exception:
        logger.warning("snapshot spikes unavailable", exc_info=True)

    status = fetch_system_status()

    return {
        "session_id": SESSION_ID,
        "metrics": metrics,
        "alerts": alerts,
        "trends": trends,
        "corrections": corrections,
        "top_clusters": top_clusters,
        "cluster_spikes": cluster_spikes,
        "system_metrics": system_metrics,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


async def stream_updates() -> None:
    """Event-driven websocket broadcaster for newly inserted predictions."""
    last_seen_id = fetch_latest_prediction_pk()

    logger.info("WS stream loop started (poll=%ss)", WS_PUSH_INTERVAL_SECONDS)

    while True:
        try:
            connection_count = await manager.connection_count()
            if connection_count == 0:
                await asyncio.sleep(WS_PUSH_INTERVAL_SECONDS)
                continue

            fetch_limit = max(WS_MAX_EVENTS_PER_CYCLE * 4, 200)
            _, new_predictions = await asyncio.to_thread(fetch_predictions_since, last_seen_id, fetch_limit)

            if new_predictions:
                max_events = max(1, WS_MAX_EVENTS_PER_CYCLE)
                emitted = new_predictions[:max_events]
                for prediction in emitted:
                    await manager.broadcast(_stream_message("new_prediction", prediction))
                    if prediction.get("label") == "FAKE":
                        await manager.broadcast(_stream_message("new_alert", build_alert_from_prediction(prediction)))
                    log_event(
                        "prediction",
                        job_id=prediction.get("job_id"),
                        risk_score=prediction.get("risk_score"),
                        is_anomaly=prediction.get("is_anomaly", False),
                        latency_ms=prediction.get("latency_ms"),
                        status="success",
                    )

                consumed_ids: List[int] = []
                for item in emitted:
                    try:
                        consumed_ids.append(int(item.get("id") or 0))
                    except Exception:
                        continue

                if consumed_ids:
                    last_seen_id = max(last_seen_id, max(consumed_ids))

        except asyncio.CancelledError:
            logger.info("WS stream loop cancelled")
            raise
        except Exception as exc:
            logger.exception("WS stream loop iteration failed")
            log_event("prediction", status="failed", error=str(exc))

        await asyncio.sleep(WS_PUSH_INTERVAL_SECONDS)


async def get_kafka_producer() -> KafkaProducer:
    global _KAFKA_PRODUCER

    async with _KAFKA_LOCK:
        if _KAFKA_PRODUCER is None:
            _KAFKA_PRODUCER = KafkaProducer(
                bootstrap_servers=[server.strip() for server in KAFKA_BOOTSTRAP_SERVERS.split(",") if server.strip()],
                value_serializer=lambda payload: json.dumps(payload).encode("utf-8"),
                retries=5,
                acks="all",
                linger_ms=20,
            )
        return _KAFKA_PRODUCER


async def publish_job_event(event: Dict[str, Any], retries: int = 3) -> None:
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            started = time.perf_counter()
            producer = await get_kafka_producer()
            future = producer.send(JOBS_TOPIC, value=event)
            future.get(timeout=10)
            producer.flush(timeout=10)
            latency_ms = max(0.0, (time.perf_counter() - started) * 1000.0)
            log_event(
                "ingestion",
                job_id=event.get("id"),
                topic=JOBS_TOPIC,
                attempt=attempt + 1,
                latency_ms=latency_ms,
                status="success",
            )
            return
        except Exception as exc:
            last_error = exc
            logger.warning("Kafka publish attempt %d/%d failed: %s", attempt + 1, retries, exc)
            log_event("ingestion", job_id=event.get("id"), topic=JOBS_TOPIC, attempt=attempt + 1, status="failed", error=str(exc))
            await asyncio.sleep(min(2 ** attempt, 4))

    raise RuntimeError(f"Kafka publish failed after {retries} attempts: {last_error}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Warm up and dispose runtime resources."""
    global _EVENT_LOOP, _STREAM_TASK, _KAFKA_PRODUCER

    logger.info("FastAPI startup: initializing resources")

    try:
        init_connection_pool()
    except RuntimeError:
        logger.exception("DB pool initialization failed; API will run in degraded mode")

    _EVENT_LOOP = asyncio.get_running_loop()
    _STREAM_TASK = asyncio.create_task(stream_updates())

    try:
        yield
    finally:
        logger.info("FastAPI shutdown: closing resources")
        if _STREAM_TASK is not None:
            _STREAM_TASK.cancel()
            with suppress(asyncio.CancelledError):
                await _STREAM_TASK
            _STREAM_TASK = None

        _EVENT_LOOP = None

        if _KAFKA_PRODUCER is not None:
            with suppress(Exception):
                _KAFKA_PRODUCER.flush(timeout=5)
            with suppress(Exception):
                _KAFKA_PRODUCER.close(timeout=5)
            _KAFKA_PRODUCER = None

        close_connection_pool()


app = FastAPI(title="Real-Time Fake Job Detection API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_, exc: Exception):
    logger.exception("Unhandled API error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "internal service error"})


@app.get("/")
def root() -> Dict[str, str]:
    return {"message": "Fake Job Detection API Running"}


@app.get("/health")
def health() -> Dict[str, Any]:
    status = fetch_system_status()
    return {
        "kafka": status["kafka"],
        "spark": status["spark"],
        "db": status["db"],
        "ml": status["ml"],
        "mode": status.get("mode"),
        "messages": status.get("messages", []),
        "checked_at": status.get("checked_at"),
        "degraded": status.get("degraded", False),
    }


@app.get("/status")
def get_system_status() -> Dict[str, Any]:
    return fetch_system_status()


@app.get("/system-metrics")
def get_system_metrics(window_minutes: int = Query(default=5, ge=1, le=120)) -> Dict[str, Any]:
    metrics = fetch_system_metrics(window_minutes=window_minutes)
    metrics["window_minutes"] = window_minutes
    metrics["checked_at"] = datetime.now(timezone.utc).isoformat()
    return metrics


@app.post("/jobs/ingest")
async def ingest_job(payload: IngestJobRequest) -> Dict[str, Any]:
    job_id = payload.id or str(uuid.uuid4())
    timestamp = payload.timestamp or datetime.now(timezone.utc).isoformat()

    event = {
        "id": job_id,
        "title": payload.title,
        "description": payload.description,
        "company": payload.company,
        "timestamp": timestamp,
    }

    try:
        await publish_job_event(event)
    except Exception as exc:
        log_event("ingestion", job_id=job_id, topic=JOBS_TOPIC, status="failed", error=str(exc))
        raise HTTPException(status_code=503, detail="kafka publish failed") from exc

    log_event("ingestion", job_id=job_id, topic=JOBS_TOPIC, status="accepted")

    return {
        "status": "accepted",
        "job_id": job_id,
        "topic": JOBS_TOPIC,
        "timestamp": timestamp,
    }


@app.post("/analyze")
async def analyze_job(payload: AnalyzeJobRequest) -> Dict[str, Any]:
    """Compatibility endpoint: enqueue event for async scoring pipeline."""
    company_text = payload.company_info if payload.company_info is not None else payload.company_profile

    ingest_payload = IngestJobRequest(
        title=payload.title,
        description=" ".join([payload.description.strip(), payload.requirements.strip()]).strip(),
        company=(company_text or "").strip(),
    )
    result = await ingest_job(ingest_payload)

    return {
        "job_id": result["job_id"],
        "prediction": "REAL",
        "label": "REAL",
        "confidence": 0.0,
        "reason": "Job event accepted for asynchronous streaming inference.",
        "explanation": ["Event was queued to Kafka. Fetch /jobs/latest or subscribe to /ws for final prediction."],
        "note": "Asynchronous pipeline mode: prediction will appear after Spark processing.",
        "timestamp": result["timestamp"],
    }


@app.get("/dashboard")
def get_dashboard() -> Dict[str, Any]:
    return fetch_dashboard_metrics()


@app.get("/alerts")
def get_alerts(limit: int = Query(default=25, ge=1, le=200)) -> List[Dict[str, Any]]:
    return fetch_alerts(limit=limit)


@app.get("/corrections")
def get_corrections(limit: int = Query(default=50, ge=1, le=500)) -> List[Dict[str, Any]]:
    return fetch_corrections(limit=limit)


@app.get("/clusters/top")
def get_top_clusters(limit: int = Query(default=8, ge=1, le=50)) -> List[Dict[str, Any]]:
    return fetch_top_clusters(limit=limit)


@app.get("/clusters/spikes")
def get_cluster_spikes(window_hours: int = Query(default=24, ge=1, le=168)) -> List[Dict[str, Any]]:
    return fetch_cluster_spikes(window_hours=window_hours)


@app.get("/trends")
def get_trends(window_hours: int = Query(default=24, ge=1, le=168)) -> List[Dict[str, Any]]:
    return fetch_trends(window_hours=window_hours)


@app.get("/jobs/latest")
def get_latest_jobs(limit: int = Query(default=50, ge=1, le=500)) -> List[Dict[str, Any]]:
    query = """
        SELECT
            id,
            job_id,
            title,
            prediction,
            confidence,
            reason,
            reason_tags_json,
            risk_score,
            is_anomaly,
            anomaly_reason,
            suspicious_keywords,
            domain_pattern,
            event_timestamp,
            cluster_id,
            version,
            is_corrected,
            original_score,
            updated_score,
            correction_reason,
            created_at
        FROM job_predictions
        ORDER BY created_at DESC
        LIMIT %s
    """
    return fetch_jobs(query, (limit,))


@app.get("/jobs/fake")
def get_fake_jobs(limit: int = Query(default=100, ge=1, le=500)) -> List[Dict[str, Any]]:
    query = """
        SELECT
            id,
            job_id,
            title,
            prediction,
            confidence,
            reason,
            reason_tags_json,
            risk_score,
            is_anomaly,
            anomaly_reason,
            suspicious_keywords,
            domain_pattern,
            event_timestamp,
            cluster_id,
            version,
            is_corrected,
            original_score,
            updated_score,
            correction_reason,
            created_at
        FROM job_predictions
        WHERE prediction = 1
        ORDER BY created_at DESC
        LIMIT %s
    """
    return fetch_jobs(query, (limit,))


@app.get("/stats")
def get_stats() -> Dict[str, Any]:
    metrics = fetch_dashboard_metrics()
    system_metrics = fetch_system_metrics(window_minutes=5)
    return {
        "total_jobs": metrics["total_jobs"],
        "fake_jobs": metrics["fake_jobs"],
        "real_jobs": metrics["real_jobs"],
        "fake_percentage": metrics["fake_percentage"],
        "corrected_jobs": metrics.get("corrected_jobs", 0),
        "high_pressure_clusters": metrics.get("high_pressure_clusters", 0),
        "error_rate": system_metrics.get("error_rate", 0.0),
        "fraud_rate": system_metrics.get("fraud_rate", 0.0),
        "anomaly_rate": system_metrics.get("anomaly_rate", 0.0),
    }


@app.websocket("/ws")
async def websocket_updates(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        await websocket.send_json(_stream_message("snapshot", build_snapshot()))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception:
        logger.exception("WS endpoint failed")
        await manager.disconnect(websocket)
        with suppress(Exception):
            await websocket.close(code=1011)
