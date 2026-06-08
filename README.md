<div align="center">

# 🔍 Real-Time Fake Job Detector

**A production-grade streaming data pipeline that detects fraudulent job postings in real time.**

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-3.8-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)](https://kafka.apache.org)
[![Apache Spark](https://img.shields.io/badge/Apache_Spark-3.5.3-E25A1C?style=for-the-badge&logo=apachespark&logoColor=white)](https://spark.apache.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

[Features](#-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [ML Model](#-ml-model-performance) • [API Docs](#-api-reference) • [Contributing](#-contributing)

</div>

---

## 📌 Overview

Job boards are flooded with fraudulent postings designed to steal personal data or money. This system automatically flags fake jobs **the moment they are posted** — no manual review required.

Every job posting flows through a Kafka queue → Spark ML pipeline → PostgreSQL → FastAPI → live Next.js dashboard. Fraud decisions happen in under **5 seconds** with **100% precision** (zero false alarms).

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| ⚡ **Real-time streaming** | Kafka → Spark micro-batches every 5 seconds |
| 🤖 **ML inference at scale** | TF-IDF + Random Forest UDF runs across Spark workers |
| 📈 **Anomaly detection** | EMA-based spike detection flags unusual fraud surges |
| 🔗 **Fraud clustering** | Cosine similarity groups related fake jobs (≥ 0.8 threshold) |
| ✏️ **Human corrections** | Manual override system with full correction audit trail |
| 📡 **Live dashboard** | WebSocket-powered Next.js frontend with real-time charts |
| 🪦 **Dead letter queue** | Failed events captured for manual investigation |
| 🐳 **One-command deploy** | Full Docker Compose stack — 7 services, one command |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA FLOW                                    │
│                                                                   │
│  CSV Dataset                                                      │
│      │                                                            │
│      ▼                                                            │
│  ┌──────────────┐     ┌──────────────────┐                       │
│  │ Kafka        │────►│  Kafka Topic     │                       │
│  │ Producer     │     │  (jobs)          │                       │
│  └──────────────┘     └────────┬─────────┘                       │
│                                │                                  │
│                                ▼                                  │
│                  ┌─────────────────────────┐                     │
│                  │  Spark Structured       │                     │
│                  │  Streaming              │                     │
│                  │  ├─ TF-IDF + RF model   │                     │
│                  │  ├─ Anomaly detection   │                     │
│                  │  └─ Fraud clustering    │                     │
│                  └────────────┬────────────┘                     │
│                               │                                   │
│                               ▼                                   │
│                  ┌─────────────────────────┐                     │
│                  │     PostgreSQL           │                     │
│                  │  ├─ job_predictions      │                     │
│                  │  ├─ job_clusters         │                     │
│                  │  ├─ job_corrections      │                     │
│                  │  └─ pipeline_metrics     │                     │
│                  └────────────┬────────────┘                     │
│                               │                                   │
│                               ▼                                   │
│                  ┌─────────────────────────┐                     │
│                  │  FastAPI                 │                     │
│                  │  REST + WebSocket        │                     │
│                  └────────────┬────────────┘                     │
│                               │                                   │
│                               ▼                                   │
│                  ┌─────────────────────────┐                     │
│                  │  Next.js Dashboard       │                     │
│                  │  Live charts & alerts    │                     │
│                  └─────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### Services

| Service | Image | Port | Role |
|---------|-------|------|------|
| `fraud-postgres` | postgres:16-alpine | 5432 | Predictions database |
| `fraud-kafka` | apache/kafka:3.8 | 9092 | KRaft message broker |
| `fraud-spark-master` | custom | 7077 / 8080 | Spark cluster coordinator |
| `fraud-spark-worker` | custom | 8081 | ML inference executor |
| `fraud-spark-stream` | custom | 4040 | Streaming driver |
| `fraud-api` | custom | 8000 | FastAPI REST + WebSocket |
| `fraud-dashboard` | custom | 3001 | Next.js frontend |

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop 24+ 
- 6 GB RAM available
- 10 GB free disk space

```bash
# 1. Clone the repo
git clone https://github.com/Veladicodes/Realtime-Fake-Job-Predictor.git
cd Realtime-Fake-Job-Predictor

# 2. Set up environment
cp .env.example .env
# ⚠️  Edit .env and set a strong POSTGRES_PASSWORD

# 3. Launch everything
docker compose up --build
```

| Service | URL |
|---------|-----|
| 📊 Live Dashboard | http://localhost:3001 |
| 📖 API Docs (Swagger) | http://localhost:8000/docs |
| ⚡ Spark Master UI | http://localhost:8080 |
| 🔧 Spark Worker UI | http://localhost:8081 |

```bash
# Stop everything
docker compose down

# Also start the Kafka CSV producer (streams dataset into pipeline)
docker compose --profile producer up
```

### Windows Local Dev (no Docker)

```bash
cd fake_job_detector
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
python ../start_system.py
```

---

## 🤖 ML Model Performance

Trained on the [Kaggle Fake Job Postings dataset](https://www.kaggle.com/datasets/shivamb/real-or-fake-fake-jobposting-prediction) — **17,880 job postings**, 866 fraudulent (4.8%).

<div align="center">

| Metric | Score |
|--------|-------|
| ✅ Accuracy | **98.0%** |
| 🎯 Precision | **100%** |
| 🔍 Recall | **60.2%** |
| ⚖️ F1-Score | **75.2%** |

</div>

**Model selected: Random Forest** (beat Logistic Regression on F1-score)

> **100% Precision** means zero false alarms — every job the model flags as fake is genuinely fraudulent. The trade-off is 60% recall: it misses ~40% of fakes, but never incorrectly flags a real job.

### How the model works

1. **Text preprocessing** — job title + company profile + description + requirements are combined and cleaned
2. **TF-IDF vectorization** — converts text into 5,000 numerical features (rare, distinctive words score highest)
3. **Feature engineering** — adds `has_company_profile`, `has_salary_range`, `text_length`
4. **Random Forest** — 100 decision trees vote on the final prediction

To retrain from scratch:
```bash
cd fake_job_detector
python ml/train_model.py
```

---

## 📡 API Reference

Base URL: `http://localhost:8000`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | System health (Kafka, Spark, DB, ML status) |
| `GET` | `/dashboard` | Aggregated stats snapshot |
| `GET` | `/jobs/latest` | Last 50 processed predictions |
| `GET` | `/jobs/fake` | All flagged fake jobs |
| `GET` | `/alerts` | Top alerts sorted by risk score |
| `GET` | `/trends` | Hourly fake/real job trend (24h window) |
| `GET` | `/clusters/top` | High-pressure fraud clusters |
| `GET` | `/corrections` | Manual human overrides |
| `POST` | `/jobs/ingest` | Submit a new job posting for analysis |
| `WS` | `/ws` | WebSocket — live prediction stream |

Full interactive docs: **http://localhost:8000/docs**

---

## 📁 Project Structure

```
Realtime-Fake-Job-Predictor/
├── docker-compose.yml              # Orchestrates all 7 services
├── .env.example                    # Environment variable template
├── start_system.py                 # Windows local dev launcher
├── DOCKER_SETUP.md                 # Detailed Docker guide
│
└── fake_job_detector/
    ├── api/                        # FastAPI backend
    │   ├── Dockerfile
    │   └── app.py                  # REST endpoints + WebSocket
    │
    ├── dashboard/                  # Next.js real-time frontend
    │   ├── app/                    # Pages: dashboard, alerts, analytics, trends
    │   ├── components/             # UI components
    │   ├── context/                # Dashboard state (WebSocket + polling)
    │   └── services/               # API client
    │
    ├── kafka/                      # Kafka CSV replay producer
    │   └── producer.py
    │
    ├── ml/                         # Model training pipeline
    │   ├── preprocess.py
    │   ├── train_model.py
    │   └── saved_model/            # fraud_model.pkl + tfidf.pkl
    │
    ├── spark/                      # Spark Structured Streaming job
    │   ├── spark_stream.py         # Main streaming driver
    │   ├── model_loader.py         # ML inference UDF
    │   └── Dockerfile
    │
    ├── utils/                      # DB writer, config, helpers
    └── data/raw/                   # fake_job_postings.csv (17,880 rows)
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | *(required)* | Database password |
| `SPARK_TRIGGER_INTERVAL` | `5 seconds` | Spark micro-batch cadence |
| `SPARK_MAX_OFFSETS_PER_TRIGGER` | `700` | Records per Spark batch |
| `ANOMALY_EMA_ALPHA` | `0.2` | EMA smoothing factor |
| `ANOMALY_SPIKE_MULTIPLIER` | `2.2` | Spike threshold multiplier |
| `DASHBOARD_PORT` | `3001` | Host port for Next.js dashboard |
| `REPLAY_SPEED` | `10.0` | CSV replay speed (10x = 10× faster) |
| `MAX_KAFKA_LAG` | `5000` | Producer throttle threshold |

See [`.env.example`](.env.example) for the full list.

---

## 🧪 Load Testing

```bash
python fake_job_detector/load_test.py \
  --total-events 10000 \
  --concurrency 40 \
  --api-base-url http://127.0.0.1:8000
```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push and open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**If you found this useful, please consider giving it a ⭐**

</div>
