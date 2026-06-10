# Capstone v1 — Uncertainty-Aware Cloud Autoscaling

Capstone v1 is a microservices-based system for **cloud workload forecasting and autoscaling** using an uncertainty-aware HybridTimeNet pipeline.

The project combines:
- a Python gRPC predictor for probabilistic workload forecasts,
- a Go orchestrator that converts forecast uncertainty into server counts,
- a Go simulator that emulates incoming traffic and SLA behavior,
- React dashboards for visualization.

## Problem Focus
Traditional deterministic forecasting often causes over-provisioning or SLA violations during traffic volatility. This project uses probabilistic forecasting and queueing-based scaling logic to make safer provisioning decisions.

## Architecture

Core runtime services (from `docker-compose.yml`):
- **predictor** (`services/load-predictor`) — gRPC inference service on `50051`
- **orchestrator** (`services/orchestrator`) — scaling decision API on `8082`
- **simulator** (`services/simulator`) — workload + SLA simulation on `8083`
- **dashboard** (`services/dashboard`) — frontend dashboard on `3000`

Flow:
1. Simulator sends recent request history to the orchestrator.
2. Orchestrator requests a prediction from the predictor.
3. Predictor returns mean and uncertainty bounds.
4. Orchestrator applies Erlang-C style logic to decide required servers.
5. Simulator scales active servers and tracks SLA violations.
6. Dashboard visualizes system behavior.

## Repository Structure

```text
.
├── docker-compose.yml
├── protos/
├── services/
│   ├── load-predictor/
│   ├── orchestrator/
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
- Node.js and npm (for local dashboard development)
- Go and Python (for service-level local runs)

### Run with Docker Compose
From repository root:

```bash
docker compose up --build
```

Expected service ports:
- Dashboard: `http://localhost:3000`
- Orchestrator: `http://localhost:8082`
- Simulator: `http://localhost:8083`
- Predictor gRPC: `localhost:50051`

## Notes
- `Project_Phase_1_Detailed_Report.md` contains detailed phase documentation.
- `ecommerce_load_test.jmx` is available for load-testing experiments.
- Additional UI prototypes/components exist in `services/prom-dashboard` and `services/prometheus-ui`.
