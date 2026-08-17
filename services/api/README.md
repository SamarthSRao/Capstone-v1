# NexusGear API

NexusGear is a robust, performant e-commerce backend built specifically for the Capstone v1 Uncertainty-Aware Cloud Autoscaling project. It provides the core APIs to support a storefront experience, managing the product catalog and processing checkouts.

This API acts as the primary workload generator for the autoscaling system. Real traffic flows through this API, updating a PostgreSQL database and producing a realistic application load that feeds into the autoscaling prediction loop.

## Architecture & Tech Stack

* **Language**: Go (Golang)
* **Database**: PostgreSQL 15
* **Features**:
  * RESTful endpoints for storefront interactions.
  * CORS-enabled for web client integrations.
  * Health check for orchestrator/load balancer monitoring.
  * Transactional checkout logic to manage concurrent stock deductions.

## Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/products` | Retrieve the list of all available products including id, name, category, price, and current stock. |
| `POST` | `/api/checkout` | Process an order. This endpoint handles inventory reduction transactionally. |
| `GET` | `/health` | Lightweight health check endpoint to monitor API uptime. |

### Example Checkout Payload

```json
{
  "product_id": 1,
  "quantity": 1,
  "session_id": "user-session-12345"
}
```

## Local Development & Setup

### Prerequisites
- Go 1.25+
- PostgreSQL (or Docker to run a local instance)

### Database Setup

1. **Start a local PostgreSQL container:**
   ```bash
   docker run -d --name nexusgear-db \
     -e POSTGRES_USER=nexus \
     -e POSTGRES_PASSWORD=nexusgear123 \
     -e POSTGRES_DB=nexusgear \
     -p 5432:5432 \
     postgres:15-alpine
   ```

2. **Initialize Schema & Seed Data:**
   Connect to the database (`psql -U nexus -d nexusgear -h localhost`) and run the following:

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

   -- Insert initial dummy data here
   ```

### Running the API

The API looks for the `DATABASE_URL` environment variable. By default, it connects to the local container configuration.

```bash
cd services/api
go run .
```

The server will start on port `8080` (or `http://localhost:8080`).

## Integration with Capstone v1

NexusGear is designed to be stressed! We use `ecommerce_load_test.jmx` and Locust to blast the `/api/checkout` endpoint. This high volume of transactional traffic is captured by the simulator to drive Erlang-C probabilistic scaling decisions.
