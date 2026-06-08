"""Kafka producer for real job events.

Publishes records to topic `jobs` with schema:
- id
- title
- description
- company
- timestamp
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Iterator
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from kafka import KafkaConsumer, KafkaProducer, TopicPartition
from kafka.errors import KafkaError

BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC = os.getenv("KAFKA_JOBS_TOPIC", "jobs")
DEFAULT_SOURCE = os.getenv("JOBS_SOURCE_FILE", "data/raw/fake_job_postings.csv")
DEFAULT_CONSUMER_GROUP = os.getenv("KAFKA_CONSUMER_GROUP", "spark_jobs_stream")
DEFAULT_MAX_LAG = int(os.getenv("MAX_KAFKA_LAG", "5000"))
DEFAULT_LAG_CHECK_EVERY = int(os.getenv("LAG_CHECK_EVERY", "50"))
DEFAULT_SYSTEM_METRICS_URL = os.getenv("SYSTEM_METRICS_URL", "http://127.0.0.1:8000/system-metrics")


class ProducerFlowController:
    """Dynamic producer flow controller with throttling and pause/resume."""

    def __init__(
        self,
        initial_rate_limit: float,
        min_rate_limit: float,
        max_rate_limit: float,
    ) -> None:
        self.current_rate_limit = max(0.0, initial_rate_limit)
        self.min_rate_limit = max(0.1, min_rate_limit)
        self.max_rate_limit = max(self.min_rate_limit, max_rate_limit)
        self.paused_until = 0.0
        self.last_send_ts = 0.0

    def throttle_producer(self, lag: int) -> None:
        if self.current_rate_limit <= 0:
            self.current_rate_limit = self.max_rate_limit
        self.current_rate_limit = max(self.min_rate_limit, self.current_rate_limit * 0.5)
        print(
            f"Backpressure active: lag={lag} rate_limit={self.current_rate_limit:.2f} events/s"
        )

    def recover_rate(self) -> None:
        if self.current_rate_limit <= 0:
            return
        self.current_rate_limit = min(self.max_rate_limit, self.current_rate_limit * 1.15)

    def pause(self, seconds: float) -> None:
        self.paused_until = max(self.paused_until, time.monotonic() + max(0.0, seconds))
        print(f"Producer paused for {seconds:.2f}s due to high lag")

    def resume(self) -> None:
        self.paused_until = 0.0

    def wait_for_slot(self) -> None:
        now = time.monotonic()
        if self.paused_until > now:
            time.sleep(self.paused_until - now)
            self.resume()

        if self.current_rate_limit <= 0:
            return

        min_interval = 1.0 / self.current_rate_limit
        wait = (self.last_send_ts + min_interval) - time.monotonic()
        if wait > 0:
            time.sleep(wait)

    def mark_sent(self) -> None:
        self.last_send_ts = time.monotonic()


def get_consumer_group_lag(bootstrap_servers: str, topic: str, consumer_group: str) -> int | None:
    consumer = None
    try:
        consumer = KafkaConsumer(
            bootstrap_servers=[server.strip() for server in bootstrap_servers.split(",") if server.strip()],
            group_id=consumer_group,
            enable_auto_commit=False,
            request_timeout_ms=5000,
            consumer_timeout_ms=1000,
        )

        partitions = consumer.partitions_for_topic(topic)
        if not partitions:
            return 0

        topic_partitions = [TopicPartition(topic, partition) for partition in sorted(partitions)]
        consumer.assign(topic_partitions)
        end_offsets = consumer.end_offsets(topic_partitions)

        lag_total = 0
        known_offsets = 0
        for topic_partition in topic_partitions:
            committed = consumer.committed(topic_partition)
            if committed is None:
                continue
            known_offsets += 1
            produced_offset = int(end_offsets.get(topic_partition, 0))
            lag_total += max(0, produced_offset - int(committed))

        if known_offsets == 0:
            return None

        return int(max(0, lag_total))
    except Exception:
        return None
    finally:
        if consumer is not None:
            try:
                consumer.close()
            except Exception:
                pass


def get_runtime_kafka_lag(system_metrics_url: str, timeout_seconds: float = 2.0) -> int | None:
    try:
        with urlopen(system_metrics_url, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, dict):
            return None
        lag = payload.get("kafka_lag")
        if lag is None:
            return None
        return max(0, int(lag))
    except (HTTPError, URLError, ValueError, TypeError):
        return None
    except Exception:
        return None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_timestamp(value: str) -> datetime | None:
    text = (value or "").strip()
    if not text:
        return None

    try:
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def create_producer(bootstrap_servers: str) -> KafkaProducer:
    return KafkaProducer(
        bootstrap_servers=[server.strip() for server in bootstrap_servers.split(",") if server.strip()],
        value_serializer=lambda payload: json.dumps(payload).encode("utf-8"),
        retries=5,
        acks="all",
        linger_ms=20,
    )


def normalize_event(raw: Dict[str, str]) -> Dict[str, str]:
    event_id = (raw.get("id") or raw.get("job_id") or "").strip() or str(uuid.uuid4())
    title = (raw.get("title") or "").strip()
    description = (
        raw.get("description")
        or raw.get("job_description")
        or raw.get("requirements")
        or ""
    ).strip()
    company = (
        raw.get("company")
        or raw.get("company_name")
        or raw.get("company_profile")
        or ""
    ).strip()
    timestamp = (raw.get("timestamp") or raw.get("created_at") or "").strip() or utc_now_iso()

    return {
        "id": event_id,
        "title": title,
        "description": description,
        "company": company,
        "timestamp": timestamp,
    }


def iter_csv_events(csv_path: Path) -> Iterator[Dict[str, str]]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            event = normalize_event(dict(row))
            if event["title"]:
                yield event


def iter_jsonl_events(jsonl_path: Path) -> Iterator[Dict[str, str]]:
    with jsonl_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            parsed = json.loads(line)
            if isinstance(parsed, dict):
                event = normalize_event({str(key): str(value) for key, value in parsed.items()})
                if event["title"]:
                    yield event


def iter_stdin_events() -> Iterator[Dict[str, str]]:
    import sys

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        parsed = json.loads(line)
        if isinstance(parsed, dict):
            event = normalize_event({str(key): str(value) for key, value in parsed.items()})
            if event["title"]:
                yield event


def publish_events(
    producer: KafkaProducer,
    events: Iterable[Dict[str, str]],
    topic: str,
    bootstrap_servers: str,
    max_messages: int | None = None,
    replay_by_timestamp: bool = True,
    replay_speed: float = 1.0,
    max_delay_seconds: float = 2.0,
    rate_limit_per_sec: float = 0.0,
    send_retries: int = 5,
    max_lag: int = DEFAULT_MAX_LAG,
    consumer_group: str = DEFAULT_CONSUMER_GROUP,
    lag_check_every: int = DEFAULT_LAG_CHECK_EVERY,
    pause_seconds: float = 1.0,
    min_rate_limit_per_sec: float = 5.0,
    system_metrics_url: str = DEFAULT_SYSTEM_METRICS_URL,
) -> int:
    sent = 0
    previous_event_time: datetime | None = None
    max_rate_limit = rate_limit_per_sec if rate_limit_per_sec > 0 else 2000.0
    flow = ProducerFlowController(
        initial_rate_limit=max_rate_limit,
        min_rate_limit=max(0.1, min_rate_limit_per_sec),
        max_rate_limit=max_rate_limit,
    )

    for event in events:
        if lag_check_every > 0 and sent % lag_check_every == 0:
            kafka_lag = get_consumer_group_lag(
                bootstrap_servers=bootstrap_servers,
                topic=topic,
                consumer_group=consumer_group,
            )
            if kafka_lag is None:
                kafka_lag = get_runtime_kafka_lag(system_metrics_url)
            if kafka_lag is not None:
                if kafka_lag > max_lag:
                    flow.throttle_producer(kafka_lag)
                    if kafka_lag > (max_lag * 2):
                        flow.pause(pause_seconds)
                else:
                    flow.recover_rate()

        if replay_by_timestamp:
            current_event_time = parse_iso_timestamp(event.get("timestamp", ""))
            if previous_event_time is not None and current_event_time is not None:
                gap = max(0.0, (current_event_time - previous_event_time).total_seconds())
                sleep_for = min(max_delay_seconds, gap / max(replay_speed, 0.01))
                if sleep_for > 0:
                    time.sleep(sleep_for)
            if current_event_time is not None:
                previous_event_time = current_event_time

        flow.wait_for_slot()

        send_error: KafkaError | None = None
        for attempt in range(send_retries):
            try:
                future = producer.send(topic, value=event, key=event["id"].encode("utf-8"))
                future.get(timeout=10)
                send_error = None
                break
            except KafkaError as exc:
                send_error = exc
                backoff = min(2 ** attempt, 5)
                time.sleep(backoff)

        if send_error is not None:
            raise RuntimeError(f"Kafka send failed for id={event['id']}: {send_error}") from send_error

        sent += 1
        flow.mark_sent()
        if max_messages is not None and sent >= max_messages:
            break

    producer.flush(timeout=10)
    return sent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish real job events to Kafka topic jobs")
    parser.add_argument("--topic", default=TOPIC, help="Kafka topic name (default: jobs)")
    parser.add_argument(
        "--bootstrap-servers",
        default=BOOTSTRAP_SERVERS,
        help="Kafka bootstrap servers (default: localhost:9092)",
    )
    parser.add_argument(
        "--source",
        default=DEFAULT_SOURCE,
        help="Input path (.csv or .jsonl). Use '-' to read JSON lines from stdin.",
    )
    parser.add_argument(
        "--max-messages",
        type=int,
        default=None,
        help="Optional hard limit on number of events to publish",
    )
    parser.add_argument(
        "--replay-by-timestamp",
        action="store_true",
        default=True,
        help="Respect source event timestamp gaps to replay realistic arrival times",
    )
    parser.add_argument(
        "--disable-replay-by-timestamp",
        action="store_true",
        help="Disable timestamp pacing and publish at max available speed",
    )
    parser.add_argument(
        "--replay-speed",
        type=float,
        default=1.0,
        help="Replay speed multiplier when --replay-by-timestamp is enabled (default: 1.0)",
    )
    parser.add_argument(
        "--max-delay-seconds",
        type=float,
        default=2.0,
        help="Maximum sleep between replayed events (default: 2.0)",
    )
    parser.add_argument(
        "--rate-limit-per-sec",
        type=float,
        default=0.0,
        help="Optional producer-side backpressure rate limit (events/second)",
    )
    parser.add_argument(
        "--max-lag",
        type=int,
        default=DEFAULT_MAX_LAG,
        help="Lag threshold to trigger producer throttling",
    )
    parser.add_argument(
        "--consumer-group",
        default=DEFAULT_CONSUMER_GROUP,
        help="Consumer group used to measure lag against produced offsets",
    )
    parser.add_argument(
        "--lag-check-every",
        type=int,
        default=DEFAULT_LAG_CHECK_EVERY,
        help="Check lag every N sent messages",
    )
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=1.0,
        help="Pause duration when lag is critically high",
    )
    parser.add_argument(
        "--min-rate-limit-per-sec",
        type=float,
        default=5.0,
        help="Minimum dynamic send rate during throttling",
    )
    parser.add_argument(
        "--system-metrics-url",
        default=DEFAULT_SYSTEM_METRICS_URL,
        help="Live API /system-metrics URL used as lag fallback",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = args.source.strip()

    producer = create_producer(args.bootstrap_servers)

    try:
        if source == "-":
            events = iter_stdin_events()
        else:
            source_path = Path(source)
            if not source_path.exists():
                raise FileNotFoundError(f"Input file not found: {source_path}")

            if source_path.suffix.lower() == ".jsonl":
                events = iter_jsonl_events(source_path)
            else:
                events = iter_csv_events(source_path)

        sent = publish_events(
            producer=producer,
            events=events,
            topic=args.topic,
            bootstrap_servers=args.bootstrap_servers,
            max_messages=args.max_messages,
            replay_by_timestamp=bool(args.replay_by_timestamp and not args.disable_replay_by_timestamp),
            replay_speed=args.replay_speed,
            max_delay_seconds=max(0.0, args.max_delay_seconds),
            rate_limit_per_sec=max(0.0, args.rate_limit_per_sec),
            max_lag=max(1, args.max_lag),
            consumer_group=args.consumer_group,
            lag_check_every=max(1, args.lag_check_every),
            pause_seconds=max(0.0, args.pause_seconds),
            min_rate_limit_per_sec=max(0.1, args.min_rate_limit_per_sec),
            system_metrics_url=args.system_metrics_url,
        )
        print(f"Published {sent} events to topic '{args.topic}'")
    finally:
        producer.close(timeout=5)


if __name__ == "__main__":
    main()
