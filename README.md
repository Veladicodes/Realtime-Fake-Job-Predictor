# Real-Time Fake Job Detector

A production-grade streaming data pipeline that detects fraudulent job postings in real time using Apache Kafka, Apache Spark, and a trained Machine Learning model — all wired together with a live Next.js dashboard.

---

## Architecture

```
CSV Dataset
    │
    ▼
Kafka Producer ──► Kafka Topic (jobs)
                        │
                        ▼
              Spark Structured Streaming
              ├─ TF-IDF + Random Forest ML inference
              ├─ Anomaly detection (EMA-based spike detection)
              └─ Fraud cluster analysis (cosine similarity)
                        │
                        ▼
                  PostgreSQL Database
                        │
                        ▼
              FastAPI (REST + WebSocket)
                        │
                        ▼
              Next.js Dashboard (live charts, alerts)
```

**Tech Stack:** Python · Apache Kafka · Apache Spark (PySpark) · scikit-learn · PostgreSQL · FastAPI · Next.js 16 · Docker

---

## ML Model Performance

Trained on the [Kaggle Fake Job Postings dataset](https://www.kaggle.com/datasets/shivamb/real-or-fake-fake-jobposting-prediction) (17,880 rows).

| Metric    | Score  |
|-----------|--------|
| Accuracy  | 98.0%  |
| Precision | 100%   |
| Recall    | 60.2%  |
| F1-Score  | 75.2%  |

Model selected: **Random Forest** (beat Logistic Regression on F1). Zero false positives — every job the model flags as fake is genuinely fake.

---

## Project Structure

```
.
├── docker-compose.yml          # Orchestrates all 7 services
├── .env.example                # Copy to .env and fill in values
├── start_system.py             # Windows local dev launcher (non-Docker)
├── DOCKER_SETUP.md             # Detailed Docker setup guide
│
└── fake_job_detector/
    ├── api/                    # FastAPI backend (REST + WebSocket)
    │   ├── Dockerfile
    │   └── app.py
    ├── dashboard/              # Next.js real-time frontend
    │   ├── Dockerfile
    │   ├── app/                # Pages: dashboard, alerts, analytics, trends
    │   ├── components/
    │   ├── context/
    │   └── services/
    ├── kafka/                  # Kafka CSV replay producer
    │   ├── Dockerfile
    │   └── producer.py
    ├── ml/                     # Model training pipeline
    │   ├── train_model.py
    │   ├── preprocess.py
    │   └── saved_model/        # fraud_model.pkl + tfidf.pkl
    ├── spark/                  # Spark Structured Streaming job
    │   ├── Dockerfile
    │   ├── docker-entrypoint.sh
    │   ├── spark_stream.py
    │   └── model_loader.py
    ├── utils/                  # DB writer, helpers
    ├── data/
    │   └── raw/
    │       └── fake_job_postings.csv
    ├── requirements-api.txt
    ├── requirements-spark.txt
    └── requirements-producer.txt
```

---

## Quick Start (Docker — recommended)

**Prerequisites:** Docker Desktop 24+, 6 GB RAM free, 10 GB disk space.

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/bigdata.git
cd bigdata

# 2. Create your environment file
cp .env.example .env
# Edit .env — set a strong POSTGRES_PASSWORD at minimum

# 3. Build and start all services
docker compose up --build
```

| Service            | URL                        |
|--------------------|----------------------------|
| Dashboard          | http://localhost:3001       |
| FastAPI docs       | http://localhost:8000/docs  |
| Spark Master UI    | http://localhost:8080       |
| Spark Worker UI    | http://localhost:8081       |

To stop everything:
```bash
docker compose down
```

### Enable the Kafka producer (replay CSV into the pipeline)
```bash
docker compose --profile producer up
```

---

## Running Locally (Windows, no Docker)

```bash
# 1. Create and activate virtual environment
cd fake_job_detector
python -m venv venv
venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start all services (requires PostgreSQL + Kafka installed locally)
python start_system.py
```

---

## Training the ML Model

The trained model artifacts (`fraud_model.pkl`, `tfidf.pkl`) are included in the repo. To retrain from scratch:

```bash
cd fake_job_detector
python ml/train_model.py
```

This will:
1. Load and preprocess `data/raw/fake_job_postings.csv`
2. Train both Logistic Regression and Random Forest
3. Save the best model (by F1-score) to `ml/saved_model/`

---

## Key Features

- **Real-time streaming** — Spark processes Kafka micro-batches every 5 seconds
- **ML inference at scale** — TF-IDF + Random Forest UDF runs on Spark workers
- **Anomaly detection** — EMA-based spike detection flags unusual fraud surges
- **Fraud clustering** — Cosine similarity groups related fake jobs (≥0.8 threshold)
- **Human corrections** — Manual override system with correction tracking
- **Live dashboard** — WebSocket-powered Next.js frontend with charts and alerts
- **Dead letter queue** — Failed events captured for manual investigation

---

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key settings:

| Variable                     | Default                    | Description                        |
|------------------------------|----------------------------|------------------------------------|
| `POSTGRES_PASSWORD`          | *(required)*               | Database password                  |
| `SPARK_TRIGGER_INTERVAL`     | `5 seconds`                | Spark micro-batch cadence          |
| `SPARK_MAX_OFFSETS_PER_TRIGGER` | `700`                   | Records per Spark batch            |
| `DASHBOARD_PORT`             | `3001`                     | Host port for Next.js dashboard    |
| `REPLAY_SPEED`               | `10.0`                     | CSV replay speed multiplier        |

---

## Load Testing

```bash
python fake_job_detector/load_test.py \
  --total-events 10000 \
  --concurrency 40 \
  --api-base-url http://127.0.0.1:8000
```

---

## Dataset

[Real or Fake: Fake Job Posting Prediction](https://www.kaggle.com/datasets/shivamb/real-or-fake-fake-jobposting-prediction) — 17,880 job postings, 866 fraudulent (4.8%).
