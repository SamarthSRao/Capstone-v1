# HybridTimeNet × NexusGear — Sprints Week 2 to Week 6
## The Unified Roadmap: From Local Simulator to Uncertainty-Aware Cloud Autoscaling

**Team:** Samarth (RL & Simulator) · Arya (Dashboard) · Vindhya (E-Commerce Frontend) · Chirrag (E-Commerce Backend & Cloud Integration)
**Repo:** `Capstone-v1/`
**Target Deadline:** Sunday Demo Day (Weekly Milestones)

---

## 📅 Roadmap Overview

```
                   ┌────────────────────────────────────────────────────────┐
                   │               DEVELOPMENT MILESTONES                   │
                   └────────────────────────────────────────────────────────┘
                                               │
             Week 2: The E-Commerce Bridge     ▼ (Local stack, real DB, wiring telemetry)
                                               │
             Week 3: The RL Brain Integration  ▼ (Real-time telemetry loops & forecast charts)
                                               │
             Week 4: Going Cloud-Native        ▼ (Terraform, AWS ECS Fargate, Live RDS setup)
                                               │
             Week 5: Live Actuation & Metrics  ▼ (CloudWatch push, Live ECS scaling, Cloud UI)
                                               │
             Week 6: Resilience & Demo Rehearsal ▼ (Chaos injection, MC Optimization, SLA Audits)
```

---

# 🔴 WEEK 2 (COMPLETION) — The E-Commerce Bridge

## HT-306: SystemStatusBanner + Chaos Checkout Delay
**Owner: Vindhya | Priority: P0 | Days: Wed–Thu**

### Objective
Create a top-level alert banner on the storefront that warns shoppers when SLA reliability drops or when latency is soaring. To simulate system failure during high load, introduce a synthetic delay on the storefront's checkout action.

### Code Architecture & Design

**Component 1 — `src/components/SystemStatusBanner.tsx`:**
```typescript
import React, { useEffect, useState } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import { useSystemLoad } from '../hooks/useSystemLoad'

export const SystemStatusBanner = () => {
    const { violations, slaReliability, status, currentRPS } = useSystemLoad()
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (violations > 0 && slaReliability < 99.5) {
            setVisible(true)
        } else {
            setVisible(false)
        }
    }, [violations, slaReliability])

    if (!visible) return null

    const isCritical = slaReliability < 98

    return (
        <div className={`fixed top-16 left-0 right-0 z-50 flex items-center justify-between
                         px-6 py-2.5 transition-all duration-300 animate-slide-down
                         ${isCritical 
                             ? 'bg-red-600/95 text-white border-b border-red-500 shadow-lg shadow-red-950/20' 
                             : 'bg-yellow-500/95 text-black border-b border-yellow-400 shadow-lg shadow-yellow-950/20'}`}>
            <div className="flex items-center gap-3">
                {isCritical 
                    ? <XCircle className="w-5 h-5 shrink-0 animate-bounce" /> 
                    : <AlertTriangle className="w-5 h-5 shrink-0 animate-pulse" />}
                <span className="font-semibold text-sm">
                    {isCritical 
                        ? `CRITICAL CONGESTION: SLA Reliability is ${slaReliability.toFixed(2)}% | Active Violations: ${violations}`
                        : `HIGH WORKLOAD WARNING: System load is high (${currentRPS} RPS). Checking out may be sluggish.`}
                </span>
            </div>
            <button 
                onClick={() => setVisible(false)}
                className="text-xs px-2 py-1 rounded bg-black/10 hover:bg-black/20 font-bold"
            >
                Dismiss
            </button>
        </div>
    )
}
```

**Component 2 — Dynamic Checkout Delay Hook in Cart Drawer:**
When checking out, fetch the current system load. If `currentRPS > 1500`, add a fake bottleneck to the Checkout request to let the user "feel" the stress in a real demo.
```typescript
const handleCheckout = async () => {
    setLoading(true);
    
    // Inject dynamic latency to represent network congestion
    const start = Date.now();
    let delay = 0;
    if (systemLoad.currentRPS > 2000) {
        delay = 2500; // 2.5s delay
    } else if (systemLoad.currentRPS > 1000) {
        delay = 1000; // 1s delay
    }
    
    if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
    }
    
    try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_id: selectedProductId,
                quantity: 1,
                session_id: "demo-session"
            })
        });
        // Handle success...
    } catch (e) {
        // Handle error...
    } finally {
        setLoading(false);
    }
}
```

### Done-When Criteria
- Simulator RPS climbs > 1000 → yellow warning banner slides down below the Navbar.
- Simulator RPS climbs > 2000 + SLA drops < 98% → banner turns red and states "CRITICAL CONGESTION".
- Clicking checkout during low load completes in < 50ms.
- Clicking checkout during Flash Sale load (> 2000 RPS) experiences an intentional 2.5-second spin loading indicator, reflecting real resource contention.

### Cursor Prompt
```
Create a SystemStatusBanner component and integrate a chaos checkout delay in services/ecommerce/.
1. Build `src/components/SystemStatusBanner.tsx` that uses the `useSystemLoad` hook.
2. Render the banner only when load.violations > 0 and load.slaReliability < 99.5.
3. If load.slaReliability < 98, render in deep red with an animate-bounce XCircle icon.
4. If between 98 and 99.5, render in warning yellow with an animate-pulse AlertTriangle icon.
5. In the cart checkout submission, look at the currentRPS. If RPS > 2000, wait 2500ms before POSTing to `/api/checkout`. If RPS > 1000, wait 1000ms. Otherwise, checkout immediately.
6. Display a loading spinner or disable checkout button during this processing time.
```

---

## HT-307: Dashboard Control Panel — Dataset Selector + Status Badge
**Owner: Arya | Priority: P0 | Days: Tue–Wed**

### Objective
Create a professional dataset selector in the Dashboard's control panel. Clicking a dataset should load real-world workload traces (e.g., NASA, Madrid, Organic, Flash Sale) and POST them directly to the Go Simulator.

### Code Architecture & Design

Create `services/dashboard/src/data/traces.js`:
```javascript
export const DATASETS = {
    "Organic Growth": Array.from({length: 120}, (_, i) => 200 + Math.floor(i * 1.5) + Math.sin(i/10)*20),
    "Flash Sale Spike": [
        ...Array(15).fill(150),
        ...Array(40).fill(2500).map(v => v + Math.floor(Math.random() * 400)),
        ...Array(30).fill(1000).map(v => v + Math.floor(Math.random() * 200)),
        ...Array(35).fill(200)
    ],
    "Bot DDoS Attack": [
        ...Array(20).fill(100),
        ...Array(5).fill(4000), // sudden extreme burst
        ...Array(20).fill(150),
        ...Array(5).fill(4000),
        ...Array(70).fill(100)
    ]
};
```

**Changes in `Dashboard.jsx`:**
```jsx
import { DATASETS } from './src/data/traces';

const [selectedDataset, setSelectedDataset] = useState("Organic Growth");

const triggerSimulation = async () => {
    setIsSimulating(true);
    addLog(`POSTing dataset ${selectedDataset} to Simulator...`, "info");
    try {
        const response = await fetch('http://localhost:8083/start-simulation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workload: DATASETS[selectedDataset] })
        });
        const result = await response.json();
        addLog(`Simulator started successfully: ${result.ticks} ticks queued`, "success");
    } catch (e) {
        addLog(`Simulation trigger failed: ${e.message}`, "error");
    }
};
```

### Done-When Criteria
- Dashboard displays a dropdown menu listing "Organic Growth", "Flash Sale Spike", and "Bot DDoS Attack".
- Select "Flash Sale Spike" and click "Inject Telemetry" → logs update in real-time, and simulator graphs immediately reflect the load spike.
- A "Status Badge" shows "SIMULATING" in pulsing orange during an active run, reverting to "IDLE" in green when completed.

### Cursor Prompt
```
Add a Dataset Selector dropdown to services/dashboard/Dashboard.jsx.
1. Create a data file detailing three workload arrays of 120 integers: "Organic Growth", "Flash Sale Spike", and "Bot DDoS Attack".
2. Create a dropdown selector in the Control Panel card.
3. Replace the old `handleSimulateLoad` function with a unified POST request to `http://localhost:8083/start-simulation`, sending the selected array in the `workload` JSON parameter.
4. Render a pulsing status badge: if simulator `status` is "SIMULATING", show orange pulsing text "ACTIVE LOAD INJECTION". If "IDLE", show green "STEADY STATE".
```

---

## HT-308: Orchestrator `/update-prediction` Consumer + Dashboard Prediction Band
**Owner: Arya | Priority: P0 | Days: Wed–Thu**

### Objective
Modify the Go Orchestrator to parse prediction payloads from the Python predictor and forward them directly to the Go Simulator `/update-prediction` endpoint so that the dashboard can read everything from a single source of truth.

### Code Architecture & Design

**In `services/orchestrator/main.go`:**
```go
// Add a function to forward predictions
func forwardPredictionToSimulator(mean, upper, lower float64, servers int) {
	client := &http.Client{Timeout: 2 * time.Second}
	
	payload := map[string]interface{}{
		"predicted_mean":    []float64{mean},
		"predicted_upper":   []float64{upper},
		"predicted_lower":   []float64{lower},
		"required_servers":  servers,
	}
	
	body, _ := json.Marshal(payload)
	resp, err := client.Post("http://simulator:8083/update-prediction", "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("[Orchestrator] Error forwarding predictions to simulator: %v", err)
		return
	}
	defer resp.Body.Close()
}
```
Call this function inside the `/scale` endpoint as soon as the Python Predictor returns a response.

### Done-When Criteria
- Go Orchestrator accepts metrics history, contacts the Python Predictor gRPC, receives bounds.
- Go Orchestrator successfully POSTs the prediction data forward to `http://simulator:8083/update-prediction`.
- Dashboard graphs show a real-time shaded prediction band (Upper vs Lower bounds) following the actual load curve.

### Cursor Prompt
```
Modify services/orchestrator/main.go to push prediction bounds to the Go Simulator.
1. Create a helper function `forwardPredictionToSimulator(mean, upper, lower float64, servers int)` that executes a POST request to `http://simulator:8083/update-prediction`.
2. Inside the `/scale` handler, after getting the prediction result from the gRPC predictorClient, trigger this helper function.
3. Ensure timeouts are strictly handled (max 2 seconds) so it doesn't block transaction execution.
```

---

## HT-309: Docker Compose — Add Ecommerce Service + Full Local Stack
**Owner: Chirrag | Priority: P0 | Day: Wed**

### Objective
Integrate the new E-Commerce storefront and E-Commerce API into the main `docker-compose.yml` so a single command spins up PostgreSQL, the E-Commerce backend, the storefront, the orchestrator, the simulator, and the dashboard.

### Code Architecture & Design

**Update `docker-compose.yml`:**
```yaml
version: '3.8'

services:
  nexusgear-db:
    image: postgres:15-alpine
    container_name: nexusgear-db
    environment:
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexusgear123
      POSTGRES_DB: nexusgear
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - capstone-net

  ecommerce-api:
    build:
      context: ./services/api
    container_name: ecommerce-api
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://nexus:nexusgear123@nexusgear-db:5432/nexusgear?sslmode=disable
    depends_on:
      - nexusgear-db
    networks:
      - capstone-net

  ecommerce-storefront:
    build:
      context: ./services/ecommerce
    container_name: ecommerce-storefront
    ports:
      - "3001:5173" # Bind local port 3001 to Vite dev server port 5173
    environment:
      - VITE_SIMULATOR_URL=http://localhost:8083
      - VITE_API_URL=http://localhost:8080
    networks:
      - capstone-net

  # Keep existing predictor, orchestrator, simulator, and dashboard services...

volumes:
  postgres_data:

networks:
  capstone-net:
    driver: bridge
```

### Done-When Criteria
- `docker compose up --build` launches all 6 containers without failures.
- PostgreSQL database is initialized and seed data is fully inserted.
- E-Commerce UI is accessible at `http://localhost:3001` and Dashboard at `http://localhost:3000`.

### Cursor Prompt
```
Update the root docker-compose.yml to include PostgreSQL, the ecommerce backend API, and the React storefront.
1. Add a service `nexusgear-db` running postgres:15-alpine, setting database env variables.
2. Add a service `ecommerce-api` referencing the context `./services/api` on port 8080.
3. Add a service `ecommerce-storefront` referencing the context `./services/ecommerce` on port 3001.
4. Wire all services to the `capstone-net` network. Add a volume block for persistent postgres data.
```

---

## HT-310: Locust Load Scripts — Organic + Flash Sale
**Owner: Chirrag | Priority: P1 | Days: Thu–Fri**

### Objective
Create professional Locust load-testing scripts to drive traffic into the e-commerce endpoint `/api/checkout` directly, testing the systems under massive multi-user checkout scenarios.

### Code Architecture & Design

Create a script `scripts/locustfile.py`:
```python
import random
from locust import HttpUser, task, between

class NexusGearCustomer(HttpUser):
    wait_time = between(0.5, 2.0)

    @task(3)
    def view_catalog(self):
        self.client.get("/api/products")

    @task(1)
    def purchase_product(self):
        product_id = random.randint(1, 12)
        payload = {
            "product_id": product_id,
            "quantity": 1,
            "session_id": f"locust-user-{random.randint(1000, 9999)}"
        }
        self.client.post("/api/checkout", json=payload)
```

### Done-When Criteria
- Running `locust -f scripts/locustfile.py` opens the dashboard interface at `localhost:8089`.
- Running a 200-user checkout swarm delivers steady traffic to `/api/checkout`.
- Dashboard graphs correctly plot this live customer traffic arriving in real-time.

### Cursor Prompt
```
Create a python load test script inside scripts/locustfile.py.
The script must represent a simulated customer navigating the NexusGear storefront:
1. 75% probability of querying GET `/api/products` (browsing catalog).
2. 25% probability of POSTing to `/api/checkout` with a random product_id (1-12) and random session_id.
3. Set wait_time between 0.5 and 2 seconds per customer step.
```

---

## HT-311: SLA Evaluator Script
**Owner: Arya | Priority: P1 | Day: Thu**

### Objective
Write a standalone Python/Node script that polls the Simulator `/metrics` endpoint throughout a simulation and calculates standard SLA evaluation scores (Total Violations, SLA Reliability %, Total Cost).

### Done-When Criteria
- Script executes via terminal: `node scripts/sla-eval.js`.
- Outputs a formatted terminal table summarizing SLA compliance, violations count, and resource waste ratio.

---

## HT-312: End-to-End Test Runs — 3 Complete Scenarios
**Owner: Samarth + All | Priority: P0 | Days: Fri–Sat**

### Objective
Execute dry runs of the three core scenarios (Steady State, Flash Sale, Bot DDoS) using the dashboard control panel. Verify that the RL agent successfully predicts spikes and triggers server scaling actions before violations peak.

### Done-When Criteria
- Execute all 3 runs. Ensure the system maintains >99% SLA reliability during the sudden "Flash Sale" spike run.

---
---

# 🔵 WEEK 3 — The RL Brain & Telemetry Dashboard Wiring

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WEEK 3 GOALS & ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Go Simulator]  ──(Telemetry Push)──→ [Go Orchestrator]                │
│         │                                      │                        │
│    (HTTP Poll)                           (gRPC Call)                    │
│         ▼                                      ▼                        │
│  [React Dashboard]                [Python Predictor (RL)]               │
│  (Real-Time Graphs)               - Uncertainty Quantification          │
│                                   - MC Dropout (100 passes)             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## HT-401: Python RL Predictor — Real-Time Ingestion from Go Simulator Telemetry
**Owner: Samarth | Priority: P0 | Days: Mon–Tue**

### Objective
Configure the Python load-predictor to process incoming Go Simulator HTTP metrics streams in real-time. Replace mock inputs with the active rolling history buffer, extracting aleatoric and epistemic uncertainty intervals.

### Code Architecture & Design

**Update `services/load-predictor/server.py`:**
```python
def GetPrediction(self, request, context):
    # Ingest the history array sent by the Go Orchestrator via gRPC
    history = np.array(request.history)
    
    # Require a sliding window of at least 24 steps
    if len(history) < 24:
        return predictor_pb2.PredictionResponse(
            mean=history[-1] if len(history) > 0 else 50.0,
            std_dev=5.0,
            upper_bound=history[-1] + 10.0 if len(history) > 0 else 60.0,
            lower_bound=max(0, history[-1] - 10.0) if len(history) > 0 else 40.0
        )

    # Scale input to match model training weights
    scaled_history = (history - self.mean_train) / self.std_train
    input_t = torch.FloatTensor(scaled_history).unsqueeze(0).unsqueeze(-1).to(self.device)

    # Batched MC Dropout Execution (100 forward passes)
    mc_samples = 100
    batched_input = input_t.repeat(mc_samples, 1, 1)
    
    self.lstm.train() # Force dropout active at inference time
    
    with torch.no_grad():
        mus, logvars = self.lstm(batched_input)
        mus = mus.cpu().numpy()
        logvars = logvars.cpu().numpy()

    # Calculate Epistemic Uncertainty (variance across model predictions)
    epistemic_var = mus.var() * (self.std_train ** 2)
    # Calculate Aleatoric Uncertainty (average expected data noise)
    aleatoric_var = np.exp(logvars).mean() * (self.std_train ** 2)
    
    total_std = np.sqrt(epistemic_var + aleatoric_var)
    predicted_mean = float(mus.mean() * self.std_train + self.mean_train)

    # Upper bound uses mean + 2 * std for a 95% risk-averse provisioning limit
    upper_bound = float(predicted_mean + 2.0 * total_std)
    lower_bound = float(max(0.0, predicted_mean - 2.0 * total_std))

    return predictor_pb2.PredictionResponse(
        mean=predicted_mean,
        std_dev=total_std,
        upper_bound=upper_bound,
        lower_bound=lower_bound
    )
```

### Done-When Criteria
- Python gRPC service computes actual MC Dropout standard deviations on every `/scale` invocation.
- Inference execution completes in less than 80ms under GPU/CPU stress.
- `upper_bound` correctly reacts and expands during high-volatility inputs.

### Cursor Prompt
```
Update services/load-predictor/server.py to use the real LSTM model for gRPC inference.
1. Load incoming request.history. If it contains less than 24 elements, return a safe fallback.
2. Min-max scale or standardize history using mean_train and std_train variables.
3. Prepare input tensor for PyTorch. Repeat along batch dimension to create 100 parallel samples.
4. Execute LSTM model with `model.train()` active to keep dropout enabled.
5. Extract `mu` and `logvar` arrays. Calculate epistemic variance (mus.var()) and aleatoric variance (np.exp(logvars).mean()).
6. Compute total standard deviation as sqrt(epistemic_var + aleatoric_var).
7. Apply scale parameters back. Return mean, std_dev, upper_bound (mean + 2*std), and lower_bound (mean - 2*std) inside the gRPC response.
```

---

## HT-402: Go Orchestrator — Real-time Telemetry Poller & Prediction Push
**Owner: Samarth | Priority: P0 | Days: Tue–Wed**

### Objective
Update the Go Orchestrator to parse incoming metrics streams, communicate with the Python predictor gRPC service, solve the Erlang-C queuing models using log-space operations to maintain performance under stress, and output scaling directives.

### Code Architecture & Design

**In `services/orchestrator/main.go`:**
Ensure Erlang-C utilizes log-space arithmetic to prevent floating-point overflow when computing factorials for large server node counts (`c > 100`):

```go
func calculateErlangC(c int, intensity float64) float64 {
	if float64(c) <= intensity {
		return 1.0
	}
	
	// log(c!) using Ramanujan's approximation or standard log-loop
	logCFact := logFactorial(c)
	
	// log(numerator) = c * log(intensity) - log(c!) + log(c / (c - intensity))
	lnum := float64(c)*math.Log(intensity) - logCFact + math.Log(float64(c)/(float64(c)-intensity))
	
	// Pre-allocate logTerms to prevent memory thrashing
	logTerms := make([]float64, c+1)
	for i := 0; i < c; i++ {
		logTerms[i] = float64(i)*math.Log(intensity) - logFactorial(i)
	}
	logTerms[c] = lnum
	
	lDenom := logSumExpMulti(logTerms)
	return math.Exp(lnum - lDenom)
}
```

### Done-When Criteria
- Go Orchestrator computes target server counts using predicted upper bound workload limits.
- Erlang-C functions calculate correct wait probabilities without floating-point overflow for large clusters.
- The scaling instructions are successfully written back to the Go Simulator.

### Cursor Prompt
```
Verify and optimize services/orchestrator/main.go for high-concurrency Erlang-C solving.
1. Implement `logFactorial(n)` and `logSumExpMulti(terms)` helpers to support log-space calculations.
2. Refactor `calculateErlangC` to utilize log-space subtraction: Exp(lnum - lDenom).
3. Ensure no memory allocation bottlenecks exist in the `/scale` loop.
4. Wire gRPC request to send active history metrics to the `predictor` service container.
```

---

## HT-403: Front-end E-Commerce Store — Chaos UI & Warning Banners
**Owner: Vindhya | Priority: P0 | Days: Wed–Thu**

### Objective
Implement the "Chaos UI" storefront features. If the simulator reports that SLA reliability falls below 98%, display prominent warning panels and change pricing badges to bright red alert colors to reflect real infrastructure distress.

### Done-When Criteria
- Storefront displays dynamic chaos alert panels warning users of potential system latency issues when SLA drops.
- Prices increase dynamically across all grid cards in step with surging traffic levels.

---

## HT-404: E-Commerce Backend — Telemetry Endpoint & Load Proxy
**Owner: Chirrag | Priority: P0 | Days: Mon–Tue**

### Objective
Connect the actual Go Checkout API to the Go Simulator container. Every time a genuine user clicks purchase on the storefront, the API must proxy this increment immediately to the simulator so it reflects real user activity.

### Done-When Criteria
- POST to `/api/checkout` triggers an instantaneous metric update inside the simulator's active RPS tracker.

---

## HT-405: Dashboard — Live Predictor Confidence Intervals
**Owner: Arya | Priority: P0 | Days: Wed–Thu**

### Objective
Update Recharts graphs on the dashboard UI to display the exact shaded confidence bounds sent by the Python RL model. Ensure the visual styles look premium and modern, featuring custom hover tooltips and dynamic color adjustments.

### Done-When Criteria
- Dashboards render the blue-shaded uncertainty area perfectly tracking live load lines.
- SLA violation alarms blink in red when reliability drops below the critical 99% threshold.

---

## HT-406: End-to-End Local Real-Time Autoscaling Trial
**Owner: Samarth + All | Priority: P0 | Days: Fri–Sat**

### Objective
Conduct full end-to-end trials of the entire containerized stack locally. Simulate user purchases, inject massive Flash Sale workloads, and confirm that the Python RL agent proactively provisions resources before bottlenecks occur.

### Done-When Criteria
- Run a 5-minute simulated Flash Sale load trace. The system must maintain >99.2% SLA compliance throughout the test run.

---
---

# 🔵 WEEK 4 — Going Cloud-Native (AWS Setup)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WEEK 4 CLOUD ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                      [Internet Gateway / VPC]                           │
│                                 │                                       │
│          ┌──────────────────────┴──────────────────────┐                │
│          ▼                                             ▼                │
│    Public Subnet                                Private Subnet          │
│    - Application Load Balancer                  - ECS Fargate Cluster   │
│    - React Storefront (S3/CloudFront)             * Go API Container    │
│    - Admin Dashboard UI                           * Go Simulator        │
│                                                 - RDS PostgreSQL        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## HT-501: Terraform VPC & Subnets Design
**Owner: Chirrag | Priority: P0 | Days: Mon–Tue**

### Objective
Write standard Terraform configurations to provision a secure, highly available AWS VPC featuring both public and private subnets across two Availability Zones, routing, NAT Gateways, and strict Security Group policies.

### Code Architecture & Design

Create `terraform/vpc.tf`:
```hcl
provider "aws" {
  region = var.aws_region
}

resource "aws_vpc" "capstone_vpc" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "capstone-vpc"
  }
}

resource "aws_subnet" "public_az1" {
  vpc_id            = aws_vpc.capstone_vpc.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "${var.aws_region}a"
  map_public_ip_on_launch = true
  tags = { Name = "capstone-public-1a" }
}

resource "aws_subnet" "public_az2" {
  vpc_id            = aws_vpc.capstone_vpc.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.aws_region}b"
  map_public_ip_on_launch = true
  tags = { Name = "capstone-public-1b" }
}

resource "aws_subnet" "private_az1" {
  vpc_id            = aws_vpc.capstone_vpc.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.aws_region}a"
  tags = { Name = "capstone-private-1a" }
}

resource "aws_subnet" "private_az2" {
  vpc_id            = aws_vpc.capstone_vpc.id
  cidr_block        = "10.0.20.0/24"
  availability_zone = "${var.aws_region}b"
  tags = { Name = "capstone-private-1b" }
}

resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.capstone_vpc.id
  tags   = { Name = "capstone-igw" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_az1.id
  tags          = { Name = "capstone-nat-gw" }
}

# Route Tables & Associations...
```

### Done-When Criteria
- Running `terraform plan` succeeds without validation errors.
- Running `terraform apply` successfully provisions VPC, subnets, route tables, IGW, and NAT Gateways.
- All created infrastructure is tagged correctly according to project standards.

### Cursor Prompt
```
Create a modular Terraform script inside terraform/vpc.tf to build a secure AWS network.
1. Provision a VPC with CIDR 10.0.0.0/16.
2. Create 2 public subnets (10.0.1.0/24 and 10.0.2.0/24) in separate AZs.
3. Create 2 private subnets (10.0.10.0/24 and 10.0.20.0/24) in separate AZs.
4. Set up an Internet Gateway and map public subnet traffic routes to it.
5. Create an Elastic IP and a NAT Gateway in the first public subnet.
6. Route internet-bound traffic from private subnets through the NAT Gateway.
```

---

## HT-502: Terraform ECS Cluster & Fargate Task Definitions
**Owner: Chirrag | Priority: P0 | Days: Tue–Wed**

### Objective
Define Terraform configurations to deploy our core services (Go Orchestrator, Python Predictor, Go Simulator, E-Commerce API) onto AWS ECS using Fargate, including IAM roles, security groups, and CloudWatch log groups.

### Code Architecture & Design

Create `terraform/ecs.tf`:
```hcl
resource "aws_ecs_cluster" "cluster" {
  name = "capstone-ecs-cluster"
}

resource "aws_iam_role" "ecs_execution_role" {
  name = "capstone-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "ecs-tasks.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_ecs_task_definition" "api" {
  family                   = "ecommerce-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn

  container_definitions = jsonencode([
    {
      name      = "ecommerce-api"
      image     = "${var.ecr_registry}/ecommerce-api:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/ecommerce-api"
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }
    }
  ])
}
```

### Done-When Criteria
- ECS cluster and individual service Task Definitions are provisioned successfully via Terraform.
- ECR repositories exist for all backend application images.
- CloudWatch log groups are automatically created for each individual Fargate task container.

### Cursor Prompt
```
Create a Terraform file in terraform/ecs.tf to define an ECS Cluster and Fargate services.
1. Define an ECS Cluster called `capstone-ecs-cluster`.
2. Set up the ECS Task Execution IAM Role with core policies for ECR access and CloudWatch log streaming.
3. Write a Fargate Task Definition for `ecommerce-api` using variables for the ECR image URI.
4. Configure standard CloudWatch logging definitions inside the Fargate task JSON definition.
```

---

## HT-503: Terraform RDS PostgreSQL Instance Provisioning
**Owner: Chirrag | Priority: P0 | Days: Wed–Thu**

### Objective
Provision a highly resilient, production-grade RDS PostgreSQL instance within the private database subnets of the VPC. Setup subnets groups, custom parameters, and security rules allowing access only from private backend tasks.

### Done-When Criteria
- RDS PostgreSQL instance provisions successfully.
- Security groups block direct public connection attempts, allowing access strictly from ECS backend containers.

---

## HT-504: Go API/Checkout — RDS Integration & Migration
**Owner: Chirrag | Priority: P0 | Days: Thu–Fri**

### Objective
Update the E-Commerce backend Go API to parse secure RDS connection secrets, execute schema migrations dynamically upon launch, and write active order transactions directly to the live AWS database.

### Done-When Criteria
- Go API connects to the remote RDS instance, performs automated table migrations on startup, and records orders.

---

## HT-505: E-Commerce Frontend & Dashboard AWS Deployment
**Owner: Vindhya + Arya | Priority: P0 | Days: Thu–Fri**

### Objective
Bundle and deploy the E-Commerce Storefront React App and Admin Dashboard to AWS. Host static files securely inside AWS S3 buckets and route traffic globally using CloudFront distributions.

### Done-When Criteria
- Storefront and Dashboard are globally accessible over CloudFront HTTPS URLs.

---

## HT-506: Go Simulator & Python Predictor ECS Fargate Deployment
**Owner: Samarth | Priority: P0 | Days: Fri–Sat**

### Objective
Deploy the core Go Simulator and the Python Predictor services onto the ECS Fargate cluster. Configure gRPC internal routing using AWS Cloud Map (Service Discovery) to allow high-speed low-latency container communications.

### Done-When Criteria
- Fargate containers start successfully, and simulator discovers predictor over private DNS routing.

---
---

# 🔵 WEEK 5 — AWS Auto-scaling Actuation & Telemetry

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      WEEK 5 AUTOSCALING MECHANISM                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [Go Simulator]  ──(Push Custom Metrics)──→ [AWS CloudWatch]            │
│                                                     │                   │
│                                                (Poll metrics)           │
│                                                     ▼                   │
│  [Go API / ECS Fargate] ←──(Actuate Scale)── [Go Orchestrator]          │
│  - Spin up/down actual                        - Compute Erlang-C        │
│    Fargate task tasks                         - Request AWS scaling     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## HT-601: Go Simulator — CloudWatch Logs & Custom Metrics Push
**Owner: Samarth | Priority: P0 | Days: Mon–Tue**

### Objective
Integrate the official AWS SDK for Go into the Simulator service. Periodically push active simulator metrics (Current RPS, SLA Violations, Server Capacity) directly to AWS CloudWatch as custom metrics under a custom namespace.

### Code Architecture & Design

**Update `services/simulator/main.go`:**
Import AWS SDK and setup metrics dispatcher:

```go
import (
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/cloudwatch"
)

var cwClient *cloudwatch.CloudWatch

func initCloudWatch() {
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-east-1"),
	})
	if err != nil {
		log.Printf("Failed to initialize AWS Session: %v", err)
		return
	}
	cwClient = cloudwatch.New(sess)
	log.Println("[Simulator] AWS CloudWatch Session Initialized")
}

func pushMetricsToCloudWatch(rps int, violations int, activeServers int) {
	if cwClient == nil {
		return
	}
	
	input := &cloudwatch.PutMetricDataInput{
		Namespace: aws.String("HybridTimeNet/Telemetry"),
		MetricData: []*cloudwatch.MetricDatum{
			{
				MetricName: aws.String("CurrentRPS"),
				Value:      aws.Float64(float64(rps)),
				Unit:       aws.String("Count/Second"),
			},
			{
				MetricName: aws.String("SLAViolations"),
				Value:      aws.Float64(float64(violations)),
				Unit:       aws.String("Count"),
			},
			{
				MetricName: aws.String("ActiveServerCount"),
				Value:      aws.Float64(float64(activeServers)),
				Unit:       aws.String("Count"),
			},
		},
	}
	
	_, err := cwClient.PutMetricData(input)
	if err != nil {
		log.Printf("Error pushing metrics to CloudWatch: %v", err)
	}
}
```

Trigger `pushMetricsToCloudWatch` inside the simulator's tick loop every second.

### Done-When Criteria
- Simulator initializes AWS CloudWatch connections without blocking local application start.
- Telemetry data is visible under `HybridTimeNet/Telemetry` namespace within AWS Console.
- Logging output details successful metric dispatches.

### Cursor Prompt
```
Integrate the AWS Go SDK into services/simulator/main.go.
1. Add imports for github.com/aws/aws-sdk-go/aws, aws/session, and service/cloudwatch.
2. Initialize an AWS session in an `initCloudWatch()` helper called at startup.
3. Write a helper `pushMetricsToCloudWatch(rps, violations, activeServers)` that packs metrics into a PutMetricDataInput struct under namespace `HybridTimeNet/Telemetry`.
4. Trigger this helper inside the simulator's one-second tick loop.
5. Prevent failures or missing credentials from crashing the simulator: log error and recover gracefully.
```

---

## HT-602: Go Orchestrator — CloudWatch Metrics Client Integration
**Owner: Samarth | Priority: P0 | Days: Tue–Wed**

### Objective
Update the Go Orchestrator to query historical telemetry directly from AWS CloudWatch rather than trusting local simulator variables. Gather the sliding history window over CloudWatch metrics APIs.

### Code Architecture & Design

**In `services/orchestrator/main.go`:**
Query metric history from CloudWatch:

```go
func getHistoryFromCloudWatch() ([]float32, error) {
	if cwClient == nil {
		return nil, fmt.Errorf("CloudWatch client offline")
	}

	endTime := time.Now()
	startTime := endTime.Add(-30 * time.Minute) // Fetch last 30 minutes of load telemetry

	input := &cloudwatch.GetMetricStatisticsInput{
		Namespace:  aws.String("HybridTimeNet/Telemetry"),
		MetricName: aws.String("CurrentRPS"),
		StartTime:  aws.Time(startTime),
		EndTime:    aws.Time(endTime),
		Period:     aws.Int64(60), // 1-minute aggregation periods
		Statistics: []*string{aws.String("Average")},
	}

	result, err := cwClient.GetMetricStatistics(input)
	if err != nil {
		return nil, err
	}

	// Sort datapoints by timestamp and construct history slice
	var history []float32
	// ... logic to parse and sort metrics points ...

	return history, nil
}
```

### Done-When Criteria
- Go Orchestrator retrieves metric history directly from AWS CloudWatch.
- Output slices are correctly chronological and formatted for the gRPC Predictor.

### Cursor Prompt
```
Integrate AWS CloudWatch metric history retrieval into services/orchestrator/main.go.
1. Add AWS SDK packages to imports. Set up a secure AWS CloudWatch client interface.
2. Create `getHistoryFromCloudWatch()` using `GetMetricStatisticsInput`.
3. Read the "CurrentRPS" metric under namespace "HybridTimeNet/Telemetry" over the past 30 minutes.
4. Sort the returned metric values chronologically based on their timestamps.
5. Return a slice of float32 values representing the load history window.
```

---

## HT-603: Go Orchestrator — Live ECS Service Autoscaling Actuator
**Owner: Chirrag | Priority: P0 | Days: Wed–Thu**

### Objective
Connect the Go Orchestrator directly to the AWS ECS API. Replace the old mock server slice logic with real cloud autoscaling: dynamically adjust the task capacity of the E-Commerce API ECS service based on the RL forecasts.

### Code Architecture & Design

**In `services/orchestrator/main.go`:**
Update ECS Service task count:

```go
import "github.com/aws/aws-sdk-go/service/ecs"

var ecsClient *ecs.ECS

func scaleECSService(targetCount int) error {
	if ecsClient == nil {
		return fmt.Errorf("ECS client not initialized")
	}

	input := &ecs.UpdateServiceInput{
		Cluster:      aws.String("capstone-ecs-cluster"),
		Service:      aws.String("ecommerce-api-service"),
		DesiredCount: aws.Int64(int64(targetCount)),
	}

	_, err := ecsClient.UpdateService(input)
	if err != nil {
		return err
	}

	log.Printf("[Orchestrator] Successfully scaled ECS Tasks count to %d", targetCount)
	return nil
}
```

### Done-When Criteria
- Predictor calculates required servers → Orchestrator triggers an active ECS `UpdateService` API call.
- The AWS ECS console shows Fargate containers spinning up or down dynamically matching the scaling instruction.
- Zero downtime transitions are maintained during task scaling operations.

### Cursor Prompt
```
Add ECS Service scaling capabilities to services/orchestrator/main.go.
1. Initialize an AWS ECS client using the standard AWS session.
2. Write a helper function `scaleECSService(targetCount int)` that constructs a `UpdateServiceInput` payload.
3. Call this function with the target server count calculated by the Erlang-C queue solver.
4. Handle API throttling or permissions errors safely, ensuring logs record all failures.
```

---

## HT-604: Dashboard UI — Multi-monitor Live Telemetry over CloudWatch
**Owner: Arya | Priority: P0 | Days: Thu–Fri**

### Objective
Update the Admin Dashboard to fetch active metrics directly from the AWS CloudWatch APIs, keeping the dashboard updated with live, cloud-native telemetry.

### Done-When Criteria
- Dashboard displays live, real-world metric telemetry fetched directly from AWS CloudWatch.

---

## HT-605: Storefront — Live Cloud Telemetry Reactivity Hook
**Owner: Vindhya | Priority: P0 | Days: Thu–Fri**

### Objective
Update the e-commerce storefront's react hooks to poll active load levels from the CloudWatch API. Dynamic pricing and Chaos banners must reflect actual cloud load.

### Done-When Criteria
- Dynamic prices climb on the storefront during massive traffic spikes deployed on AWS.

---

## HT-606: End-to-End Cloud Autoscaling Verification
**Owner: All | Priority: P0 | Days: Fri–Sat**

### Objective
Execute the full two-monitor live demonstration directly on the AWS cloud environment. Verify the end-to-end telemetry loop (Traffic -> CloudWatch -> Orchestrator -> RL Predictor -> ECS Scaling -> Storefront UI Reactivity) is complete.

### Done-When Criteria
- Triggering a Flash Sale via the AWS-hosted Dashboard causes actual ECS Fargate containers to scale up automatically, protecting the AWS storefront from crashing.

---
---

# 🔵 WEEK 6 — Resilience & Demo Rehearsals

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WEEK 6 RESILIENCE & CHAOS TRIALS                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   [ECS API Service]  ◄──(Kill Containers)── [Chaos Monkey / CLI]        │
│          │                                                              │
│          ▼                                                              │
│   [Telemetry Drop] ──(Detect Uncertainty)──→ [RL Predictor]             │
│                                                    │                    │
│                                           (Expand Bounds)               │
│                                                    ▼                    │
│   [SLA Restored] ◄───(Scale Buffers)──────── [Go Orchestrator]          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## HT-701: Chaos Injection — ECS Fargate Task Terminations & Network Latency
**Owner: Chirrag | Priority: P0 | Days: Mon–Tue**

### Objective
Test system resilience under load by deliberately introducing chaos failures (killing Fargate tasks mid-run, injecting network packet delays). Ensure the Bayesian RL agent recognizes these anomalies and compensates by expanding scaling margins.

### Code Architecture & Design

Create a script `scripts/chaos-monkey.sh`:
```bash
#!/bin/bash
CLUSTER_NAME="capstone-ecs-cluster"
SERVICE_NAME="ecommerce-api-service"

echo "[Chaos] Starting Chaos Injection..."

while true; do
  # Get random active task ID
  TASK_ID=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --query "taskArns[0]" --output text)
  
  if [ "$TASK_ID" != "None" ] && [ -n "$TASK_ID" ]; then
    echo "[Chaos] Killing random active Fargate task: $TASK_ID"
    aws ecs stop-task --cluster $CLUSTER_NAME --task $TASK_ID
  else
    echo "[Chaos] No active tasks found to kill."
  fi
  
  # Wait for a random interval between 45 and 90 seconds
  SLEEP_TIME=$((45 + RANDOM % 45))
  sleep $SLEEP_TIME
done
```

### Done-When Criteria
- Chaos script runs continuously, terminating active Fargate tasks under heavy traffic load.
- The Bayesian predictor notices the increased variance, resulting in an immediate expansion of its uncertainty bounds.
- The Go Orchestrator provisions additional safety buffer nodes, preventing cascading SLA failures.

### Cursor Prompt
```
Write a bash script in scripts/chaos-monkey.sh to simulate container failures.
1. Periodically query active tasks under `ecommerce-api-service` in the `capstone-ecs-cluster` cluster.
2. Randomly select an active task ARN and invoke the `aws ecs stop-task` API command.
3. Pause for a random duration (45-90 seconds) before repeating the loop.
4. Output log lines detailing the target task killed and time of execution.
```

---

## HT-702: Bayesian LSTM — MC Dropout Inference Latency Optimization
**Owner: Samarth | Priority: P0 | Days: Tue–Wed**

### Objective
Optimize the Python Bayesian LSTM inference pipeline. Ensure that executing 100 Monte Carlo forward passes is highly optimized via Tensor-batching, bringing p99 inference latency below 15ms to prevent scaling lag.

### Code Architecture & Design

**Update `services/load-predictor/server.py`:**
```python
# Optimize the forward pass using PyTorch compiled functions
@torch.compile
def optimized_mc_dropout(model, batched_input):
    model.train() # Keep dropout active
    with torch.no_grad():
        mus, logvars = model(batched_input)
    return mus, logvars
```

### Done-When Criteria
- Total inference processing time is reduced below 15ms per call under high concurrent load.
- CPU/GPU memory footprint is stabilized, preventing memory leaks during continuous operations.

### Cursor Prompt
```
Optimize services/load-predictor/server.py for high-speed gRPC inference execution.
1. Apply `torch.compile` to the forward prediction functions to cache execution graphs.
2. Confirm that Monte Carlo dropout runs entirely as a single batched tensor operation, avoiding python iteration loops.
3. Run performance tests to verify that inference time stays below 15ms on average.
```

---

## HT-703: Dashboard Control Panel — Live SLA Violations & Cost-Efficiency Visualizer
**Owner: Arya | Priority: P0 | Days: Wed–Thu**

### Objective
Build advanced visualizations on the Dashboard UI tracking live SLA Violations counts, resource utilization percentages, and simulated financial costs (running server hours).

### Done-When Criteria
- Dashboard displays live, beautifully designed gauges showing active SLA reliability and cost tracking.

---

## HT-704: Storefront — Front-end Circuit Breakers and Fallback Modes
**Owner: Vindhya | Priority: P0 | Days: Wed–Thu**

### Objective
Implement client-side Circuit Breaker patterns (using libraries or custom hooks) within the storefront app. If checkout requests fail consistently, immediately trip the breaker, fallback to a local mock checkout flow, and display user-friendly notices.

### Done-When Criteria
- Killing the backend API causes the storefront to trip its circuit breaker, preventing network queue build-ups and switching seamlessly to backup local mock modes.

---

## HT-705: SLA Auditor Script — Automated Performance Report Generator
**Owner: Arya | Priority: P1 | Day: Thu**

### Objective
Write an automated Node/Python script that extracts historical telemetry from AWS CloudWatch, compiles performance metrics across running trials, and generates a formatted Markdown report comparing HybridTimeNet against standard scaling methods.

### Done-When Criteria
- Script executes seamlessly and outputs a detailed performance analysis report.

---

## HT-706: Final Demo Rehearsals — 5 Full Run-Throughs & SLA Reports
**Owner: All | Priority: P0 | Days: Fri–Sat**

### Objective
Conduct final comprehensive rehearsals of the entire system on AWS. Run 5 complete iterations of the live demonstration, confirming the entire pipeline runs flawlessly and preparing the final SLA performance reports for review.

### Done-When Criteria
- Completed 5 successful consecutive run-throughs of the live "Flash Sale" demo on AWS.
- SLA compliance remains above 99.5% with zero system downtime under maximum traffic stress.
- Final documentation and walkthrough guides are fully reviewed and approved by the entire team.
