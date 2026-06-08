"""PostgreSQL helpers for persisting streaming fraud predictions."""

from __future__ import annotations

import json
import math
import os
import sys
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Sequence
from urllib.parse import unquote, urlparse

import psycopg2
from psycopg2 import pool, sql
from psycopg2.extras import RealDictCursor
from sklearn.metrics.pairwise import cosine_similarity

try:
    from kafka import KafkaProducer
except Exception:  # pragma: no cover - optional dependency at runtime
    KafkaProducer = None

try:
    from spark.model_loader import load_model_and_vectorizer
except ModuleNotFoundError:
    project_root = Path(__file__).resolve().parents[1]
    if str(project_root) not in sys.path:
        sys.path.append(str(project_root))
    from spark.model_loader import load_model_and_vectorizer


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


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


_DB_SETTINGS = _load_db_settings()
DB_HOST = _DB_SETTINGS["host"]
DB_NAME = _DB_SETTINGS["dbname"]
DB_USER = _DB_SETTINGS["user"]
DB_PASSWORD = _DB_SETTINGS["password"]
DB_PORT = int(_DB_SETTINGS["port"])

POOL_MIN_CONN = int(os.getenv("DB_POOL_MIN_CONN", "1"))
POOL_MAX_CONN = int(os.getenv("DB_POOL_MAX_CONN", "5"))

CLUSTER_SIMILARITY_THRESHOLD = float(os.getenv("CLUSTER_SIMILARITY_THRESHOLD", "0.8"))
CLUSTER_LOOKBACK_HOURS = int(os.getenv("CLUSTER_LOOKBACK_HOURS", "24"))
CLUSTER_CANDIDATE_LIMIT = int(os.getenv("CLUSTER_CANDIDATE_LIMIT", "300"))

PRESSURE_MULTIPLIER = float(os.getenv("PRESSURE_MULTIPLIER", "0.5"))
CORRECTION_DELTA_THRESHOLD = float(os.getenv("CORRECTION_DELTA_THRESHOLD", "0.3"))
HARD_FLIP_THRESHOLD = float(os.getenv("HARD_FLIP_THRESHOLD", "2.0"))

ENABLE_CORRECTION_KAFKA = _env_bool("ENABLE_CORRECTION_KAFKA", default=False)
CORRECTION_TOPIC = os.getenv("CORRECTION_TOPIC", "job_corrections_stream")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")

_POOL: pool.SimpleConnectionPool | None = None
_POOL_LOCK = threading.Lock()
_TABLE_READY = False

_TFIDF = None
_TFIDF_FAILED = False
_TFIDF_LOCK = threading.Lock()

_KAFKA_PRODUCER: Any = None
_KAFKA_LOCK = threading.Lock()


def _connection_kwargs(database: str) -> Dict[str, Any]:
    """Build psycopg2 connection kwargs for the requested database."""
    return {
        "host": DB_HOST,
        "dbname": database,
        "user": DB_USER,
        "password": DB_PASSWORD,
        "port": DB_PORT,
    }


def _ensure_database_exists() -> None:
    """Create target database if it does not exist."""
    db_exists = False

    try:
        conn = psycopg2.connect(**_connection_kwargs(DB_NAME))
        conn.close()
        db_exists = True
    except psycopg2.Error as exc:
        if "does not exist" not in str(exc).lower():
            raise

    if db_exists:
        return

    admin_conn = psycopg2.connect(**_connection_kwargs("postgres"))
    admin_conn.autocommit = True
    try:
        with admin_conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (DB_NAME,))
            if cur.fetchone() is None:
                cur.execute(sql.SQL("CREATE DATABASE {};").format(sql.Identifier(DB_NAME)))
    finally:
        admin_conn.close()


def _ensure_table_exists(connection) -> None:
    """Create and upgrade prediction intelligence tables if needed."""
    create_predictions_stmt = """
    CREATE TABLE IF NOT EXISTS job_predictions (
        id SERIAL PRIMARY KEY,
        job_id TEXT,
        title TEXT,
        prediction INT,
        confidence FLOAT,
        reason TEXT,
        reason_tags_json TEXT,
        risk_score FLOAT,
        is_anomaly BOOLEAN DEFAULT FALSE,
        anomaly_reason TEXT,
        suspicious_keywords TEXT,
        domain_pattern TEXT,
        event_timestamp TIMESTAMPTZ,
        cluster_id TEXT,
        version INT DEFAULT 1,
        is_corrected BOOLEAN DEFAULT FALSE,
        original_score FLOAT,
        updated_score FLOAT,
        correction_reason TEXT,
        text_blob TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    alter_statements = [
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS cluster_id TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS original_score FLOAT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS updated_score FLOAT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS correction_reason TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS text_blob TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS reason_tags_json TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS risk_score FLOAT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS anomaly_reason TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS suspicious_keywords TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS domain_pattern TEXT;",
        "ALTER TABLE job_predictions ADD COLUMN IF NOT EXISTS event_timestamp TIMESTAMPTZ;",
    ]

    create_clusters_stmt = """
    CREATE TABLE IF NOT EXISTS job_clusters (
        cluster_id TEXT,
        job_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    create_corrections_stmt = """
    CREATE TABLE IF NOT EXISTS job_corrections (
        job_id TEXT,
        old_score FLOAT,
        new_score FLOAT,
        reason TEXT,
        correction_type TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    correction_alter_statements = [
        "ALTER TABLE job_corrections ADD COLUMN IF NOT EXISTS correction_type TEXT;",
    ]

    create_pipeline_metrics_stmt = """
    CREATE TABLE IF NOT EXISTS pipeline_metrics (
        id SERIAL PRIMARY KEY,
        batch_id BIGINT,
        batch_started_at TIMESTAMPTZ,
        batch_completed_at TIMESTAMPTZ,
        jobs_received INT,
        jobs_inserted INT,
        jobs_failed INT,
        queue_backlog INT DEFAULT 0,
        kafka_lag BIGINT DEFAULT 0,
        spark_batch_time_ms FLOAT DEFAULT 0,
        db_insert_time_ms FLOAT DEFAULT 0,
        throughput_jobs_per_sec FLOAT,
        avg_latency_ms FLOAT,
        error_rate FLOAT,
        fraud_rate FLOAT,
        anomaly_rate FLOAT,
        source TEXT DEFAULT 'spark_stream',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    create_dead_letter_stmt = """
    CREATE TABLE IF NOT EXISTS dead_letter_events (
        id SERIAL PRIMARY KEY,
        job_id TEXT,
        title TEXT,
        prediction INT,
        confidence FLOAT,
        reason TEXT,
        payload_json TEXT,
        retry_count INT DEFAULT 0,
        failure_stage TEXT,
        failure_reason TEXT,
        source TEXT DEFAULT 'spark_stream',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """

    pipeline_metric_alter_statements = [
        "ALTER TABLE pipeline_metrics ADD COLUMN IF NOT EXISTS kafka_lag BIGINT DEFAULT 0;",
        "ALTER TABLE pipeline_metrics ADD COLUMN IF NOT EXISTS spark_batch_time_ms FLOAT DEFAULT 0;",
        "ALTER TABLE pipeline_metrics ADD COLUMN IF NOT EXISTS db_insert_time_ms FLOAT DEFAULT 0;",
    ]

    index_statements = [
        "CREATE INDEX IF NOT EXISTS idx_job_predictions_job_id ON job_predictions(job_id);",
        "CREATE INDEX IF NOT EXISTS idx_job_predictions_cluster_id ON job_predictions(cluster_id);",
        "CREATE INDEX IF NOT EXISTS idx_job_predictions_created_at ON job_predictions(created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_job_predictions_event_ts ON job_predictions(event_timestamp DESC);",
        "CREATE INDEX IF NOT EXISTS idx_job_predictions_anomaly ON job_predictions(is_anomaly, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_job_clusters_cluster_created ON job_clusters(cluster_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_job_corrections_updated_at ON job_corrections(updated_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_created_at ON pipeline_metrics(created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_dead_letter_created_at ON dead_letter_events(created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_dead_letter_job_id ON dead_letter_events(job_id);",
        "CREATE INDEX IF NOT EXISTS idx_dead_letter_stage ON dead_letter_events(failure_stage, created_at DESC);",
    ]

    normalization_statements = [
        "UPDATE job_predictions SET version = COALESCE(version, 1) WHERE version IS NULL;",
        "UPDATE job_predictions SET is_corrected = COALESCE(is_corrected, FALSE) WHERE is_corrected IS NULL;",
        """
        UPDATE job_predictions
        SET original_score = CASE
            WHEN prediction = 1 THEN COALESCE(confidence, 0)
            ELSE GREATEST(0, 1 - COALESCE(confidence, 0))
        END
        WHERE original_score IS NULL;
        """,
        "UPDATE job_predictions SET updated_score = COALESCE(updated_score, original_score) WHERE updated_score IS NULL;",
        "UPDATE job_predictions SET risk_score = COALESCE(risk_score, updated_score, original_score) WHERE risk_score IS NULL;",
        "UPDATE job_predictions SET is_anomaly = COALESCE(is_anomaly, FALSE) WHERE is_anomaly IS NULL;",
        "UPDATE job_corrections SET correction_type = COALESCE(correction_type, 'RISK_INCREASE') WHERE correction_type IS NULL;",
    ]

    with connection.cursor() as cur:
        cur.execute(create_predictions_stmt)
        for statement in alter_statements:
            cur.execute(statement)

        cur.execute(create_clusters_stmt)
        cur.execute(create_corrections_stmt)
        cur.execute(create_pipeline_metrics_stmt)
        cur.execute(create_dead_letter_stmt)
        for statement in correction_alter_statements:
            cur.execute(statement)
        for statement in pipeline_metric_alter_statements:
            cur.execute(statement)

        for statement in index_statements:
            cur.execute(statement)

        for statement in normalization_statements:
            cur.execute(statement)

    connection.commit()


def connect_db() -> pool.SimpleConnectionPool:
    """Return initialized PostgreSQL connection pool."""
    global _POOL, _TABLE_READY

    with _POOL_LOCK:
        if _POOL is None:
            _ensure_database_exists()
            _POOL = pool.SimpleConnectionPool(
                minconn=POOL_MIN_CONN,
                maxconn=POOL_MAX_CONN,
                **_connection_kwargs(DB_NAME),
            )

        if not _TABLE_READY:
            connection = _POOL.getconn()
            try:
                _ensure_table_exists(connection)
                _TABLE_READY = True
            finally:
                _POOL.putconn(connection)

    return _POOL


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        if value is None or value != value:
            return fallback
        return int(value)
    except Exception:
        return fallback


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        if value is None or value != value:
            return fallback
        return float(value)
    except Exception:
        return fallback


def _safe_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _safe_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return fallback


def _clamp_score(score: float) -> float:
    return max(0.0, min(1.0, score))


def _parse_timestamp(value: Any):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value

    try:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _derive_risk_score(prediction: Any, confidence: Any) -> float:
    prediction_value = _safe_int(prediction)
    confidence_value = _clamp_score(_safe_float(confidence))
    if prediction_value == 1:
        return confidence_value
    return _clamp_score(1.0 - confidence_value)


def generate_cluster_id(text_vector: Sequence[float]) -> str:
    """Generate a simple hash-based cluster ID from first vector dimensions."""
    prefix = tuple(round(float(value), 6) for value in list(text_vector)[:20])
    if not prefix:
        return "cluster_0"
    return f"cluster_{abs(hash(prefix))}"


def _fallback_cluster_id(source_text: str) -> str:
    compact = source_text.strip().lower()[:200]
    if not compact:
        return "cluster_0"
    return f"cluster_{abs(hash(compact))}"


def _get_tfidf_vectorizer():
    global _TFIDF, _TFIDF_FAILED

    with _TFIDF_LOCK:
        if _TFIDF is not None:
            return _TFIDF
        if _TFIDF_FAILED:
            return None

        try:
            _, _TFIDF = load_model_and_vectorizer()
            return _TFIDF
        except Exception:
            _TFIDF_FAILED = True
            return None


def _resolve_cluster_id(connection, provided_cluster_id: str | None, text_blob: str | None, title: str | None) -> str:
    source_text = (text_blob or title or "").strip().lower()
    if not source_text:
        return provided_cluster_id or "cluster_0"

    tfidf = _get_tfidf_vectorizer()
    if tfidf is None:
        return provided_cluster_id or _fallback_cluster_id(source_text)

    try:
        source_vector = tfidf.transform([source_text])
    except Exception:
        return provided_cluster_id or _fallback_cluster_id(source_text)

    with connection.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT cluster_id, COALESCE(NULLIF(text_blob, ''), NULLIF(title, ''), '') AS text_value
            FROM job_predictions
            WHERE cluster_id IS NOT NULL
              AND created_at >= NOW() - make_interval(hours => %s)
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (CLUSTER_LOOKBACK_HOURS, CLUSTER_CANDIDATE_LIMIT),
        )
        rows = cur.fetchall()

    candidate_clusters: list[str] = []
    candidate_texts: list[str] = []

    for row in rows:
        cluster_id = _safe_text(row.get("cluster_id"))
        text_value = _safe_text(row.get("text_value"))
        if cluster_id and text_value:
            candidate_clusters.append(cluster_id)
            candidate_texts.append(text_value.lower())

    if candidate_texts:
        try:
            candidate_vectors = tfidf.transform(candidate_texts)
            similarities = cosine_similarity(source_vector, candidate_vectors)[0]
            if similarities.size > 0:
                best_index = int(similarities.argmax())
                best_similarity = float(similarities[best_index])
                if best_similarity >= CLUSTER_SIMILARITY_THRESHOLD:
                    return candidate_clusters[best_index]
        except Exception:
            pass

    if provided_cluster_id:
        return provided_cluster_id

    try:
        dense_vector = source_vector.toarray()[0]
        return generate_cluster_id(dense_vector)
    except Exception:
        return _fallback_cluster_id(source_text)


def _insert_cluster_membership(connection, cluster_id: str, job_id: str) -> None:
    with connection.cursor() as cur:
        cur.execute(
            """
            INSERT INTO job_clusters (cluster_id, job_id)
            VALUES (%s, %s)
            """,
            (cluster_id, job_id),
        )


def _calculate_pressure(connection, cluster_id: str) -> Dict[str, float | int]:
    with connection.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 ELSE 0 END), 0)::int AS count_1h,
                COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '6 hours' THEN 1 ELSE 0 END), 0)::int AS count_6h,
                COALESCE(SUM(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END), 0)::int AS count_24h
            FROM job_clusters
            WHERE cluster_id = %s
            """,
            (cluster_id,),
        )
        row = dict(cur.fetchone() or {})

    count_1h = _safe_int(row.get("count_1h"))
    count_6h = _safe_int(row.get("count_6h"))
    count_24h = _safe_int(row.get("count_24h"))
    pressure_score = math.log(count_24h + 1.0)

    return {
        "count_1h": count_1h,
        "count_6h": count_6h,
        "count_24h": count_24h,
        "pressure_score": pressure_score,
    }


def calculate_pressure(cluster_id: str, connection=None) -> Dict[str, float | int]:
    """Public helper to calculate pressure for one cluster."""
    db_pool = connect_db()
    own_connection = connection is None
    active_connection = connection if connection is not None else db_pool.getconn()

    try:
        return _calculate_pressure(active_connection, cluster_id)
    finally:
        if own_connection:
            db_pool.putconn(active_connection)


def _build_correction_reason(cluster_id: str, pressure: Dict[str, float | int]) -> str:
    count_1h = _safe_int(pressure.get("count_1h"))
    count_24h = _safe_int(pressure.get("count_24h"))
    pressure_score = _safe_float(pressure.get("pressure_score"))

    return (
        "Fraud escalation detected:\n"
        f"- {count_1h} similar jobs detected in 1 hour\n"
        "- Pattern repetition confirmed\n"
        f"- Cluster risk threshold exceeded (cluster={cluster_id}, pressure={pressure_score:.2f}, 24h={count_24h})"
    )


def _get_kafka_producer():
    global _KAFKA_PRODUCER

    if not ENABLE_CORRECTION_KAFKA:
        return None
    if KafkaProducer is None:
        return None

    with _KAFKA_LOCK:
        if _KAFKA_PRODUCER is None:
            try:
                _KAFKA_PRODUCER = KafkaProducer(
                    bootstrap_servers=[server.strip() for server in KAFKA_BOOTSTRAP_SERVERS.split(",") if server.strip()],
                    value_serializer=lambda payload: json.dumps(payload).encode("utf-8"),
                    linger_ms=50,
                )
            except Exception:
                _KAFKA_PRODUCER = False

        if _KAFKA_PRODUCER is False:
            return None

        return _KAFKA_PRODUCER


def emit_correction(
    connection,
    job_id: str,
    old_score: float,
    new_score: float,
    reason: str,
    correction_type: str,
) -> None:
    """Persist correction event and optionally publish it to Kafka."""
    with connection.cursor() as cur:
        cur.execute(
            """
            INSERT INTO job_corrections (job_id, old_score, new_score, reason, correction_type)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (job_id, old_score, new_score, reason, correction_type),
        )

    producer = _get_kafka_producer()
    if producer is not None:
        try:
            producer.send(
                CORRECTION_TOPIC,
                {
                    "job_id": job_id,
                    "old_score": old_score,
                    "new_score": new_score,
                    "reason": reason,
                    "correction_type": correction_type,
                },
            )
        except Exception:
            # Keep DB write successful even when Kafka is unavailable.
            pass


def _apply_retroactive_corrections(connection, cluster_id: str, pressure: Dict[str, float | int]) -> int:
    pressure_score = _safe_float(pressure.get("pressure_score"))
    correction_reason = _build_correction_reason(cluster_id, pressure)
    hard_flip_enabled = pressure_score > HARD_FLIP_THRESHOLD

    with connection.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT job_id, prediction, confidence, original_score, updated_score, is_corrected
            FROM job_predictions
            WHERE cluster_id = %s
            """,
            (cluster_id,),
        )
        rows = cur.fetchall()

    corrected_jobs = 0

    for row in rows:
        job_id = _safe_text(row.get("job_id"))
        if not job_id:
            continue

        base_score = _safe_float(
            row.get("original_score"),
            _derive_risk_score(row.get("prediction"), row.get("confidence")),
        )
        new_score = min(1.0, base_score + (pressure_score * PRESSURE_MULTIPLIER))
        score_delta = new_score - base_score

        if score_delta <= CORRECTION_DELTA_THRESHOLD:
            continue

        previous_score = _safe_float(row.get("updated_score"), base_score)
        previous_prediction = _safe_int(row.get("prediction"))
        next_prediction = 1 if hard_flip_enabled else previous_prediction
        correction_type = "UPGRADE_TO_FRAUD" if hard_flip_enabled and previous_prediction != 1 else "RISK_INCREASE"

        already_corrected = _safe_bool(row.get("is_corrected"), fallback=False)

        if already_corrected and abs(new_score - previous_score) < 1e-9 and previous_prediction == next_prediction:
            continue

        reason_prefix = "UPDATED FRAUD DETECTION" if correction_type == "UPGRADE_TO_FRAUD" else "UPDATED RISK ESCALATION"
        reason_summary = f"{reason_prefix}: {correction_reason.replace(chr(10), ' ')}"

        with connection.cursor() as cur:
            cur.execute(
                """
                UPDATE job_predictions
                SET
                    updated_score = %s,
                    is_corrected = TRUE,
                    version = COALESCE(version, 1) + 1,
                    correction_reason = %s,
                    prediction = %s,
                    reason = %s
                WHERE job_id = %s
                """,
                (new_score, correction_reason, next_prediction, reason_summary, job_id),
            )

        emit_correction(
            connection,
            job_id=job_id,
            old_score=previous_score,
            new_score=new_score,
            reason=correction_reason,
            correction_type=correction_type,
        )
        corrected_jobs += 1

    return corrected_jobs


def insert_pipeline_metric(record: Dict[str, Any], connection=None, commit: bool = True) -> bool:
    """Persist one pipeline metrics row emitted by streaming jobs."""
    db_pool = connect_db()
    own_connection = connection is None
    active_connection = connection if connection is not None else db_pool.getconn()

    try:
        with active_connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pipeline_metrics (
                    batch_id,
                    batch_started_at,
                    batch_completed_at,
                    jobs_received,
                    jobs_inserted,
                    jobs_failed,
                    queue_backlog,
                    kafka_lag,
                    spark_batch_time_ms,
                    db_insert_time_ms,
                    throughput_jobs_per_sec,
                    avg_latency_ms,
                    error_rate,
                    fraud_rate,
                    anomaly_rate,
                    source
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    _safe_int(record.get("batch_id"), fallback=0),
                    _parse_timestamp(record.get("batch_started_at")),
                    _parse_timestamp(record.get("batch_completed_at")),
                    _safe_int(record.get("jobs_received"), fallback=0),
                    _safe_int(record.get("jobs_inserted"), fallback=0),
                    _safe_int(record.get("jobs_failed"), fallback=0),
                    _safe_int(record.get("queue_backlog"), fallback=0),
                    _safe_int(record.get("kafka_lag"), fallback=0),
                    _safe_float(record.get("spark_batch_time_ms"), fallback=0.0),
                    _safe_float(record.get("db_insert_time_ms"), fallback=0.0),
                    _safe_float(record.get("throughput_jobs_per_sec"), fallback=0.0),
                    _safe_float(record.get("avg_latency_ms"), fallback=0.0),
                    _safe_float(record.get("error_rate"), fallback=0.0),
                    _safe_float(record.get("fraud_rate"), fallback=0.0),
                    _safe_float(record.get("anomaly_rate"), fallback=0.0),
                    _safe_text(record.get("source")) or "spark_stream",
                ),
            )

        if commit:
            active_connection.commit()

        return True
    except Exception:
        active_connection.rollback()
        raise
    finally:
        if own_connection:
            db_pool.putconn(active_connection)


def insert_dead_letter(
    record: Dict[str, Any],
    failure_stage: str,
    failure_reason: str,
    retry_count: int = 0,
    source: str = "spark_stream",
    connection=None,
    commit: bool = True,
) -> bool:
    """Persist failed records that exceeded retry policy or could not be queued."""
    db_pool = connect_db()
    own_connection = connection is None
    active_connection = connection if connection is not None else db_pool.getconn()

    payload_json = None
    try:
        payload_json = json.dumps(record, default=str)
    except Exception:
        payload_json = _safe_text(record)

    try:
        with active_connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dead_letter_events (
                    job_id,
                    title,
                    prediction,
                    confidence,
                    reason,
                    payload_json,
                    retry_count,
                    failure_stage,
                    failure_reason,
                    source
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    _safe_text(record.get("job_id")),
                    _safe_text(record.get("title")),
                    _safe_int(record.get("prediction"), fallback=0),
                    _safe_float(record.get("confidence"), fallback=0.0),
                    _safe_text(record.get("reason")),
                    payload_json,
                    max(0, _safe_int(retry_count, fallback=0)),
                    _safe_text(failure_stage) or "unknown_stage",
                    _safe_text(failure_reason) or "unknown_failure",
                    _safe_text(source) or "spark_stream",
                ),
            )

        if commit:
            active_connection.commit()

        return True
    except Exception:
        active_connection.rollback()
        raise
    finally:
        if own_connection:
            db_pool.putconn(active_connection)


def insert_prediction(
    record: Dict[str, Any],
    connection=None,
    commit: bool = True,
    return_record: bool = False,
) -> bool | Dict[str, Any]:
    """Insert one prediction row, then apply cluster pressure and retroactive corrections."""
    db_pool = connect_db()
    own_connection = connection is None
    active_connection = connection if connection is not None else db_pool.getconn()

    prediction_value = _safe_int(record.get("prediction"))
    confidence_value = _clamp_score(_safe_float(record.get("confidence")))

    job_id = _safe_text(record.get("job_id")) or str(uuid.uuid4())
    title = _safe_text(record.get("title"))
    reason = _safe_text(record.get("reason"))

    text_blob = _safe_text(record.get("combined_text")) or _safe_text(record.get("text_blob"))

    version = max(1, _safe_int(record.get("version"), 1))
    is_corrected = _safe_bool(record.get("is_corrected"), fallback=False)

    original_score = _clamp_score(
        _safe_float(record.get("original_score"), _derive_risk_score(prediction_value, confidence_value))
    )
    updated_score = _clamp_score(_safe_float(record.get("updated_score"), original_score))
    risk_score = _clamp_score(_safe_float(record.get("risk_score"), updated_score if updated_score > 0 else original_score))
    is_anomaly = _safe_bool(record.get("is_anomaly"), fallback=False)
    anomaly_reason = _safe_text(record.get("anomaly_reason"))
    suspicious_keywords = _safe_text(record.get("suspicious_keywords"))
    domain_pattern = _safe_text(record.get("domain_pattern"))
    event_timestamp = _parse_timestamp(record.get("event_timestamp"))
    reason_tags_json = record.get("reason_tags_json")
    if reason_tags_json is None and record.get("reason_tags") is not None:
        try:
            reason_tags_json = json.dumps(record.get("reason_tags"))
        except Exception:
            reason_tags_json = None
    reason_tags_json = _safe_text(reason_tags_json)

    provided_cluster_id = _safe_text(record.get("cluster_id"))

    try:
        cluster_id = _resolve_cluster_id(
            active_connection,
            provided_cluster_id=provided_cluster_id,
            text_blob=text_blob,
            title=title,
        )

        with active_connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO job_predictions (
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
                    text_blob
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    job_id,
                    title,
                    prediction_value,
                    confidence_value,
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
                    _safe_text(record.get("correction_reason")),
                    text_blob,
                ),
            )

        _insert_cluster_membership(active_connection, cluster_id=cluster_id, job_id=job_id)
        pressure = _calculate_pressure(active_connection, cluster_id=cluster_id)
        corrected_jobs = _apply_retroactive_corrections(active_connection, cluster_id=cluster_id, pressure=pressure)

        with active_connection.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
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
                WHERE job_id = %s
                """,
                (job_id,),
            )
            persisted = dict(cur.fetchone() or {})

        persisted["pressure_score"] = _safe_float(pressure.get("pressure_score"))
        persisted["pressure_count_24h"] = _safe_int(pressure.get("count_24h"))
        persisted["corrected_jobs"] = corrected_jobs

        if commit:
            active_connection.commit()

        if return_record:
            return persisted

        return True
    except Exception:
        active_connection.rollback()
        raise
    finally:
        if own_connection:
            db_pool.putconn(active_connection)
