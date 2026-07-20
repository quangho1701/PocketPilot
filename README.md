# PocketPilot — AI Personal Budgeting Guide

An AI-powered financial coach with persistent memory that provides proactive, personalized spending guidance. PocketPilot helps users make smarter financial decisions *before* they spend — not just summarize what already happened.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React Native (Expo) |
| Backend | Python (FastAPI) |
| Database | CockroachDB (Postgres-compatible) |
| AI/LLM | Amazon Bedrock (Bedrock Agents) |
| Vector Store | CockroachDB Distributed Vector Indexing |
| Deployment | Docker, AWS Lambda / ECS Fargate |

## Project Structure

```
PocketPilot/
├── backend/               # FastAPI Python API
│   ├── app/
│   │   ├── main.py        # App entry point
│   │   ├── config.py      # Environment config
│   │   ├── database.py    # DB connection
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── routers/       # HTTP route handlers (one per feature)
│   │   ├── services/      # Business logic (one per feature)
│   │   └── utils/         # Shared utilities (Bedrock client, etc.)
│   ├── alembic/           # Database migrations
│   ├── Dockerfile
│   └── requirements.txt
└── frontend/              # React Native (Expo) app
    └── src/
        ├── screens/       # App screens (one folder per feature)
        ├── components/    # Shared UI components
        ├── navigation/    # React Navigation setup
        ├── services/      # API client
        └── types/         # TypeScript interfaces
```

## Feature Ownership

| Feature | Owner | Backend | Frontend |
|---------|-------|---------|----------|
| Persistent Memory + Adaptive Learning | Quang | `routers/memory.py` | `screens/memory/` |
| Real-Time Spending Assistant + Insights | Ngu | `routers/assistant.py` | `screens/assistant/` |
| Budget Planning + Goal Simulation | Ha | `routers/budget.py` | `screens/budget/` |
| OCR + Transactions + Dashboard | Hoang Anh | `routers/transactions.py` | `screens/transactions/` |

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker Desktop
- Expo Go app on your phone (or iOS/Android simulator)

### 1. Clone and configure

```bash
git clone <repo-url>
cd PocketPilot
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Fill in your AWS credentials and DB URL in backend/.env
```

### 2. Start the database

```bash
docker compose up cockroachdb -d
```

The CockroachDB Admin UI is available at http://localhost:8080.

### 3. Initialize the database

```bash
# Create the pocketpilot database
docker exec pocketpilot-crdb ./cockroach sql --insecure -e "CREATE DATABASE IF NOT EXISTS pocketpilot;"

# Run migrations
cd backend
pip install -r requirements.txt
alembic upgrade head
```

### 4. Run the backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

API docs available at http://localhost:8000/docs

### 5. Run the frontend

```bash
cd frontend
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android.

### Run everything with Docker

```bash
docker compose up --build
```

## Branching Strategy

- `main` — protected, no direct commits
- `dev` — integration branch for merging features
- Feature branches: `feature/<your-name>/<short-description>`
  - e.g. `feature/quang/memory-endpoints`
  - e.g. `feature/hoang-anh/transaction-crud`

Open a PR to `dev` and get at least one review before merging.

## Useful Commands

| Task | Command |
|------|---------|
| Start DB | `docker compose up cockroachdb -d` |
| Run backend | `cd backend && uvicorn app.main:app --reload` |
| Run frontend | `cd frontend && npx expo start` |
| New migration | `cd backend && alembic revision --autogenerate -m "description"` |
| Apply migrations | `cd backend && alembic upgrade head` |
| Run all (Docker) | `docker compose up --build` |
