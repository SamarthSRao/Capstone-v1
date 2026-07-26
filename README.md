# Capstone v1 — Uncertainty-Aware Cloud Autoscaling

Capstone v1 is a microservices-based system for **cloud workload forecasting and autoscaling** using an uncertainty-aware HybridTimeNet pipeline.

The project combines:
- a Python gRPC predictor for probabilistic workload forecasts,
- a Go orchestrator that converts forecast uncertainty into server counts,
- a Go simulator that emulates incoming traffic and SLA behavior,
- a **NexusGear e-commerce API** backed by PostgreSQL to generate realistic checkout load,
- React dashboards for visualization.

## Problem Focus

Traditional deterministic forecasting often causes over-provisioning or SLA violations during traffic volatility. This project uses probabilistic forecasting and queueing-based scaling logic to make safer provisioning decisions. The NexusGear storefront provides a live workload source — real checkout traffic flows through the API and feeds the autoscaling loop.

## Architecture

Core runtime services (from `docker-compose.yml`):

| Service | Path | Port | Role |
|---|---|---|---|
| **predictor** | `services/load-predictor` | `50051` (gRPC) | Probistic workload inference |
| **orchestrator** | `services/orchestrator` | `8082` | Scaling decisions via Erlang-C |
| **simulator** | `services/simulator` | `8083` | Workload + SLA simulation |
| **dashboard** | `services/dashboard` | `3000` | Control center + telemetry graphs |
| **api** | `services/api` | `8080` | NexusGear e-commerce backend |
| **nexusgear-db** | PostgreSQL (`postgres:15-alpine`) | `5432` | Product catalog + orders |

### End-to-end flow

1. Users browse products and check out via the NexusGear API (`/api/products`, `/api/checkout`).
2. Checkout traffic is reflected in the simulator's active RPS tracker.
3. The simulator sends recent request history to the orchestrator (`POST /scale`).
4. The orchestrator requests a prediction from the predictor over gRPC.
5. The predictor returns mean and uncertainty bounds (RL-tuned upper bound).
6. The orchestrator applies Erlang-C logic to decide required server count.
7. When `env_id` and `deployment_name` are provided, the orchestrator can scale a live deployment via the Zopdev API.
8. The simulator scales active servers and tracks SLA violations.
9. The dashboard visualizes actual load, predicted bounds, and provisioned servers.

## NexusGear E-Commerce API

The Go API in `services/api` connects to PostgreSQL and exposes a CORS-enabled REST surface for the storefront and load tests.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | List all products (id, name, category, price, stock) |
| `POST` | `/api/checkout` | Place an order; decrements stock in a transaction |
| `GET` | `/health` | Health check |

**Checkout request body:**

```json
{
  "product_id": 1,
  "quantity": 1,
  "session_id": "abc123"
}
```

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://nexus:nexusgear123@localhost:5432/nexusgear?sslmode=disable` | PostgreSQL connection string |

The database expects `products` and `orders` tables. Seed the catalog before running the API (see local setup below).

## Repository Structure

```text
.
├── docker-compose.yml
├── protos/
├── services/
│   ├── api/                  # NexusGear e-commerce backend (Go + PostgreSQL)
│   ├── load-predictor/       # HybridTimeNet gRPC predictor
│   ├── orchestrator/         # Erlang-C scaling + Zopdev integration
│   ├── simulator/
│   ├── dashboard/
│   ├── prom-dashboard/
│   └── prometheus-ui/
├── hybrid_time_net/
└── sprints/
```

## Getting Started

### Prerequisites

- Docker + Docker Compose
- Go 1.25+ (for local service runs)
- Python (for predictor development)
- Node.js and npm (for dashboard / storefront development)
- PostgreSQL 15 (local container or managed instance)

### Run with Docker Compose

From repository root:

```bash
docker compose up --build
```

Expected service ports:

| Service | URL |
|---|---|
| Dashboard | `http://localhost:3000` |
| Orchestrator | `http://localhost:8082` |
| Simulator | `http://localhost:8083` |
| NexusGear API | `http://localhost:8080` |
| Predictor gRPC | `localhost:50051` |
| PostgreSQL | `localhost:5432` |

### Run the E-Commerce API locally

1. Start PostgreSQL with the NexusGear database:

```bash
docker run -d --name nexusgear-db \
  -e POSTGRES_USER=nexus \
  -e POSTGRES_PASSWORD=nexusgear123 \
  -e POSTGRES_DB=nexusgear \
  -p 5432:5432 \
  postgres:15-alpine
```

2. Create and seed the schema (connect with `psql -U nexus -d nexusgear`):

```sql
CREATE TABLE products (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT,
  base_price  NUMERIC(10,2) NOT NULL,
  description TEXT,
  stock       INT NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id          SERIAL PRIMARY KEY,
  product_id  INT REFERENCES products(id),
  quantity    INT NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL,
  total       NUMERIC(10,2) NOT NULL,
  session_id  TEXT,
  status      TEXT DEFAULT 'confirmed',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

3. Start the API:

```bash
cd services/api
go run .
```

4. Verify:

```bash
curl http://localhost:8080/health
curl http://localhost:8080/api/products
```

## Notes

- `Project_Phase_1_Detailed_Report.md` contains detailed phase documentation.
- `ecommerce_load_test.jmx` and planned Locust scripts drive load against `/api/checkout`.
- `sprints/Sprint_Plan_Demo_Architecture.md` describes the dual-monitor demo (control dashboard + live storefront).
- Additional UI prototypes exist in `services/prom-dashboard` and `services/prometheus-ui`.
