# =============================================================================
# fraud-spark — shared image for spark-master, spark-worker, spark-stream
# Build context: fake_job_detector/
#
# Roles (controlled by SPARK_MODE env var or entrypoint override):
#   SPARK_MODE=master   → Spark standalone master
#   SPARK_MODE=worker   → Spark standalone worker
#   entrypoint override → spark-stream driver (docker-compose overrides this)
#
# PySpark pip package ships the complete Spark distribution:
#   $SPARK_HOME/bin/spark-class  ← master/worker launcher
#   $SPARK_HOME/jars/            ← all Spark JARs
#   $SPARK_HOME/sbin/            ← management scripts
# =============================================================================

FROM python:3.11-slim

# ---- Java (required by Spark) -----------------------------------------------
# default-jre-headless is version-agnostic: installs the distro's default JRE
# (Java 17 on Debian bookworm, Java 21 on Debian trixie) and creates the
# /usr/lib/jvm/default-java symlink automatically.
RUN apt-get update && apt-get install -y --no-install-recommends \
        default-jre-headless \
        curl \
        procps \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/default-java
ENV PYSPARK_PYTHON=python3

# ---- Python application dependencies ----------------------------------------
# pyspark==3.5.3 is the anchor; it bundles the full Spark 3.5.3 distribution.
# All other packages must be present on both driver and worker so that Python
# UDFs (ML inference, DB writes) execute identically on every node.
COPY requirements-spark.txt /tmp/requirements-spark.txt
RUN pip install --no-cache-dir -r /tmp/requirements-spark.txt \
    && rm /tmp/requirements-spark.txt

# ---- Spark environment -------------------------------------------------------
# PySpark's package directory IS SPARK_HOME — it contains bin/, sbin/, jars/
ENV SPARK_HOME=/usr/local/lib/python3.11/site-packages/pyspark
ENV PATH=${SPARK_HOME}/bin:${SPARK_HOME}/sbin:${PATH}

# ---- Non-root user ----------------------------------------------------------
RUN groupadd -r spark && useradd -r -g spark -u 1001 -d /app spark

# ---- Entrypoint script ------------------------------------------------------
COPY spark/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# ---- Application code -------------------------------------------------------
COPY . /app/
# Pre-create all volume mount dirs so named volumes are initialized with spark
# ownership on first run (Docker copies image dir into empty volume at init time)
RUN mkdir -p /app/.ivy2/cache /app/.ivy2/jars \
             /app/output/checkpoints/jobs_stream \
             /app/output/checkpoints/jobs_window \
             /app/output/logs \
    && chown -R spark:spark /app

WORKDIR /app
USER spark

ENTRYPOINT ["/docker-entrypoint.sh"]
# Default CMD when neither SPARK_MODE nor entrypoint override is used:
CMD ["python", "/app/spark/spark_stream.py"]
