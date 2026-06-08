# Docker Setup — Fake Job Detector

Runs the complete pipeline with a single command on any machine with Docker installed. No Java, Kafka, PostgreSQL, or Spark required on the host.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          fraud-net (bridge)                         │
│                                                                     │
│  ┌─────────────┐     ┌──────────────────────────────────────────┐  │
│  │  job-producer│────▶│          kafka (KRaft, port 9092)        │  │
│  │  (profile)  │     └──────────────────┬───────────────────────┘  │
│  └─────────────┘                        │ readStream                │
│                                         ▼                           │
│                          ┌─────────────────────────┐               │
│                          │   spark-master (:7077)   │               │
│                          │   spark-worker (:8081)   │               │
│                          │   spark-stream (driver)  │               │
│                          │   ML inference via UDF   │               │
│                          └────────────┬────────────┘               │
│                                       │ foreachBatch                │
│                                       ▼                             │
│                          ┌────────────────────────┐                │
│                          │  postgres (:5432)       │                │
│                          │  job_predictions        │                │
│                          │  pipeline_metrics       │                │
│                          │  dead_letter_events     │                │
│                          └────────────┬───────────┘                │
│                                       │ SQL queries                 │
│                                       ▼                             │
│                          ┌────────────────────────┐                │
│                          │  fraud-api (:8000)      │                │
│                          │  REST + WebSocket       │                │
│                          └────────────┬───────────┘                │
│                                       │ HTTP / WS                   │
│                                       ▼                             │
│                          ┌────────────────────────┐                │
│                          │  dashboard (:3000)      │                │
│                          │  Next.js (browser →     │                │
│                          │  localhost:8000)         │                │
│                          └────────────────────────┘                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

| Requirement | Minimum version |
|-------------|----------------|
| Docker Engine | 24.x |
| Docker Compose (V2) | 2.20+ |
| RAM (host) | 6 GB available |
| Disk | 10 GB (images + volumes) |

**Nothing else.** Java, Kafka, PostgreSQL, and Spark run entirely inside containers.

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repo-url>
cd bigdata

# 2. Create your .env from the example — SET A REAL PASSWORD
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD to something strong

# 3. Build images and start all services
docker compose up --build

# 4. Open the dashboard
open http://localhost:3000

# 5. (Optional) Stream real job events into Kafka
docker compose --profile producer up job-producer
```

The first `docker compose up --build` takes 5–10 minutes while images are built and the Spark Kafka JAR is downloaded. Subsequent starts are fast because build layers and the `.ivy2` Maven cache are reused.

---

## Service Inventory

| Container | Image | Port(s) | Role |
|-----------|-------|---------|------|
| `fraud-postgres` | `postgres:16-alpine` | 5432 | Prediction store |
| `fraud-kafka` | `bitnami/kafka:3.7` | 9094 (host) | KRaft message broker |
| `fraud-spark-master` | `fraud-spark:latest` | 7077, 8080 | Spark standalone master |
| `fraud-spark-worker` | `fraud-spark:latest` | 8081 | Spark executor node |
| `fraud-spark-stream` | `fraud-spark:latest` | 4040 | Streaming driver |
| `fraud-api` | `fraud-api:latest` | 8000 | FastAPI REST + WS |
| `fraud-dashboard` | `fraud-dashboard:latest` | 3000 | Next.js UI |
| `fraud-producer` | `fraud-producer:latest` | — | CSV → Kafka (optional) |

---

## Port Map

| Port | Service | Access from browser |
|------|---------|---------------------|
| 3000 | Dashboard | `http://localhost:3000` |
| 8000 | FastAPI docs | `http://localhost:8000/docs` |
| 8000 | Health check | `http://localhost:8000/health` |
| 8080 | Spark Master UI | `http://localhost:8080` |
| 8081 | Spark Worker UI | `http://localhost:8081` |
| 4040 | Spark Driver UI | `http://localhost:4040` |
| 9094 | Kafka (external) | `localhost:9094` |
| 5432 | PostgreSQL | `localhost:5432` |

---

## Volumes

| Volume | Contents | Persists across `down`? |
|--------|----------|------------------------|
| `postgres_data` | All database tables and indexes | YES |
| `kafka_data` | Kafka log segments and metadata | YES |
| `spark_ivy_cache` | Maven JARs (.ivy2 cache) | YES |
| `spark_checkpoints` | Spark Structured Streaming offsets | YES |
| `spark_logs` | Spark driver and executor logs | YES |

To wipe all state and start fresh:
```bash
docker compose down -v
```

---

## Spark Cluster Mode

The pipeline runs a **real Spark Standalone Cluster** inside Docker:

- `spark-master` — coordinates job scheduling
- `spark-worker` — executes Python UDFs and ML inference
- `spark-stream` — the streaming driver that submits the job to the cluster

The worker uses the **same custom Docker image** as the driver so that Python UDFs (scikit-learn, psycopg2, kafka-python) are available on both sides.

To scale workers:
```bash
docker compose up --scale spark-worker=3
```

### Spark Master URL
- In Docker: `SPARK_MASTER_URL=spark://spark-master:7077` (set by compose)
- Local dev (no Docker): `SPARK_MASTER_URL=local[*]` (default)

---

## Running the Producer

The producer is an optional service that replays `fake_job_postings.csv` into Kafka:

```bash
# Start just the producer (Kafka must be healthy first)
docker compose --profile producer up job-producer

# Or run it once and exit
docker compose run --rm job-producer

# Control replay speed (default: 10x real time)
REPLAY_SPEED=50.0 docker compose run --rm job-producer
```

---

## Environment Variables

All configuration lives in `.env`. Copy `.env.example` to `.env` to get started. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | **required** | PostgreSQL password |
| `POSTGRES_USER` | `fraud_user` | PostgreSQL username |
| `POSTGRES_DB` | `fake_jobs_db` | Database name |
| `SPARK_TRIGGER_INTERVAL` | `5 seconds` | Spark micro-batch cadence |
| `SPARK_WORKER_MEMORY` | `1G` | Memory per worker |
| `SPARK_WORKER_CORES` | `2` | vCPUs per worker |
| `REPLAY_SPEED` | `10.0` | Producer replay multiplier |
| `API_PORT` | `8000` | Host port for FastAPI |
| `DASHBOARD_PORT` | `3000` | Host port for dashboard |

---

## Startup Order

Docker Compose waits for health checks before starting dependent services:

```
postgres (healthy) ──────────────────┐
                                     ▼
kafka (healthy) ─────────────────────┤
                                     ▼
spark-master (healthy) ──────────────┤
                                     ▼
spark-worker (started) ──────────────┤
                                     ▼
spark-stream ────────────────────────┘

postgres (healthy) + kafka (healthy) → fraud-api (healthy) → dashboard
```

---

## Troubleshooting

### `POSTGRES_PASSWORD must be set in .env`
```bash
cp .env.example .env
# Edit .env and set a real POSTGRES_PASSWORD
```

### Kafka health check fails / times out
Kafka KRaft initialization takes 30–60 seconds on first start. Compose will retry. If it consistently fails:
```bash
docker compose logs kafka
docker compose restart kafka
```

### Spark stream exits immediately
The driver exits if it cannot connect to Kafka or PostgreSQL. Check:
```bash
docker compose logs spark-stream
# Verify dependencies are healthy
docker compose ps
```

### Dashboard shows blank / `ERR_CONNECTION_REFUSED`
The browser fetches the API at `localhost:8000`. Verify the API is up:
```bash
curl http://localhost:8000/health
```
If the container is up but curl fails, check `API_PORT` in `.env`.

### Spark JAR download hangs on first start
The Spark Kafka connector JAR is downloaded from Maven Central on first run. It requires internet access. Subsequent starts use the `spark_ivy_cache` volume. To pre-warm manually:
```bash
docker compose up spark-master spark-worker
# Then start spark-stream — it will download the JAR once and cache it
docker compose up spark-stream
```

### Reset everything
```bash
docker compose down -v      # removes containers AND volumes
docker compose up --build   # rebuilds all images
```

---

## Security Notes

- `POSTGRES_PASSWORD` has no default — the compose file will refuse to start without it (`:?` syntax).
- No service passwords are hardcoded in any Python file; all credentials come from `DATABASE_URL` or `PG*` env vars.
- All containers run as non-root users (uid 1001 for Spark, `appuser` for API, `nextjs` for dashboard, `producer` for the producer).
- The `.env` file is listed in `.gitignore` and must never be committed.

---

## Windows Notes

The Docker setup replaces `start_system.py` and `run_spark_stream.ps1` entirely. Those files remain in the repository for local (non-Docker) development on Windows but are **not used** when running via Docker Compose.
