import os
import socket
import subprocess
import sys
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent / "fake_job_detector"
FRONTEND_DIR = BASE_DIR / "dashboard"

POSTGRES_BIN = Path(os.getenv("POSTGRES_BIN", r"D:\bigdata\tools\pgsql\bin\pg_ctl.exe"))
POSTGRES_DATA = Path(os.getenv("POSTGRES_DATA", r"D:\bigdata\tools\pgsql\data"))

KAFKA_HOME = Path(os.getenv("KAFKA_HOME", "")).resolve() if os.getenv("KAFKA_HOME") else None

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
FRONTEND_PORT = int(os.getenv("FRONTEND_PORT", "3000"))
ZOOKEEPER_PORT = int(os.getenv("ZOOKEEPER_PORT", "2181"))
KAFKA_PORT = int(os.getenv("KAFKA_PORT", "9092"))
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))


def check_port(port: int, host: str = "127.0.0.1", timeout: float = 1.0) -> bool:
    with socket.socket() as sock:
        sock.settimeout(timeout)
        try:
            sock.connect((host, port))
            return True
        except OSError:
            return False


def wait_for_port(port: int, service_name: str, timeout_seconds: int = 60) -> bool:
    started = time.time()
    while time.time() - started < timeout_seconds:
        if check_port(port):
            print(f"[OK] {service_name} is reachable on port {port}")
            return True
        time.sleep(1)

    print(f"[ERROR] {service_name} did not become ready on port {port} within {timeout_seconds}s")
    return False


def run_shell(command: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(command, cwd=str(cwd) if cwd else None, shell=True, text=True, capture_output=True)


def open_new_terminal(command: str, cwd: Path | None = None) -> subprocess.Popen:
    creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    return subprocess.Popen(
        ["cmd.exe", "/k", command],
        cwd=str(cwd) if cwd else None,
        creationflags=creationflags,
    )


def ensure_workspace_paths() -> None:
    if not BASE_DIR.exists():
        raise RuntimeError(f"Missing project directory: {BASE_DIR}")

    if not FRONTEND_DIR.exists():
        raise RuntimeError(f"Missing frontend directory: {FRONTEND_DIR}")


def ensure_kafka_home() -> Path:
    if KAFKA_HOME is None:
        raise RuntimeError("KAFKA_HOME is not set. Point it to your Kafka installation root.")

    if not KAFKA_HOME.exists():
        raise RuntimeError(f"KAFKA_HOME does not exist: {KAFKA_HOME}")

    zookeeper_bat = KAFKA_HOME / "bin" / "windows" / "zookeeper-server-start.bat"
    kafka_bat = KAFKA_HOME / "bin" / "windows" / "kafka-server-start.bat"

    if not zookeeper_bat.exists() or not kafka_bat.exists():
        raise RuntimeError(
            "Kafka scripts not found under KAFKA_HOME\\bin\\windows. "
            "Expected zookeeper-server-start.bat and kafka-server-start.bat."
        )

    return KAFKA_HOME


def start_postgres() -> None:
    print("[STEP] Starting PostgreSQL")

    if check_port(POSTGRES_PORT):
        print("[OK] PostgreSQL is already running")
        return

    if not POSTGRES_BIN.exists():
        raise RuntimeError(f"PostgreSQL binary not found: {POSTGRES_BIN}")

    if not POSTGRES_DATA.exists():
        raise RuntimeError(f"PostgreSQL data directory not found: {POSTGRES_DATA}")

    result = run_shell(f'"{POSTGRES_BIN}" -D "{POSTGRES_DATA}" start')

    if result.returncode != 0 and "already running" not in (result.stdout + result.stderr).lower():
        raise RuntimeError(f"Failed to start PostgreSQL. stdout={result.stdout} stderr={result.stderr}")

    if not wait_for_port(POSTGRES_PORT, "PostgreSQL", timeout_seconds=45):
        raise RuntimeError("PostgreSQL failed health check")


def start_zookeeper_and_kafka() -> None:
    kafka_home = ensure_kafka_home()

    zookeeper_bat = kafka_home / "bin" / "windows" / "zookeeper-server-start.bat"
    zookeeper_cfg = kafka_home / "config" / "zookeeper.properties"

    kafka_bat = kafka_home / "bin" / "windows" / "kafka-server-start.bat"
    kafka_cfg = kafka_home / "config" / "server.properties"

    if not check_port(ZOOKEEPER_PORT):
        print("[STEP] Starting Zookeeper")
        zookeeper_cmd = f'set KAFKA_HEAP_OPTS=-Xmx512M -Xms512M && "{zookeeper_bat}" "{zookeeper_cfg}"'
        open_new_terminal(zookeeper_cmd, cwd=kafka_home)
        if not wait_for_port(ZOOKEEPER_PORT, "Zookeeper", timeout_seconds=90):
            raise RuntimeError("Zookeeper failed to start")
    else:
        print("[OK] Zookeeper is already running")

    if not check_port(KAFKA_PORT):
        print("[STEP] Starting Kafka broker")
        kafka_cmd = f'set KAFKA_HEAP_OPTS=-Xmx768M -Xms512M && "{kafka_bat}" "{kafka_cfg}"'
        open_new_terminal(kafka_cmd, cwd=kafka_home)
        if not wait_for_port(KAFKA_PORT, "Kafka", timeout_seconds=120):
            raise RuntimeError("Kafka broker failed to start")
    else:
        print("[OK] Kafka broker is already running")


def start_spark_stream() -> None:
    print("[STEP] Starting Spark streaming processor")
    spark_cmd = "powershell -ExecutionPolicy Bypass -File .\\run_spark_stream.ps1"
    open_new_terminal(spark_cmd, cwd=BASE_DIR)


def start_backend() -> None:
    print("[STEP] Starting FastAPI backend")
    backend_cmd = (
        "if exist venv\\Scripts\\activate.bat (call venv\\Scripts\\activate.bat) "
        f"&& \"{sys.executable}\" -m uvicorn api.app:app --host 127.0.0.1 --port {BACKEND_PORT} --reload"
    )
    open_new_terminal(backend_cmd, cwd=BASE_DIR)

    if not wait_for_port(BACKEND_PORT, "FastAPI", timeout_seconds=60):
        raise RuntimeError("FastAPI failed to start")


def start_frontend() -> None:
    print("[STEP] Starting Next.js dashboard")
    frontend_cmd = "npm run dev"
    open_new_terminal(frontend_cmd, cwd=FRONTEND_DIR)

    if not wait_for_port(FRONTEND_PORT, "Dashboard", timeout_seconds=90):
        print("[WARN] Dashboard port not ready yet; Next.js may still be compiling")


def print_summary() -> None:
    print("=" * 64)
    print("Tier-0 pipeline startup sequence completed")
    print("PostgreSQL : 127.0.0.1:5432")
    print("Zookeeper  : 127.0.0.1:2181")
    print("Kafka      : 127.0.0.1:9092")
    print(f"FastAPI    : http://127.0.0.1:{BACKEND_PORT}/docs")
    print(f"Dashboard  : http://127.0.0.1:{FRONTEND_PORT}")
    print("Spark      : running in a dedicated terminal window")
    print("=" * 64)


def main() -> None:
    print("Starting full production pipeline...")

    try:
        ensure_workspace_paths()
        start_postgres()
        start_zookeeper_and_kafka()
        start_spark_stream()
        time.sleep(5)
        start_backend()
        start_frontend()
        print_summary()
        print("Press Ctrl+C to exit this orchestrator. Child service windows stay open.")

        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Orchestrator interrupted by user")
    except Exception as exc:
        print(f"[FATAL] {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
