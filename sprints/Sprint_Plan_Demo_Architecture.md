# Sprint Plan: The Dual-Monitor Live Simulation Demo

**Team:** Samarth (RL & Architecture) · Arya (Dashboard UI) · Vindhya (E-Commerce UI) · Chirrag (E-Commerce Backend)
**Objective:** Build a flawless, interactive two-monitor demonstration showing real-time AI cloud scaling against a live e-commerce workload.

---

## 🎬 The Final Demo Vision (What We Are Building Towards)

Picture the final presentation setup:

*   **Monitor 1 (The Control Center):** Shows the HybridTimeNet Dashboard. This is the "God View." It has a control panel with a **"Simulate Flash Sale"** button. The rest of the screen displays live graphs of Actual Load vs. RL Predicted Load.
*   **Monitor 2 (The User Experience):** Shows the **NexusGear E-Commerce Store**. It looks like a real, premium shopping site.
*   **The Action:** You (Samarth) click "Simulate Flash Sale" on Monitor 1. Suddenly, massive simulated traffic starts hammering the E-Commerce Store on Monitor 2. 
*   **The Magic:** Almost instantly, the RL Agent (Python) detects the acceleration in the telemetry, predicts the impending massive spike *before* it peaks, and the Dashboard graphs show the "Predicted Bound" expanding and "Active Servers" scaling up to save the E-Commerce store from crashing.

---

## 👥 Team Roles & Epic Assignments

To achieve this, we are splitting the project into three distinct development tracks.

### 1. The E-Commerce Store Team (Vindhya & Chirrag)
Your goal is to build Monitor 2. A fully functional, mock e-commerce storefront that can accept and generate traffic.

**Vindhya (E-Commerce Frontend):**
*   **Task 1: Storefront Scaffold:** Set up a Vite + React project (`services/ecommerce`). Apply a premium dark theme.
*   **Task 2: Product Catalog & Cart:** Build a CSS grid of mock products. Implement a React Context for the Shopping Cart (Add/Remove items).
*   **Task 3: Dynamic Pricing UI:** Create a React Hook that polls the backend load. If load is extremely high, display a "🔥 High Demand Pricing" badge and increase prices by 20% on the UI.

**Chirrag (E-Commerce Backend & Integration):**
*   **Task 1: Mock Backend/DB Setup:** Set up a simple PostgreSQL database holding products and orders.
*   **Task 2: The Checkout API:** Write a Go API endpoint (`/api/checkout`). When Vindhya's frontend hits this, it writes to the DB.
*   **Task 3: The Crucial Link:** Every time your `/api/checkout` endpoint is hit, it **must** increment the load counter in the Go Simulator so the RL Agent can see the traffic.

### 2. The Dashboard Team (Arya)
Your goal is to build Monitor 1. The visualizer and the trigger mechanism.

**Arya (Dashboard Frontend):**
*   **Task 1: The Control Panel:** Build the `SimulationControlPanel.tsx` component. It needs a dropdown for traffic types (Organic, Flash Sale) and a massive "Simulate Load" button.
*   **Task 2: Triggering the Load:** When the button is clicked, it sends a POST request to Samarth's Go Simulator (`http://localhost:8083/start-simulation`) containing an array of massive traffic numbers.
*   **Task 3: Live Telemetry Graphs:** Build the `ComposedChart` using Recharts. It must poll `/metrics` every second and plot 3 lines: **Actual Load** (Red), **RL Predicted Mean** (Blue), and **Provisioned Servers** (Green bars).

### 3. The RL Engine & Architecture (Samarth)
Your goal is the invisible brain connecting Monitor 1 and Monitor 2.

**Samarth (RL Agent & Core Simulator):**
*   **Task 1: The Tick Engine:** Finalize the Go Simulator. It must accept Arya's `/start-simulation` array and implement a "Tick" loop that applies that load second-by-second.
*   **Task 2: RL Agent Inference:** Wire the Python Bayesian LSTM to read the live RPS history from the Go Simulator. It must output its prediction for the next 60 seconds.
*   **Task 3: The Scaling Action:** Implement the Erlang-C math. Based on the RL prediction, calculate how many servers are needed, and expose this back to Arya's dashboard so the graphs show the servers scaling up *before* the spike hits.

---

## 🗓️ Weekly Execution Plan

### Week 1: The Skeletons
*   **Vindhya:** Scaffold the React store, build static product cards.
*   **Chirrag:** Initialize the Go API module, create the mock DB schema.
*   **Arya:** Scaffold the Next.js/React Dashboard, build the empty Recharts graphs.
*   **Samarth:** Finalize the `docker-compose.yml` so all 4 services (Store, API, Simulator, Dashboard) spin up together locally.

### Week 2: Wiring the Traffic
*   **Vindhya & Chirrag:** Wire the React Cart to the Go `/api/checkout` endpoint. Clicking "Buy" should successfully create a DB order.
*   **Arya & Samarth:** Wire the Dashboard's "Simulate" button to the Go Simulator. Clicking the button should make the Go backend start generating artificial load.

### Week 3: The RL Brain & The Visuals
*   **Samarth:** Connect the Python RL Agent. It reads the load generated in Week 2, and outputs its prediction.
*   **Arya:** Update the Dashboard graphs to plot Samarth's live predictions alongside the actual load.
*   **Vindhya:** Add the "Chaos UI" to the storefront — if the backend is struggling, show a yellow warning banner to make the demo feel real.

### Week 4: End-to-End Rehearsal
*   Run the complete dual-monitor setup. 
*   **The Test:** Samarth presses the button. Traffic spikes. The RL agent predicts it. The graphs cross. The demo is flawless. 
*   Fix any latency bugs or graph rendering glitches.
