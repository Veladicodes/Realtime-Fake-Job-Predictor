# =============================================================================
# job-producer — replays fake_job_postings.csv into Kafka topic `jobs`
# Build context: fake_job_detector/
# Run with:  docker compose --profile producer up job-producer
# =============================================================================

FROM python:3.11-slim

# ---- system dependencies ---------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ---- non-root user ---------------------------------------------------------
RUN groupadd -r producer && useradd -r -g producer -d /app producer

WORKDIR /app

# ---- Python dependencies ---------------------------------------------------
COPY requirements-producer.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ---- application code ------------------------------------------------------
COPY kafka/producer.py ./kafka/producer.py

RUN chown -R producer:producer /app

# ---- runtime ---------------------------------------------------------------
USER producer

# Data directory is mounted from the host (see docker-compose volumes)
# Default source file path matches the JOBS_SOURCE_FILE env var in compose
CMD ["python", "kafka/producer.py", \
     "--source", "/app/data/raw/fake_job_postings.csv", \
     "--replay-by-timestamp", \
     "--replay-speed", "10.0"]
