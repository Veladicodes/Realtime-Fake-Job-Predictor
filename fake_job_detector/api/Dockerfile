# =============================================================================
# fraud-api — FastAPI service
# Build context: fake_job_detector/
# Run:          uvicorn api.app:app --host 0.0.0.0 --port 8000
# =============================================================================

FROM python:3.11-slim AS base

# ---- system dependencies -------------------------------------------------
# gcc + libpq-dev required to compile psycopg2-binary on some archs
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ---- non-root user -------------------------------------------------------
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

WORKDIR /app

# ---- Python dependencies -------------------------------------------------
# Copy only the requirements file first so Docker caches this layer
# independently of application code changes.
COPY requirements-api.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ---- application code ----------------------------------------------------
# Copy the entire fake_job_detector context.
# The FastAPI app imports from spark/, utils/, and ml/ via relative paths
# so WORKDIR must be fake_job_detector/ (= /app here).
COPY . .

# Model artifacts are read-only; ensure correct ownership
RUN chown -R appuser:appuser /app

# ---- runtime -------------------------------------------------------------
USER appuser

EXPOSE 8000

# Health check calls the /health endpoint which returns 200 when DB+Kafka up
HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=5 \
    CMD python -c \
        "import urllib.request, sys; \
         r = urllib.request.urlopen('http://localhost:8000/health', timeout=5); \
         sys.exit(0 if r.status == 200 else 1)" \
    2>/dev/null || exit 1

CMD ["python", "-m", "uvicorn", "api.app:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "1"]
