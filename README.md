# ChainCheck

On-chain forensics tool for investigating blockchain addresses and tracing transaction flows across multiple chains. Look up any Bitcoin, Ethereum, BSC, or Polygon address to view its transaction history, risk score, entity labels, and fund-flow graph.

## Features

- **Multi-chain address lookup** — BTC (Blockstream), ETH/BSC/Polygon (Etherscan-family APIs)
- **Transaction tracing** — N-hop fund-flow exploration with real-time SSE progress streaming
- **Interactive graph visualization** — Cytoscape.js force-directed graph of address relationships
- **Risk scoring** — Composite risk assessment with sanctions (OFAC SDN), darknet, mixer, and fraud exposure analysis
- **Entity labeling** — Multi-source label enrichment (OpenSanctions, WalletExplorer, ChainAbuse, manual labels)
- **Clustering** — Automatic address clustering with common-input-ownership heuristics
- **Anomaly detection** — Change-address detection, peeling chain analysis, spam filtering
- **Investigation case management** — Save, annotate, and revisit investigations
- **CSV export** — Export trace results for offline analysis
- **Historical pricing** — CoinGecko integration for USD values at time of transaction

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS |
| State | Zustand (UI state), TanStack Query (server state) |
| Visualization | Cytoscape.js, Recharts |
| Backend | Python, FastAPI, SQLAlchemy 2.0 Async, Alembic |
| Database | SQLite (WAL mode) via aiosqlite |
| Rate Limiting | SlowAPI (inbound), aiolimiter (outbound API calls) |
| Precision | Python `Decimal` / JS `BigInt` + ethers.js |

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- API keys for at least one block explorer (see `.env.example`)

## Getting Started

### 1. Clone and configure environment

```bash
git clone https://github.com/your-username/ChainCheck.git
cd ChainCheck
cp .env.example .env
# Edit .env and add your API keys (at minimum ETHERSCAN_API_KEY)
```

### 2. Run with Docker Compose (recommended)

```bash
docker compose up --build
```

- Backend API: http://localhost:8000
- Frontend UI: http://localhost:5173

### 3. Run without Docker

**Backend:**

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**Frontend** (in a separate terminal):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Environment Variables

See `.env.example` for all available configuration. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ETHERSCAN_API_KEY` | Yes (for ETH) | Etherscan API key |
| `BSCSCAN_API_KEY` | Optional | BscScan API key |
| `POLYGONSCAN_API_KEY` | Optional | PolygonScan API key |
| `COINGECKO_API_KEY` | Optional | CoinGecko API key for price data |
| `DATABASE_URL` | No | Defaults to local SQLite |
| `TRACE_MAX_NODES` | No | Max nodes per trace (default: 500) |

## API

The backend exposes a REST API on port 8000 with interactive docs at `/docs` (Swagger UI).

Key endpoints:

- `GET /api/lookup/{chain}/{address}` — Address lookup with transaction history
- `GET /api/trace/{chain}/{address}` — SSE stream for multi-hop tracing
- `GET /api/labels/{chain}/{address}` — Entity labels for an address
- `GET /api/risk/{chain}/{address}` — Risk score breakdown
- `GET /api/prices/history` — Historical price data

## Project Structure

```
ChainCheck/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + lifespan
│   │   ├── config.py            # Pydantic settings
│   │   ├── models/              # SQLAlchemy models
│   │   ├── routers/             # API route handlers
│   │   ├── services/            # Business logic (tracer, risk, clustering)
│   │   └── providers/           # Blockchain API clients (BTC, ETH, BSC, Polygon)
│   ├── alembic/                 # Database migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.tsx              # Main application
│       ├── api/                 # API hooks (TanStack Query)
│       ├── components/          # React components
│       ├── stores/              # Zustand stores
│       └── workers/             # Web Workers for graph layout
├── docker-compose.yml
└── .env.example
```

## License

This project is currently unlicensed. All rights reserved.
