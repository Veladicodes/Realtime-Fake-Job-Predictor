"""Tier-0 Spark Structured Streaming pipeline.

Flow:
Kafka topic `jobs` -> parse JSON -> ML inference -> enrichment/anomaly -> PostgreSQL sink

Key production features:
- window-based fraud aggregation
- anomaly detection from rolling fraud baselines
- per-batch metrics persistence
- async DB retry backlog for failed writes
- optional processed topic fan-out
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

try:
    from kafka import KafkaConsumer, KafkaProducer, TopicPartition
except Exception:  # pragma: no cover - optional runtime import
    KafkaConsumer = None
    KafkaProducer = None
    TopicPartition = None

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col,
    coalesce,
    concat_ws,
    count,
    from_json,
    greatest,
    lit,
    lower,
    sum as spark_sum,
    to_timestamp,
    trim,
    udf,
    when,
    window,
)
from pyspark.sql.streaming import StreamingQuery
from pyspark.sql.types import FloatType, IntegerType, StringType, StructField, StructType

try:
    from spark.model_loader import load_model_and_vectorizer
except ModuleNotFoundError:
    from model_loader import load_model_and_vectorizer

try:
    from utils.db_writer import connect_db, insert_dead_letter, insert_pipeline_metric, insert_prediction
except ModuleNotFoundError:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))
    from utils.db_writer import connect_db, insert_dead_letter, insert_pipeline_metric, insert_prediction


APP_NAME = "FakeJobDetectionSparkStream"
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
JOBS_TOPIC = os.getenv("KAFKA_JOBS_TOPIC", "jobs")
PROCESSED_TOPIC = os.getenv("KAFKA_PROCESSED_TOPIC", "processed_jobs")
ENABLE_PROCESSED_TOPIC = os.getenv("ENABLE_PROCESSED_TOPIC", "false").strip().lower() in {"1", "true", "yes", "on"}

# Spark cluster configuration — defaults keep local dev working unchanged.
# In Docker: set SPARK_MASTER_URL=spark://spark-master:7077, SPARK_DRIVER_HOST=spark-stream
SPARK_MASTER_URL = os.getenv("SPARK_MASTER_URL", "local[*]")
SPARK_DRIVER_HOST = os.getenv("SPARK_DRIVER_HOST", "127.0.0.1")
SPARK_DRIVER_BIND_ADDRESS = os.getenv("SPARK_DRIVER_BIND_ADDRESS", "127.0.0.1")
SPARK_IVY_PATH = os.getenv("SPARK_IVY_PATH", str(Path.home() / ".ivy2"))

CHECKPOINT_LOCATION = os.getenv("SPARK_CHECKPOINT_LOCATION", "output/checkpoints/jobs_stream")
WINDOW_CHECKPOINT_LOCATION = os.getenv("SPARK_WINDOW_CHECKPOINT_LOCATION", "output/checkpoints/jobs_window")
TRIGGER_INTERVAL = os.getenv("SPARK_TRIGGER_INTERVAL", "5 seconds")
MAX_OFFSETS_PER_TRIGGER = int(os.getenv("SPARK_MAX_OFFSETS_PER_TRIGGER", "700"))

MODEL_PATH = os.getenv("MODEL_PATH", "ml/saved_model/fraud_model.pkl")
TFIDF_PATH = os.getenv("TFIDF_PATH", "ml/saved_model/tfidf.pkl")

ANOMALY_EMA_ALPHA = float(os.getenv("ANOMALY_EMA_ALPHA", "0.2"))
ANOMALY_SPIKE_MULTIPLIER = float(os.getenv("ANOMALY_SPIKE_MULTIPLIER", "2.2"))
ANOMALY_RATE_MULTIPLIER = float(os.getenv("ANOMALY_RATE_MULTIPLIER", "1.8"))
ANOMALY_RATE_THRESHOLD = float(os.getenv("ANOMALY_RATE_THRESHOLD", "0.55"))
ANOMALY_MIN_FRAUD_COUNT = int(os.getenv("ANOMALY_MIN_FRAUD_COUNT", "8"))

RETRY_INTERVAL_SECONDS = float(os.getenv("DB_RETRY_INTERVAL_SECONDS", "5"))
RETRY_BATCH_SIZE = int(os.getenv("DB_RETRY_BATCH_SIZE", "200"))
MAX_RETRY_ATTEMPTS = int(os.getenv("DB_MAX_RETRY_ATTEMPTS", "8"))
MAX_RETRY_BACKLOG = int(os.getenv("DB_MAX_RETRY_BACKLOG", "20000"))
LOCAL_DLQ_PATH = Path(os.getenv("LOCAL_DLQ_PATH", "output/dead_letter/dead_letter_events.jsonl"))

FREE_EMAIL_PATTERNS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "proton.me"]
SUSPICIOUS_KEYWORDS = [
    "urgent",
    "telegram",
    "whatsapp",
    "wire transfer",
    "crypto",
    "no experience",
    "quick money",
    "immediate start",
]

PREDICTION_SCHEMA = StructType(
    [
        StructField("prediction", IntegerType(), True),
        StructField("confidence", FloatType(), True),
    ]
)

KAFKA_JSON_SCHEMA = StructType(
    [
        StructField("id", StringType(), True),
        StructField("title", StringType(), True),
        StructField("description", StringType(), True),
        StructField("company", StringType(), True),
        StructField("timestamp", StringType(), True),
    ]
)


_anomaly_lock = threading.Lock()
_anomaly_state = {
    "initialized": False,
    "ema_fraud_count": 0.0,
    "ema_fraud_rate": 0.0,
}

_retry_lock = threading.Lock()
_retry_backlog: deque[Dict[str, Any]] = deque()
_retry_worker_started = False
_retry_stop_event = threading.Event()


def parse_iso(value: str) -> datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        parsed = datetime.fromisoformat(raw)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except ValueError:
        return None


def get_runtime_spark_version() -> str:
    try:
        import pyspark

        return pyspark.__version__
    except Exception:
        return ""


def parse_semver(version: str) -> tuple[int, int, int]:
    numbers = [int(value) for value in re.findall(r"\d+", version)[:3]]
    while len(numbers) < 3:
        numbers.append(0)
    return numbers[0], numbers[1], numbers[2]


def infer_scala_binary_version(spark_version: str) -> str:
    major, _, _ = parse_semver(spark_version)
    if major >= 4:
        return "2.13"
    if major == 3:
        return "2.12"
    raise RuntimeError(f"Unsupported Spark version: {spark_version}")


def build_kafka_package(spark_version: str) -> str:
    major, minor, patch = parse_semver(spark_version)
    scala_binary = infer_scala_binary_version(spark_version)

    if major >= 4:
        return f"org.apache.spark:spark-sql-kafka-0-10_{scala_binary}:{major}.{minor}.0"

    return f"org.apache.spark:spark-sql-kafka-0-10_{scala_binary}:{major}.{minor}.{patch}"


def resolve_kafka_package() -> str:
    explicit = os.getenv("SPARK_KAFKA_PACKAGE")
    if explicit:
        return explicit

    runtime_version = os.getenv("SPARK_RUNTIME_VERSION", "") or get_runtime_spark_version()
    if not runtime_version:
        return "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0"

    return build_kafka_package(runtime_version)


def create_spark_session() -> SparkSession:
    spark_version = os.getenv("SPARK_RUNTIME_VERSION", "") or get_runtime_spark_version()
    kafka_package = resolve_kafka_package()

    builder = (
        SparkSession.builder.appName(APP_NAME)
        .master(SPARK_MASTER_URL)
        .config("spark.jars.packages", kafka_package)
        .config("spark.jars.ivy", SPARK_IVY_PATH)
        .config("spark.driver.host", SPARK_DRIVER_HOST)
        .config("spark.driver.bindAddress", SPARK_DRIVER_BIND_ADDRESS)
        .config("spark.sql.sources.useV1SourceList", "kafka")
        .config("spark.python.worker.faulthandler.enabled", "true")
        .config("spark.sql.execution.pyspark.udf.faulthandler.enabled", "true")
    )

    # Standalone cluster: expose fixed ports so workers can reach the driver
    if SPARK_MASTER_URL != "local[*]":
        builder = (
            builder
            .config("spark.driver.port", os.getenv("SPARK_DRIVER_PORT", "7001"))
            .config("spark.blockManager.port", os.getenv("SPARK_BLOCKMANAGER_PORT", "7002"))
            .config("spark.ui.port", os.getenv("SPARK_UI_PORT", "4040"))
        )

    major, _, _ = parse_semver(spark_version)
    if major >= 4:
        builder = builder.config("spark.sql.streaming.disabledV2MicroBatchReaders", "kafka")

    spark = builder.getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    print(f"Spark master : {SPARK_MASTER_URL}")
    print(f"Spark runtime: {spark_version or 'unknown'}")
    print(f"Kafka package: {kafka_package}")
    print(f"Driver host  : {SPARK_DRIVER_HOST}")
    return spark


def read_jobs_stream(spark: SparkSession) -> DataFrame:
    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP_SERVERS)
        .option("subscribe", JOBS_TOPIC)
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .option("maxOffsetsPerTrigger", MAX_OFFSETS_PER_TRIGGER)
        .load()
    )

    parsed = raw.select(
        from_json(col("value").cast("string"), KAFKA_JSON_SCHEMA).alias("data"),
        col("value").cast("string").alias("raw_value"),
        col("partition").cast("int").alias("kafka_partition"),
        col("offset").cast("long").alias("kafka_offset"),
        col("timestamp").alias("kafka_timestamp"),
    )

    return parsed.select(
        coalesce(col("data.id"), lit("")) .alias("job_id"),
        coalesce(col("data.title"), lit("")) .alias("title"),
        coalesce(col("data.description"), lit("")) .alias("description"),
        coalesce(col("data.company"), lit("")) .alias("company"),
        coalesce(col("data.timestamp"), lit("")) .alias("event_timestamp"),
        col("raw_value"),
        col("kafka_partition"),
        col("kafka_offset"),
        col("kafka_timestamp"),
    )


def prepare_features(df: DataFrame) -> DataFrame:
    return (
        df.withColumn(
            "combined_text",
            lower(
                concat_ws(
                    " ",
                    coalesce(col("title"), lit("")),
                    coalesce(col("description"), lit("")),
                    coalesce(col("company"), lit("")),
                )
            ),
        )
        .withColumn("event_time", to_timestamp(col("event_timestamp")))
    )


def build_predict_udf(model_broadcast, tfidf_broadcast):
    def _predict(text: str) -> Dict[str, float]:
        if text is None or not str(text).strip():
            return {"prediction": 0, "confidence": 0.0}

        try:
            from scipy.sparse import csr_matrix, hstack

            clean_text = str(text).strip().lower()
            model = model_broadcast.value
            tfidf = tfidf_broadcast.value
            vector = tfidf.transform([clean_text])

            expected_features = getattr(model, "n_features_in_", None)
            if expected_features is not None and expected_features != vector.shape[1]:
                if expected_features == vector.shape[1] + 3:
                    has_company_profile = 1 if clean_text else 0
                    has_salary_range = 1 if any(ch.isdigit() for ch in clean_text) else 0
                    text_length = float(len(clean_text))
                    extra = csr_matrix([[has_company_profile, has_salary_range, text_length]], dtype="float64")
                    vector = hstack([vector, extra], format="csr")
                elif expected_features > vector.shape[1]:
                    pad_width = expected_features - vector.shape[1]
                    vector = hstack([vector, csr_matrix((1, pad_width), dtype="float64")], format="csr")
                else:
                    vector = vector[:, :expected_features]

            pred = int(model.predict(vector)[0])
            confidence = 0.0

            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(vector)[0]
                classes = list(getattr(model, "classes_", []))
                if classes and pred in classes:
                    confidence = float(probs[classes.index(pred)])
                else:
                    confidence = float(max(probs))

            return {"prediction": pred, "confidence": float(confidence)}
        except Exception:
            return {"prediction": 0, "confidence": 0.0}

    return udf(_predict, PREDICTION_SCHEMA)


def add_reason_column(df: DataFrame) -> DataFrame:
    suspicious_pattern = r"\\b(urgent|wire transfer|crypto|telegram|whatsapp|no experience|quick money)\\b"
    return df.withColumn(
        "reason",
        when(trim(coalesce(col("company"), lit(""))) == "", lit("Missing company information"))
        .when(lower(coalesce(col("combined_text"), lit(""))).rlike(suspicious_pattern), lit("Suspicious language pattern"))
        .when(trim(coalesce(col("description"), lit(""))).rlike(r"^.{0,39}$"), lit("Low-detail job description"))
        .otherwise(lit("Normal posting pattern")),
    )


def apply_model(df: DataFrame, model_broadcast, tfidf_broadcast) -> DataFrame:
    predict_udf = build_predict_udf(model_broadcast, tfidf_broadcast)

    scored = (
        df.withColumn("prediction_struct", predict_udf(col("combined_text")))
        .withColumn("prediction", col("prediction_struct.prediction"))
        .withColumn("confidence", col("prediction_struct.confidence"))
        .drop("prediction_struct")
    )

    explained = add_reason_column(scored)
    return explained.select(
        "job_id",
        "title",
        "description",
        "company",
        "event_timestamp",
        "event_time",
        "prediction",
        "confidence",
        "reason",
        "combined_text",
        "kafka_partition",
        "kafka_offset",
        "kafka_timestamp",
    )


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _extract_keywords(text: str) -> List[str]:
    normalized = (text or "").lower()
    hits = [token for token in SUSPICIOUS_KEYWORDS if token in normalized]
    return hits


def _detect_domain_pattern(company: str, text: str) -> str | None:
    payload = f"{company or ''} {text or ''}".lower()
    for domain in FREE_EMAIL_PATTERNS:
        if domain in payload:
            return f"free_email_domain:{domain}"
    if re.search(r"\\bhttps?://[^\s]+\\b", payload):
        return "contains_external_url"
    return None


def _compute_batch_anomaly(fraud_count: int, fraud_rate: float) -> Tuple[bool, str]:
    with _anomaly_lock:
        initialized = bool(_anomaly_state["initialized"])
        ema_count = float(_anomaly_state["ema_fraud_count"])
        ema_rate = float(_anomaly_state["ema_fraud_rate"])

        if not initialized:
            _anomaly_state["initialized"] = True
            _anomaly_state["ema_fraud_count"] = float(fraud_count)
            _anomaly_state["ema_fraud_rate"] = float(fraud_rate)
            return False, "baseline_warmup"

        count_threshold = max(ANOMALY_MIN_FRAUD_COUNT, ema_count * ANOMALY_SPIKE_MULTIPLIER)
        rate_threshold = max(ANOMALY_RATE_THRESHOLD, ema_rate * ANOMALY_RATE_MULTIPLIER)

        count_spike = float(fraud_count) >= count_threshold and fraud_count >= ANOMALY_MIN_FRAUD_COUNT
        rate_spike = float(fraud_rate) >= rate_threshold and fraud_count >= max(2, ANOMALY_MIN_FRAUD_COUNT // 3)

        reasons: List[str] = []
        if count_spike:
            reasons.append(f"fraud_count_spike:{fraud_count}>={count_threshold:.2f}")
        if rate_spike:
            reasons.append(f"fraud_rate_spike:{fraud_rate:.3f}>={rate_threshold:.3f}")

        alpha = _clamp(ANOMALY_EMA_ALPHA, 0.01, 0.99)
        _anomaly_state["ema_fraud_count"] = (alpha * fraud_count) + ((1 - alpha) * ema_count)
        _anomaly_state["ema_fraud_rate"] = (alpha * fraud_rate) + ((1 - alpha) * ema_rate)

        if reasons:
            return True, "; ".join(reasons)
        return False, "normal_window"


def _to_db_record(row_dict: Dict[str, Any], batch_is_anomaly: bool, batch_anomaly_reason: str) -> Dict[str, Any]:
    prediction = int(row_dict.get("prediction") or 0)
    confidence = _clamp(float(row_dict.get("confidence") or 0.0), 0.0, 1.0)

    company = str(row_dict.get("company") or "")
    combined_text = str(row_dict.get("combined_text") or "")
    keyword_hits = _extract_keywords(combined_text)
    domain_pattern = _detect_domain_pattern(company, combined_text)

    base_score = confidence if prediction == 1 else max(0.0, 1.0 - confidence)
    keyword_bonus = min(0.25, 0.05 * len(keyword_hits))
    domain_bonus = 0.12 if domain_pattern else 0.0
    anomaly_bonus = 0.15 if (batch_is_anomaly and prediction == 1) else 0.0
    risk_score = _clamp(base_score + keyword_bonus + domain_bonus + anomaly_bonus, 0.0, 1.0)

    reason_tags: List[str] = []
    base_reason = str(row_dict.get("reason") or "Model scoring result")
    reason_tags.append(base_reason)
    reason_tags.extend([f"keyword:{item}" for item in keyword_hits])
    if domain_pattern:
        reason_tags.append(domain_pattern)
    if batch_is_anomaly and prediction == 1:
        reason_tags.append(f"batch_anomaly:{batch_anomaly_reason}")

    is_anomaly = bool(batch_is_anomaly and prediction == 1)

    return {
        "job_id": str(row_dict.get("job_id") or ""),
        "title": str(row_dict.get("title") or ""),
        "prediction": prediction,
        "confidence": confidence,
        "reason": base_reason,
        "reason_tags": reason_tags,
        "risk_score": risk_score,
        "is_anomaly": is_anomaly,
        "anomaly_reason": batch_anomaly_reason if is_anomaly else None,
        "original_score": base_score,
        "updated_score": risk_score,
        "combined_text": combined_text,
        "event_timestamp": str(row_dict.get("event_timestamp") or ""),
        "suspicious_keywords": ",".join(keyword_hits),
        "domain_pattern": domain_pattern,
        "kafka_partition": int(row_dict.get("kafka_partition") or 0),
        "kafka_offset": int(row_dict.get("kafka_offset") or 0),
    }


def _prepare_processed_event(record: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(record.get("job_id") or ""),
        "title": str(record.get("title") or ""),
        "prediction": int(record.get("prediction") or 0),
        "confidence": float(record.get("confidence") or 0.0),
        "reason": record.get("reason_tags") or [record.get("reason")],
        "risk_score": float(record.get("risk_score") or 0.0),
        "is_anomaly": bool(record.get("is_anomaly") or False),
        "anomaly_reason": record.get("anomaly_reason"),
        "timestamp": str(record.get("event_timestamp") or ""),
    }


def _retry_backlog_size() -> int:
    with _retry_lock:
        return len(_retry_backlog)


def _append_local_dlq(entry: Dict[str, Any]) -> None:
    try:
        LOCAL_DLQ_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOCAL_DLQ_PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, default=str) + "\n")
    except Exception as exc:
        print(f"DLQ local fallback failed: {exc}")


def _route_to_dlq(record: Dict[str, Any], retry_count: int, failure_stage: str, failure_reason: str) -> None:
    payload = {
        "record": record,
        "retry_count": max(0, int(retry_count)),
        "failure_stage": failure_stage,
        "failure_reason": failure_reason,
        "source": "spark_stream",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        insert_dead_letter(
            record=record,
            failure_stage=failure_stage,
            failure_reason=failure_reason,
            retry_count=retry_count,
            source="spark_stream",
        )
    except Exception:
        _append_local_dlq(payload)


def _enqueue_retry(
    record: Dict[str, Any],
    attempts: int = 0,
    failure_stage: str = "db_insert",
    failure_reason: str = "insert_failed",
) -> None:
    with _retry_lock:
        if len(_retry_backlog) >= MAX_RETRY_BACKLOG:
            dropped = _retry_backlog.popleft()
            dropped_record = dropped.get("record") if isinstance(dropped, dict) else None
            if isinstance(dropped_record, dict):
                _route_to_dlq(
                    dropped_record,
                    retry_count=int(dropped.get("attempts", 0)),
                    failure_stage="retry_backlog_overflow",
                    failure_reason="retry_backlog_capacity_exceeded",
                )
        _retry_backlog.append(
            {
                "record": record,
                "attempts": max(0, int(attempts)),
                "next_retry_at": time.time(),
                "failure_stage": failure_stage,
                "failure_reason": failure_reason,
            }
        )


def _drain_due_retries(max_items: int) -> List[Dict[str, Any]]:
    due: List[Dict[str, Any]] = []
    now = time.time()

    with _retry_lock:
        remaining: deque[Dict[str, Any]] = deque()
        while _retry_backlog and len(due) < max_items:
            item = _retry_backlog.popleft()
            if float(item.get("next_retry_at", 0.0)) <= now:
                due.append(item)
            else:
                remaining.append(item)

        while _retry_backlog:
            remaining.append(_retry_backlog.popleft())

        _retry_backlog.extend(remaining)

    return due


def _requeue_failed(items: List[Dict[str, Any]]) -> None:
    now = time.time()
    with _retry_lock:
        for item in items:
            attempts = int(item.get("attempts", 0)) + 1
            if attempts >= MAX_RETRY_ATTEMPTS:
                record = item.get("record")
                if isinstance(record, dict):
                    _route_to_dlq(
                        record,
                        retry_count=attempts,
                        failure_stage=str(item.get("failure_stage") or "db_retry"),
                        failure_reason=str(item.get("last_error") or item.get("failure_reason") or "max_retries_exceeded"),
                    )
                continue
            if len(_retry_backlog) >= MAX_RETRY_BACKLOG:
                dropped = _retry_backlog.popleft()
                dropped_record = dropped.get("record") if isinstance(dropped, dict) else None
                if isinstance(dropped_record, dict):
                    _route_to_dlq(
                        dropped_record,
                        retry_count=int(dropped.get("attempts", 0)),
                        failure_stage="retry_backlog_overflow",
                        failure_reason="retry_backlog_capacity_exceeded",
                    )
            item["attempts"] = attempts
            item["next_retry_at"] = now + min(2 ** attempts, 60)
            _retry_backlog.append(item)


def _estimate_kafka_lag(records: List[Dict[str, Any]]) -> int:
    if KafkaConsumer is None or TopicPartition is None:
        return 0

    partition_offsets: Dict[int, int] = {}
    for record in records:
        try:
            partition = int(record.get("kafka_partition"))
            offset = int(record.get("kafka_offset"))
            partition_offsets[partition] = max(offset, partition_offsets.get(partition, -1))
        except Exception:
            continue

    if not partition_offsets:
        return 0

    consumer = None
    try:
        consumer = KafkaConsumer(
            bootstrap_servers=[server.strip() for server in KAFKA_BOOTSTRAP_SERVERS.split(",") if server.strip()],
            enable_auto_commit=False,
            group_id=None,
            request_timeout_ms=5000,
        )
        topic_partitions = [TopicPartition(JOBS_TOPIC, part) for part in partition_offsets.keys()]
        end_offsets = consumer.end_offsets(topic_partitions)

        lag = 0
        for topic_partition in topic_partitions:
            produced_offset = int(end_offsets.get(topic_partition, 0))
            consumed_offset = int(partition_offsets.get(topic_partition.partition, -1)) + 1
            lag += max(0, produced_offset - consumed_offset)

        return int(max(0, lag))
    except Exception:
        return 0
    finally:
        if consumer is not None:
            try:
                consumer.close()
            except Exception:
                pass


def _retry_worker_loop() -> None:
    while not _retry_stop_event.is_set():
        due_items = _drain_due_retries(RETRY_BATCH_SIZE)
        if not due_items:
            time.sleep(RETRY_INTERVAL_SECONDS)
            continue

        db_pool = None
        db_conn = None
        failed: List[Dict[str, Any]] = []
        try:
            db_pool = connect_db()
            db_conn = db_pool.getconn()
            for item in due_items:
                record = item.get("record")
                if not isinstance(record, dict):
                    continue
                try:
                    insert_prediction(record, connection=db_conn, commit=False)
                except Exception as exc:
                    item["last_error"] = str(exc)
                    failed.append(item)
            db_conn.commit()
        except Exception as exc:
            for item in due_items:
                item["last_error"] = str(exc)
            failed = due_items
            if db_conn is not None:
                try:
                    db_conn.rollback()
                except Exception:
                    pass
        finally:
            if db_pool is not None and db_conn is not None:
                db_pool.putconn(db_conn)

        if failed:
            _requeue_failed(failed)

        time.sleep(RETRY_INTERVAL_SECONDS)


def start_retry_worker() -> None:
    global _retry_worker_started
    if _retry_worker_started:
        return

    _retry_worker_started = True
    thread = threading.Thread(target=_retry_worker_loop, name="db-retry-worker", daemon=True)
    thread.start()


def _latency_ms_from_event(event_timestamp: str) -> float | None:
    event_time = parse_iso(event_timestamp)
    if event_time is None:
        return None
    return max(0.0, (datetime.now(timezone.utc) - event_time).total_seconds() * 1000.0)


def write_batch(batch_df: DataFrame, batch_id: int) -> None:
    batch_started_at = datetime.now(timezone.utc)
    batch_started_monotonic = time.monotonic()

    try:
        rows = batch_df.toPandas().to_dict(orient="records")
    except Exception as exc:
        print(f"Batch {batch_id}: materialization failed: {exc}")
        return

    jobs_received = len(rows)
    if jobs_received == 0:
        return

    fraud_count = sum(1 for row in rows if int(row.get("prediction") or 0) == 1)
    fraud_rate = fraud_count / max(1, jobs_received)
    batch_is_anomaly, batch_anomaly_reason = _compute_batch_anomaly(fraud_count, fraud_rate)

    records = [_to_db_record(row, batch_is_anomaly, batch_anomaly_reason) for row in rows]
    anomaly_count = sum(1 for rec in records if bool(rec.get("is_anomaly")))
    kafka_lag = _estimate_kafka_lag(records)

    db_pool = None
    db_conn = None
    producer = None

    inserted = 0
    failed = 0
    db_insert_time_ms = 0.0

    if ENABLE_PROCESSED_TOPIC:
        try:
            if KafkaProducer is None:
                raise RuntimeError("kafka-python producer unavailable")
            producer = KafkaProducer(
                bootstrap_servers=[server.strip() for server in KAFKA_BOOTSTRAP_SERVERS.split(",") if server.strip()],
                value_serializer=lambda payload: json.dumps(payload).encode("utf-8"),
                retries=3,
                acks="all",
            )
        except Exception:
            producer = None

    try:
        db_pool = connect_db()
        db_conn = db_pool.getconn()

        db_insert_started = time.monotonic()
        for record in records:
            try:
                insert_prediction(record, connection=db_conn, commit=False)
                inserted += 1
                if producer is not None:
                    producer.send(PROCESSED_TOPIC, value=_prepare_processed_event(record))
            except Exception as exc:
                failed += 1
                _enqueue_retry(record, attempts=0, failure_stage="db_insert", failure_reason=str(exc))

        db_conn.commit()
        db_insert_time_ms = max(0.0, (time.monotonic() - db_insert_started) * 1000.0)

        if producer is not None:
            producer.flush(timeout=10)

        latencies = [
            latency for latency in (_latency_ms_from_event(str(rec.get("event_timestamp") or "")) for rec in records) if latency is not None
        ]
        avg_latency_ms = (sum(latencies) / len(latencies)) if latencies else 0.0

        batch_completed_at = datetime.now(timezone.utc)
        duration_sec = max(0.001, (batch_completed_at - batch_started_at).total_seconds())
        spark_batch_time_ms = max(0.0, (time.monotonic() - batch_started_monotonic) * 1000.0)
        throughput = inserted / duration_sec
        error_rate = failed / max(1, jobs_received)
        anomaly_rate = anomaly_count / max(1, jobs_received)

        insert_pipeline_metric(
            {
                "batch_id": batch_id,
                "batch_started_at": batch_started_at.isoformat(),
                "batch_completed_at": batch_completed_at.isoformat(),
                "jobs_received": jobs_received,
                "jobs_inserted": inserted,
                "jobs_failed": failed,
                "queue_backlog": _retry_backlog_size(),
                "kafka_lag": kafka_lag,
                "spark_batch_time_ms": spark_batch_time_ms,
                "db_insert_time_ms": db_insert_time_ms,
                "throughput_jobs_per_sec": throughput,
                "avg_latency_ms": avg_latency_ms,
                "error_rate": error_rate,
                "fraud_rate": fraud_rate,
                "anomaly_rate": anomaly_rate,
                "source": "spark_stream",
            },
            connection=db_conn,
            commit=False,
        )
        db_conn.commit()

    except Exception as exc:
        print(f"Batch {batch_id}: DB pipeline error: {exc}")
        for record in records:
            _enqueue_retry(record, attempts=0, failure_stage="db_batch", failure_reason=str(exc))
        if db_conn is not None:
            try:
                db_conn.rollback()
            except Exception:
                pass
    finally:
        if producer is not None:
            try:
                producer.close(timeout=5)
            except Exception:
                pass

        if db_pool is not None and db_conn is not None:
            db_pool.putconn(db_conn)


def start_prediction_query(scored_df: DataFrame) -> StreamingQuery:
    return (
        scored_df.writeStream.foreachBatch(write_batch)
        .outputMode("append")
        .option("checkpointLocation", CHECKPOINT_LOCATION)
        .trigger(processingTime=TRIGGER_INTERVAL)
        .start()
    )


def start_window_analytics_query(scored_df: DataFrame) -> StreamingQuery:
    window_metrics = (
        scored_df.where(col("event_time").isNotNull())
        .groupBy(window(col("event_time"), "1 minute"))
        .agg(
            count(lit(1)).alias("total_jobs"),
            spark_sum(when(col("prediction") == 1, 1).otherwise(0)).alias("fraud_jobs"),
        )
        .withColumn("fraud_rate", col("fraud_jobs") / greatest(col("total_jobs"), lit(1)))
    )

    # Keep query active for production window monitoring without synthetic values.
    return (
        window_metrics.writeStream.format("memory")
        .queryName("fraud_window_metrics")
        .outputMode("complete")
        .option("checkpointLocation", WINDOW_CHECKPOINT_LOCATION)
        .trigger(processingTime=TRIGGER_INTERVAL)
        .start()
    )


def main() -> None:
    spark = create_spark_session()

    try:
        connect_db()
        print("PostgreSQL schema ready")
    except Exception as exc:
        print(f"Warning: initial DB check failed: {exc}")

    model, tfidf = load_model_and_vectorizer(MODEL_PATH, TFIDF_PATH)
    model_broadcast = spark.sparkContext.broadcast(model)
    tfidf_broadcast = spark.sparkContext.broadcast(tfidf)
    print("Model artifacts loaded and broadcasted")

    start_retry_worker()

    jobs_stream = read_jobs_stream(spark)
    feature_stream = prepare_features(jobs_stream)
    scored_stream = apply_model(feature_stream, model_broadcast, tfidf_broadcast)

    prediction_query = start_prediction_query(scored_stream)
    window_query = start_window_analytics_query(scored_stream)

    print(f"Streaming started: topic={JOBS_TOPIC} bootstrap={KAFKA_BOOTSTRAP_SERVERS}")
    prediction_query.awaitTermination()
    window_query.awaitTermination()


if __name__ == "__main__":
    main()
