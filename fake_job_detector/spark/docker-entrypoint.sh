#!/bin/bash
set -e

# Ensure writable scratch dirs exist (volume may be root-owned on first run)
mkdir -p /tmp/spark-work /tmp/spark-local
# Ensure ivy cache subdirs exist (volume may be empty on first run)
mkdir -p /app/.ivy2/cache /app/.ivy2/jars 2>/dev/null || true

case "${SPARK_MODE:-}" in
  master)
    exec "$SPARK_HOME/bin/spark-class" org.apache.spark.deploy.master.Master \
      --host  "${SPARK_MASTER_HOST:-spark-master}" \
      --port  "${SPARK_MASTER_PORT:-7077}" \
      --webui-port "${SPARK_MASTER_WEBUI_PORT:-8080}"
    ;;
  worker)
    exec "$SPARK_HOME/bin/spark-class" org.apache.spark.deploy.worker.Worker \
      --cores "${SPARK_WORKER_CORES:-2}" \
      --memory "${SPARK_WORKER_MEMORY:-1G}" \
      --work-dir /tmp/spark-work \
      --webui-port "${SPARK_WORKER_WEBUI_PORT:-8081}" \
      "${SPARK_MASTER_URL:-spark://spark-master:7077}"
    ;;
  *)
    exec "$@"
    ;;
esac
