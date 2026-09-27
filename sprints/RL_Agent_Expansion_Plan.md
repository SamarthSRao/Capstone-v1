# RL Agent Expansion Plan — HybridTimeNet Uncertainty-Aware Autoscaling

**Author:** Samarth S. Rao (RL & Architecture Lead)
**Status:** Draft v1.0
**Date:** July 2026
**Review Scope:** DQN agent in `hybrid_time_net/rl_agent.py` (95 lines) + integration in `services/load-predictor/server.py`

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Training Strategy](#2-training-strategy)
3. [State & Action Space Refinement](#3-state--action-space-refinement)
4. [Reward Shaping](#4-reward-shaping)
5. [Validation & Checkpointing](#5-validation--checkpointing)
6. [Integration Handoff](#6-integration-handoff)
7. [Failure Modes & Mitigations](#7-failure-modes--mitigations)
8. [Timeline & Deliverables](#8-timeline--deliverables)
9. [Appendix: Code Sketches](#9-appendix-code-sketches)

---

## 1. Current State Audit

### What Exists

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| DQN Agent | `hybrid_time_net/rl_agent.py` | 95 | **Structurally complete, functionally untrained** |
| Training Loop | `hybrid_time_net/train.py:183-237` | 55 | **Exists but runs 1 episode** |
| Test Script | `hybrid_time_net/test_rl.py` | 39 | **Scaffold only (requires checkpoint)** |
| gRPC Integration | `services/load-predictor/server.py:109-120` | 12 | **Wired but uses placeholder models** |
| Checkpoint Save | `train.py:240` | 1 | **Works, but no trained weights exist** |

### Critical Gaps Identified

```
GAP 1: Training is 1 episode over ~400 test timesteps (800 * 0.2).
        The agent has seen exactly ONE pass through the data.
        It cannot generalize. Epsilon ends at ~0.995^400 ≈ 0.13,
        meaning 87% of final steps were still random.

GAP 2: No validation split. Train/test is 80/20 on a single synthetic
        dataset. The agent has never been tested on a held-out workload.

GAP 3: server.py lines 97-102 use illustrative placeholders:
        np_pred = lstm_mean * 0.98 + 50
        xgb_residual = (lstm_mean - np_pred) * 0.05
        The RL agent is making decisions on top of fake ensemble signals.

GAP 4: No reward normalization. The reward range is roughly [-100, -0.1]
        per step. Over 400 steps the cumulative reward is deeply negative.
        No baseline subtraction means the agent has no signal for "good."

GAP 5: state_size=3 is a minimal observation. The agent cannot see
        trending patterns, only instantaneous snapshots.
```

---

## 2. Training Strategy

### 2.1 Recommended Episode Count: 500 episodes

**Justification:**

The state space is 3-dimensional (soon to be 5-6D). The action space is 3 discrete. This is a small problem by DQN standards. Empirical guidelines:

| Factor | This Project | Typical DQN |
|--------|-------------|-------------|
| State dims | 3–6 | 4–84 |
| Action dims | 3 | 2–18 |
| Required episodes | 300–500 | 100–10,000+ |

A standard DQN on a 6D state / 3D action converges in **200–400 episodes** on Atari-class problems with millions of steps. Our problem is far smaller. **500 episodes** provides:
- ~200,000 total timesteps (500 × 400 steps/episode)
- Replay buffer of 50,000 fills 25× over (good sample reuse)
- Epsilon fully decays to 0.01 by episode ~920, so we stay slightly exploratory through 500 — this is acceptable for an on-policy-ish DQN

**Recommendation:** Train for **500 episodes**, evaluate every 10 episodes, stop early if reward plateaus for 50 consecutive evaluations.

### 2.2 Episode Structure

```
Episode = one full pass through the test workload dataset (~400 hourly timesteps)

Start:  Reset z_score to 1.96, clear running SLA/waste accumulators
        Initialize state from first timestep variance

Step:   At each hourly timestep t:
        1. Observe state_t = [variance_t, sla_violation_rate_t, waste_ratio_t]
        2. Agent selects action ∈ {0, 1, 2}
        3. Environment updates z_score
        4. Compute servers_allocated = Erlang-C(mean_pred + z * std_t)
        5. Compute reward from actual vs. capacity
        6. Observe state_{t+1}

End:    When t = |test_data| - 1
        Log: total_reward, final_sla_rate, total_waste, final_z_score
        Shuffle episode start position (random window into data) after ep 100
```

**Episode length:** 400 steps (hourly timesteps). This matches the 80/20 split of a 2000-period dataset.

**Randomized windows (episodes 100+):** After 100 fixed-window episodes, randomly sample a 400-step window from the full 2000-step dataset. This prevents the agent from memorizing a single trajectory.

### 2.3 Data Sources

| Phase | Data | Purpose |
|-------|------|---------|
| **Phase 1 (Ep 1–200)** | Synthetic (`ecommerce_dataset.py`, 2000 periods) | Core learning — predictable patterns |
| **Phase 2 (Ep 201–350)** | Synthetic with varied parameters | Generalization — change base_traffic, flash_sale_rate, trend slope |
| **Phase 3 (Ep 351–500)** | Real UCI Online Retail (downloaded via `download_real_ecommerce.py`) | Domain adaptation — real noise, real seasonality |

**Varied synthetic parameters (Phase 2):**
```python
variations = [
    {"base_traffic": 300, "flash_rate": 0.05, "trend_slope": 500},   # Low-traffic, volatile
    {"base_traffic": 800, "flash_rate": 0.01, "trend_slope": 100},   # High-traffic, stable
    {"base_traffic": 500, "flash_rate": 0.08, "trend_slope": 300},   # Flash-sale heavy
    {"base_traffic": 200, "flash_rate": 0.02, "trend_slope": 800},   # Rapidly growing
]
```

### 2.4 Hyperparameter Starting Values

| Parameter | Current | Recommended | Rationale |
|-----------|---------|-------------|-----------|
| `learning_rate` | 0.001 | **0.0005** | Slower learning = more stable convergence for small MDP |
| `gamma` | 0.95 | **0.99** | Autoscaling decisions have long-term consequences; don't discount future SLA violations too aggressively |
| `epsilon` (start) | 1.0 | **1.0** | Keep — full exploration at start |
| `epsilon_min` | 0.01 | **0.05** | Slight ongoing exploration prevents policy collapse |
| `epsilon_decay` | 0.995 | **0.9975** | Slower decay: epsilon reaches 0.05 around episode 370 (not episode 92) |
| `replay_buffer` | 2,000 | **50,000** | Need 25× replay buffer to store diverse experiences across 500 episodes |
| `batch_size` | 32 | **64** | Larger batches stabilize gradient estimates |
| `hidden_size` | 24 | **64** | Current 24-node hidden is too narrow for 5-6D state; increase capacity |
| `target_network` | None | **Add** | Critical for DQN stability (see §9.1) |
| `tau` (soft update) | N/A | **0.005** | Update target network slowly every step |

### 2.5 Measuring Learning

**Required plots (save every 10 episodes):**

```
Plot 1: Reward per Episode (with 10-ep rolling average)
        X: episode, Y: total_reward
        Expect: steep rise ep 1-50, plateau ep 100-200, refinement ep 300+

Plot 2: SLA Violation Rate per Episode
        X: episode, Y: sla_violation_rate (%)
        Target: < 2% by episode 300

Plot 3: Average Wasted Capacity per Episode
        X: episode, Y: avg_wasted_capacity (requests/hr)
        Target: < 200 req/hr by episode 300

Plot 4: Z-Score Trajectory (final z_score per episode)
        X: episode, Y: final_z_score
        Expect: converges to a regime-specific value (likely 1.2–2.5)

Plot 5: Epsilon Decay vs. Reward
        Overlay epsilon curve on reward curve to verify exploration/exploitation balance

Plot 6: State Distribution Heatmap
        X: normalized_variance, Y: sla_violation_rate
        Color: mean action taken
        Shows where agent is confident vs. uncertain
```

**Implementation sketch:**
```python
# In train.py, inside the episode loop:
metrics = {"rewards": [], "sla_rates": [], "waste": [], "z_scores": []}

for ep in range(episodes):
    # ... training ...
    metrics["rewards"].append(total_reward)
    metrics["sla_rates"].append(sla_violation_rate)
    metrics["waste"].append(avg_waste)
    metrics["z_scores"].append(rl_agent.current_z_score)

    if ep % 10 == 0:
        plot_metrics(metrics, save_path=f"logs/ep_{ep}.png")
        torch.save(rl_agent.model.state_dict(), f"logs/model_ep_{ep}.pth")
```

---

## 3. State & Action Space Refinement

### 3.1 Current State: 3D — Insufficient

Current: `[normalized_variance, current_sla_violation_rate, normalized_wasted_capacity]`

**Problem:** These are all instantaneous/aggregated scalars. The agent has no memory of trends. It cannot distinguish "SLA rate is 5% and improving" from "SLA rate is 5% and worsening."

### 3.2 Proposed State: 6D

| Index | Feature | Rationale | Normalization |
|-------|---------|-----------|---------------|
| 0 | `normalized_prediction_variance` | Prediction uncertainty level | Divide by training std |
| 1 | `current_sla_violation_rate` | Rolling SLA compliance (0–1) | Already normalized |
| 2 | `normalized_wasted_capacity` | Over-provisioning cost signal | Divide by max expected waste |
| 3 | `load_trend` | Direction of traffic change (last 3h slope) | Normalize to [-1, 1] |
| 4 | `current_z_score / 5.0` | Current policy state (was hidden in `self.current_z_score`) | Normalize to [0, 1] |
| 5 | `time_of_day_sin` | Circadian phase (captures daily seasonality) | sin(2π * hour / 24) |

**Why each addition matters:**
- **load_trend** (index 3): Without this, the agent cannot anticipate a traffic surge that is 1 hour away. The trend gives 1-hour look-ahead from the prediction itself.
- **current_z_score** (index 4): The agent needs to know its own current action to make coherent decisions. This is standard in control-system RL (the "feedback" signal).
- **time_of_day** (index 5): The workload is highly circadian (peak at noon/8PM, trough at 4AM). Time encoding lets the agent learn time-dependent policies without a recurrent architecture.

**State construction code:**
```python
def build_state(prediction_variance, sla_rate, wasted_capacity,
                recent_loads, current_z, hour):
    trend = (recent_loads[-1] - recent_loads[-3]) / (max(recent_loads) + 1e-8)
    trend = np.clip(trend, -1.0, 1.0)
    return np.array([
        prediction_variance / training_std,   # [0] uncertainty
        sla_rate,                              # [1] SLA compliance
        wasted_capacity / MAX_WASTE,           # [2] waste
        trend,                                 # [3] load direction
        current_z / 5.0,                       # [4] current policy
        np.sin(2 * np.pi * hour / 24),         # [5] time of day
    ], dtype=np.float32)
```

### 3.3 Action Space: Discrete (Recommended)

**Current:** 3 discrete actions: decrease, hold, increase z-score by 0.1.

**Recommendation: Expand to 5 discrete actions.**

| Action | Effect | When appropriate |
|--------|--------|-----------------|
| 0 | z -= 0.2 (aggressive decrease) | Waste is high, SLA is comfortable |
| 1 | z -= 0.1 (moderate decrease) | Waste is moderate, SLA is good |
| 2 | z += 0.0 (hold) | System is balanced |
| 3 | z += 0.1 (moderate increase) | SLA rate degrading, variance rising |
| 4 | z += 0.2 (aggressive increase) | SLA violations imminent, high variance |

**Why not continuous?**
- DQN requires discrete actions. Switching to continuous would mean switching to DDPG/TD3/SAC — a fundamentally different algorithm with 3× the implementation complexity and more hyperparameters.
- For a capstone, the marginal benefit of continuous z-score control does not justify the engineering cost. 5 discrete buckets cover the action space adequately.
- The z-score step is already fine-grained (0.1 increments over a [0, 5] range = 50 possible values). The agent can reach any z-score within 25 steps.

**Z-score constraints:**
```python
Z_MIN = 0.0    # No uncertainty margin (risky, but allowed)
Z_MAX = 5.0    # Maximum margin (extreme over-provisioning)
Z_STEP = 0.1   # Minimum granularity
```

These are already enforced in `rl_agent.py:54-56`. Keep them.

---

## 4. Reward Shaping

### 4.1 Current Reward Analysis

```python
reward = -(100.0 * step_sla_violation) - (0.1 * step_wasted_capacity)
```

**Problems:**

1. **Scale imbalance.** A single SLA violation = -100. Typical wasted capacity per step ≈ 50-500 → reward contribution ≈ -5 to -50. The agent will learn to *never* violate SLA at any cost, even if it means allocating 10× the needed servers. The waste penalty is too weak to counterbalance.

2. **Sparse SLA signal.** If the agent learns a reasonably good z-score (say, 1.5), SLA violations become rare (< 2% of steps). For 98% of steps, the reward is only the waste term. The agent gets almost no signal about whether its policy is good or bad during non-violation periods.

3. **No normalization.** The cumulative reward over 400 steps is roughly -200 to -5000 depending on the policy. This raw range is hard for the agent to learn from without a baseline.

### 4.2 Proposed Multi-Objective Scalarization

**Weighted penalty with normalized components:**

```python
def compute_reward(step_sla_violation, step_wasted_capacity,
                   total_capacity, z_score, prev_z_score):
    # --- Component 1: SLA penalty (binary, dominant) ---
    sla_penalty = -10.0 * step_sla_violation

    # --- Component 2: Waste penalty (proportional, normalized) ---
    waste_ratio = step_wasted_capacity / (total_capacity + 1e-8)
    waste_penalty = -2.0 * waste_ratio  # [-2, 0] range

    # --- Component 3: Action stability penalty (discourage thrashing) ---
    action_cost = -0.5 * abs(z_score - prev_z_score) / Z_STEP

    # --- Component 4: Efficiency bonus (reward good allocations) ---
    efficiency_bonus = 1.0 if (not step_sla_violation and waste_ratio < 0.15) else 0.0

    return sla_penalty + waste_penalty + action_cost + efficiency_bonus
```

**Reward component scales:**

| Component | Range | Weight | Purpose |
|-----------|-------|--------|---------|
| SLA penalty | [-10, 0] | -10.0 | Primary: avoid under-provisioning |
| Waste penalty | [-2, 0] | -2.0 | Secondary: minimize over-provisioning |
| Action cost | [-1, 0] | -0.5 | Stability: discourage z-score oscillation |
| Efficiency bonus | [0, 1] | +1.0 | Positive reinforcement for good states |

**Expected reward range:** [-13, +1] per step. This is well-scaled for a DQN with MSE loss.

### 4.3 Handling Sparse SLA Violations

If SLA violations are rare (< 5% of steps), the agent gets the -10 penalty infrequently. Mitigations:

1. **Curriculum difficulty scaling.** In the first 100 episodes, artificially increase flash sale frequency to 8-10% (from 2%). This ensures the agent encounters SLA violations often enough to learn the penalty. Reduce to natural rates (2%) in episodes 100+.

2. **Hindsight experience replay (HER) for SLA events.** When an SLA violation occurs, store an additional "relabeled" transition where the reward is amplified by 2×. This oversamples critical moments.

3. **Auxiliary reward from prediction confidence.** Even when no SLA violation occurs, reward the agent for keeping the upper_bound close to actual load (informational signal):

```python
# Near-miss signal (activates when actual load is within 10% of capacity)
if not step_sla_violation:
    headroom = (total_capacity - actual_w) / (actual_w + 1e-8)
    if 0.0 < headroom < 0.10:
        near_miss_bonus = -3.0  # Too close for comfort
    elif headroom > 0.30:
        near_miss_bonus = -1.0  # Wasting too much
    else:
        near_miss_bonus = 0.5   # Sweet spot
```

### 4.4 Step Penalties vs. Episode-End Penalties

**Use step-level penalties (current approach).** Reasons:
- Step-level gives dense reward at every timestep (400 signals per episode).
- Episode-end penalties (e.g., "total SLA violation rate > 5% → -100") create a credit assignment problem: the agent cannot tell which early steps led to the end-of-episode penalty.
- Exception: add a **terminal bonus/penalty** as a tiebreaker:

```python
if done:
    if final_sla_rate < 0.02:
        terminal_bonus = 20.0  # Excellent SLA compliance
    elif final_sla_rate > 0.05:
        terminal_bonus = -50.0  # Unacceptable SLA
    else:
        terminal_bonus = 0.0
    reward += terminal_bonus
```

---

## 5. Validation & Checkpointing

### 5.1 Convergence Criteria

The agent is considered "learned" when **all three** hold for 50 consecutive evaluations (every 10 episodes):

| Criterion | Threshold | Measurement |
|-----------|-----------|-------------|
| Reward stability | Rolling 10-episode mean reward variance < 5% of mean | `std(last_10_rewards) / mean(last_10_rewards) < 0.05` |
| SLA compliance | SLA violation rate < 2% on evaluation episodes | `sla_violations / total_steps < 0.02` |
| Waste efficiency | Average waste < 15% of allocated capacity | `avg_waste / avg_capacity < 0.15` |

**Early stopping:** If no improvement in rolling mean reward for 50 consecutive evaluations, stop training.

### 5.2 Checkpoint Strategy

| Trigger | File | Retention |
|---------|------|-----------|
| Every 10 episodes | `checkpoints/ep_{N}.pth` | Keep last 5 only |
| Best-so-far reward | `checkpoints/best.pth` | Always overwrite |
| Every 50 episodes | `checkpoints/ep_{N}_full.pth` | Keep all (for ablation) |
| On convergence | `checkpoints/converged.pth` | Final production checkpoint |

**Checkpoint format (expanded from current):**
```python
torch.save({
    'model_state_dict': self.model.state_dict(),
    'target_model_state_dict': self.target_model.state_dict(),
    'optimizer_state_dict': self.optimizer.state_dict(),
    'current_z_score': self.current_z_score,
    'episode': episode_num,
    'epsilon': self.epsilon,
    'training_metrics': {
        'reward_history': reward_history,
        'sla_history': sla_history,
        'waste_history': waste_history,
    },
    'hyperparams': {
        'gamma': self.gamma,
        'lr': self.learning_rate,
        'state_size': self.state_size,
        'action_size': self.action_size,
    }
}, filepath)
```

### 5.3 Generalization Testing

**Three-tier evaluation protocol:**

| Tier | Dataset | Purpose | Pass criteria |
|------|---------|---------|---------------|
| **In-domain** | Synthetic test set (same params as training) | Baseline | SLA < 2%, waste < 15% |
| **Distribution shift** | Synthetic with 30% higher flash-sale rate | Robustness | SLA < 4%, waste < 25% |
| **Domain transfer** | UCI Online Retail (real data) | Generalization | SLA < 5%, waste < 30% |

Run all three tiers after every 50 episodes. If in-domain improves but distribution shift degrades, the agent is overfitting — reduce learning rate or increase buffer diversity.

### 5.4 Safety Fallback Mechanism

```python
class SafeRLAgent:
    def __init__(self, rl_agent, rule_based_z=1.96):
        self.rl_agent = rl_agent
        self.rule_based_z = rule_based_z
        self.consecutive_violations = 0

    def act(self, state):
        rl_action = self.rl_agent.act(state)
        proposed_z = self.rl_agent.step_z_score(rl_action)

        # Guardrail 1: z-score floor (never go below 0.5)
        proposed_z = max(0.5, proposed_z)

        # Guardrail 2: if SLA violations spike, override to rule-based
        if state[1] > 0.10:  # SLA violation rate > 10%
            self.consecutive_violations += 1
            if self.consecutive_violations > 5:
                return self.rule_based_z  # Override to fixed z=1.96
        else:
            self.consecutive_violations = 0

        return proposed_z
```

---

## 6. Integration Handoff

### 6.1 Checkpoint Format & Size

| Format | Size (approx.) | Load time |
|--------|----------------|-----------|
| Current `.pth` (model only) | ~25 KB (3-layer MLP) | < 1 ms |
| Full checkpoint (model + optimizer + metrics) | ~150 KB | < 5 ms |
| ONNX export (for production) | ~20 KB | < 1 ms |

The model is tiny (< 25 KB). No optimization needed for size.

**ONNX export for production inference:**
```python
dummy_input = torch.FloatTensor(np.zeros((1, 6)))  # 6D state
torch.onnx.export(
    self.model, dummy_input, "rl_agent.onnx",
    input_names=["state"], output_names=["q_values"],
    dynamic_axes={"state": {0: "batch"}}
)
```

### 6.2 Orchestrator Integration Latency

**Current flow in `server.py`:**
```
GetPrediction RPC received → LSTM inference (~15ms) → RL agent.act() (~0.1ms) → Response
```

The RL agent forward pass is **< 0.1 ms** on CPU (3-layer MLP, 64 hidden, batch=1). This is negligible compared to the LSTM inference and gRPC overhead.

**Latency budget:**

| Component | Latency |
|-----------|---------|
| gRPC deserialization | ~0.5 ms |
| LSTM MC Dropout (100 samples) | ~15 ms |
| RL agent.act() | ~0.1 ms |
| Erlang-C solver | ~0.01 ms |
| gRPC serialization + send | ~0.5 ms |
| **Total** | **~16 ms** |

RL adds < 1% overhead. No optimization needed.

### 6.3 Monitoring Agent Decisions Post-Deployment

**Add to `server.py` a decision logger:**

```python
import logging

rl_logger = logging.getLogger("rl_decisions")
rl_logger.setLevel(logging.INFO)
handler = logging.FileHandler("logs/rl_decisions.log")
rl_logger.addHandler(handler)

# In GetPrediction():
rl_logger.info({
    "timestamp": datetime.utcnow().isoformat(),
    "state": current_state.tolist(),
    "action": action,
    "z_score": current_z_score,
    "predicted_mean": mean,
    "total_std": std_dev,
    "upper_bound": upper_bound,
})
```

**Dashboard integration:** Expose RL decisions via a `/api/rl-status` endpoint on the orchestrator, returning the last 100 agent decisions. The React dashboard (Arya's component) can visualize:
- Z-score over time (line chart)
- Action distribution (pie chart: decrease/hold/increase)
- SLA compliance trend

### 6.4 Retraining Cadence

**Recommended: Periodic batch retraining (weekly).**

| Strategy | Pros | Cons | Verdict |
|----------|------|------|---------|
| Static (train once, freeze) | Simple, predictable | Cannot adapt to traffic drift | Acceptable for capstone demo |
| Online learning (update every step) | Adapts continuously | Unstable, requires careful tuning | Too risky for capstone |
| **Periodic batch (weekly)** | **Adapts to drift, stable** | **Requires retraining pipeline** | **Recommended** |

For the capstone demo: use static training with pre-trained checkpoint. If time permits, implement weekly batch retraining as a stretch goal.

---

## 7. Failure Modes & Mitigations

### 7.1 Degenerate Policy: Always Max Z-Score

**Symptom:** Agent learns to set z=5.0 always, allocating 3× needed servers. SLA is perfect, waste is extreme. Reward is locally optimal because the -10 SLA penalty dominates.

**Root cause:** The waste penalty weight (currently -2.0 on normalized waste) is too low relative to SLA penalty (-10.0).

**Mitigations:**
1. Increase waste penalty weight to -5.0 and verify reward balance in simulation.
2. Add a **capacity cost term** proportional to total servers allocated:

```python
capacity_cost = -1.0 * (servers_allocated / expected_servers)
# If agent allocates 3x needed: cost = -3.0 per step
```

3. **Action regularizer:** Add L2 penalty on z-score magnitude:

```python
z_penalty = -0.3 * (z_score / Z_MAX) ** 2
```

### 7.2 Insufficient Reward Signal (SLA Rarely Violated)

**Symptom:** After 200 episodes, the agent has a good policy. SLA violations drop to < 1%. The reward signal becomes almost entirely the waste term, and the agent cannot distinguish between "good" and "great" policies.

**Mitigations:**
1. **Dense auxiliary reward** (§4.3): Near-miss signals and efficiency bonuses provide gradient even when SLA is met.
2. **Reward clipping:** Clip per-step reward to [-1, +1] to prevent any single component from dominating.
3. **Curriculum:** Start with easy traffic, progressively increase difficulty.

### 7.3 Non-Stationary Traffic Patterns

**Symptom:** Agent trained on Q1 traffic patterns fails on Q3 (holiday season traffic is fundamentally different).

**Mitigations:**
1. **Domain randomization during training** (§2.3, Phase 2): Train on varied traffic patterns.
2. **Ensemble of agents:** Maintain 3 agents trained on different traffic regimes. Use a meta-controller to select the best agent based on recent performance.
3. **Sliding window retraining:** Keep a buffer of the last 2000 hours of real traffic. Retrain weekly on this buffer.

### 7.4 Training Instability (DQN Known Issues)

**Symptom:** Reward oscillates wildly, Q-values explode, agent forgets good policies.

**Mitigations (already identified in §2.4):**
1. **Target network** (§9.1): Without this, DQN is notoriously unstable. This is the single most important fix.
2. **Gradient clipping:** Clip gradients to [-1, 1] norm.
3. **Double DQN** (§9.2): Reduces Q-value overestimation.

---

## 8. Timeline & Deliverables

### 8.1 Week-by-Week Breakdown (RL Focus)

| Week | Task | Deliverable | Owner |
|------|------|-------------|-------|
| **Week 1** (Now) | Expand state to 6D, actions to 5, add target network, fix reward shaping | Updated `rl_agent.py` (v2), updated `train.py` | Samarth |
| **Week 2** | Train 500 episodes on synthetic data, generate metric plots, tune hyperparams | `checkpoints/best.pth`, `logs/metrics_*.png` | Samarth |
| **Week 3** | Cross-domain validation (UCI data), safety fallback implementation | `test_rl.py` updated with 3-tier eval, `SafeRLAgent` class | Samarth |
| **Week 4** | Integration: wire real model outputs in `server.py`, ONNX export, dashboard endpoint | Production-ready `server.py`, `rl_agent.onnx` | Samarth + Arya |
| **Week 5** | End-to-end smoke test with Docker Compose, latency benchmarking | `docker-compose up` works end-to-end, < 20ms RL overhead confirmed | Samarth |
| **Week 6** | Final demo rehearsal, edge case testing, documentation | Demo-ready checkpoint, RL section of final report | Samarth |

### 8.2 Acceptance Criteria

| Metric | Baseline (Fixed z=1.96) | Target (RL Agent) | Stretch Goal |
|--------|------------------------|-------------------|--------------|
| SLA violation rate | ~5% (measured from current pipeline) | **< 2%** | < 1% |
| Average waste (% of capacity) | ~25% | **< 15%** | < 10% |
| Z-score adaptation range | Static 1.96 | **1.0–3.0** (dynamic) | 0.5–4.0 |
| Inference latency addition | 0 ms | **< 1 ms** | < 0.5 ms |
| Checkpoint load time | < 5 ms | **< 5 ms** | < 1 ms |
| Generalization (real data) | N/A | **SLA < 5%** | SLA < 3% |

### 8.3 Dependencies

| Dependency | Blocks | Owner | Status |
|------------|--------|-------|--------|
| ML models producing real predictions (not placeholders in server.py:97-102) | Full integration testing | Samarth | **BLOCKED** — server.py uses illustrative values |
| Telemetry pipeline (SLA violation rate, wasted capacity from orchestrator) | State construction in production | Chirrag | In progress (Week 3 sprint) |
| Dashboard RL visualization component | Monitoring post-deployment | Arya | Not started (Week 3 sprint) |
| Docker Compose with all services wired | End-to-end smoke test | Team | Partially done |

---

## 9. Appendix: Code Sketches

### 9.1 Target Network Addition (Critical Fix)

The current DQN trains and evaluates on the same network. This is the #1 cause of DQN instability. Add a target network:

```python
class DQNAgent:
    def __init__(self, state_size=6, action_size=5):
        self.state_size = state_size
        self.action_size = action_size
        self.memory = deque(maxlen=50000)
        self.gamma = 0.99
        self.epsilon = 1.0
        self.epsilon_min = 0.05
        self.epsilon_decay = 0.9975
        self.learning_rate = 0.0005
        self.batch_size = 64
        self.tau = 0.005

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Main network
        self.model = DQN(state_size, action_size).to(self.device)
        # Target network (frozen copy, updated slowly)
        self.target_model = DQN(state_size, action_size).to(self.device)
        self.target_model.load_state_dict(self.model.state_dict())

        self.optimizer = optim.Adam(self.model.parameters(), lr=self.learning_rate)
        self.criterion = nn.SmoothL1Loss()  # Huber loss (more stable than MSE)
        self.current_z_score = 1.96

    def update_target(self):
        """Soft update: target = tau * main + (1 - tau) * target"""
        for target_param, main_param in zip(
            self.target_model.parameters(), self.model.parameters()
        ):
            target_param.data.copy_(
                self.tau * main_param.data + (1.0 - self.tau) * target_param.data
            )

    def replay(self, batch_size):
        if len(self.memory) < batch_size:
            return
        minibatch = random.sample(self.memory, batch_size)

        states = torch.FloatTensor(np.array([t[0] for t in minibatch])).to(self.device)
        actions = torch.LongTensor([t[1] for t in minibatch]).to(self.device)
        rewards = torch.FloatTensor([t[2] for t in minibatch]).to(self.device)
        next_states = torch.FloatTensor(np.array([t[3] for t in minibatch])).to(self.device)
        dones = torch.BoolTensor([t[4] for t in minibatch]).to(self.device)

        # Current Q values from main network
        current_q = self.model(states).gather(1, actions.unsqueeze(1)).squeeze(1)

        # Next Q values from TARGET network (this is the key fix)
        with torch.no_grad():
            next_q = self.target_model(next_states).max(1)[0]
            next_q[dones] = 0.0
            target_q = rewards + self.gamma * next_q

        loss = self.criterion(current_q, target_q)

        self.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
        self.optimizer.step()

        self.update_target()  # Soft update every step

        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
```

### 9.2 Double DQN Extension (Reduces Overestimation)

```python
# In replay(), replace the next_q computation:
with torch.no_grad():
    # Double DQN: use MAIN network to SELECT action, TARGET network to EVALUATE
    next_actions = self.model(next_states).argmax(1)
    next_q = self.target_model(next_states).gather(1, next_actions.unsqueeze(1)).squeeze(1)
    next_q[dones] = 0.0
    target_q = rewards + self.gamma * next_q
```

### 9.3 Training Loop with Metrics Logging

```python
def train_rl_agent(agent, train_data, test_data, allocator,
                   episodes=500, eval_interval=10):
    metrics = {"rewards": [], "sla_rates": [], "waste": [], "z_scores": []}
    best_reward = float('-inf')

    for ep in range(episodes):
        # Randomized window (after ep 100)
        if ep >= 100:
            max_start = len(train_data) - 400
            start = random.randint(0, max_start)
            episode_data = train_data[start:start+400]
        else:
            episode_data = train_data[:400]

        state = build_initial_state(episode_data)
        total_reward = 0
        sla_violations = 0

        for t in range(len(episode_data)):
            action = agent.act(state)
            prev_z = agent.current_z_score
            z_score = agent.step_z_score(action)

            pred = episode_data[t]["predicted"]
            actual = episode_data[t]["actual"]
            variance = episode_data[t]["variance"]

            servers = allocator.get_required_servers(pred, z_score * variance)
            capacity = servers * allocator.mu

            violated = actual > capacity
            wasted = max(0, capacity - actual)

            reward = compute_reward(violated, wasted, capacity, z_score, prev_z)
            total_reward += reward

            if violated:
                sla_violations += 1

            next_state = build_state(variance, sla_violations/(t+1),
                                     wasted/(capacity+1), ...)

            agent.remember(state, action, reward, next_state,
                           t == len(episode_data) - 1)
            agent.replay(agent.batch_size)
            state = next_state

        # Episode stats
        sla_rate = sla_violations / len(episode_data)
        avg_waste = np.mean([t.get("waste", 0) for t in episode_data[:t+1]])

        metrics["rewards"].append(total_reward)
        metrics["sla_rates"].append(sla_rate)
        metrics["waste"].append(avg_waste)
        metrics["z_scores"].append(agent.current_z_score)

        # Evaluation & checkpointing
        if (ep + 1) % eval_interval == 0:
            eval_reward = evaluate(agent, test_data, allocator)
            print(f"Ep {ep+1}: train_reward={total_reward:.1f} "
                  f"eval_reward={eval_reward:.1f} sla={sla_rate:.3f} "
                  f"epsilon={agent.epsilon:.3f}")

            if eval_reward > best_reward:
                best_reward = eval_reward
                agent.save("checkpoints/best.pth")

            plot_metrics(metrics, f"logs/eval_ep_{ep+1}.png")

            # Early stopping
            if len(metrics["rewards"]) >= 50:
                recent = metrics["rewards"][-50:]
                if np.std(recent) / (abs(np.mean(recent)) + 1e-8) < 0.05:
                    print(f"Converged at episode {ep+1}")
                    break

    agent.save("checkpoints/final.pth")
    return metrics
```

### 9.4 Updated `server.py` Integration

Replace the placeholder RL section in `server.py:109-120` with:

```python
# RL Agent Observation (6D state)
current_sla = request.sla_violation_rate
current_wasted = request.wasted_capacity
current_var_norm = float(total_std) / self.std_train

# Compute load trend from recent predictions
if len(self.recent_predictions) >= 3:
    load_trend = (self.recent_predictions[-1] - self.recent_predictions[-3]) / \
                 (max(self.recent_predictions) + 1e-8)
else:
    load_trend = 0.0

hour = datetime.now().hour
current_state = build_state(
    current_var_norm, current_sla, current_wasted,
    self.recent_predictions, self.rl_agent.current_z_score, hour
)

action = self.rl_agent.act(current_state)
current_z_score = self.rl_agent.step_z_score(action)

# Apply safety guardrails
current_z_score = max(0.5, min(5.0, current_z_score))

self.recent_predictions.append(lstm_mean)
if len(self.recent_predictions) > 10:
    self.recent_predictions.pop(0)

self.last_state = current_state
```

---

## Summary: Priority Actions

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | Add target network to DQN | Prevents training instability | 30 min |
| **P0** | Expand state to 6D, actions to 5 | Agent can see trends + its own state | 1 hr |
| **P0** | Fix reward shaping (normalize, add waste weight, action cost) | Prevents degenerate policies | 1 hr |
| **P1** | Train 500 episodes with metrics logging | First real checkpoint | 2 hrs compute |
| **P1** | Implement 3-tier evaluation protocol | Validates generalization | 1 hr |
| **P1** | Add safety fallback (`SafeRLAgent`) | Production safety net | 30 min |
| **P2** | Wire real model outputs in `server.py` | Removes placeholder dependency | 2 hrs |
| **P2** | ONNX export + dashboard integration | Production deployment | 1 hr |
| **P3** | Periodic retraining pipeline | Long-term adaptability | Stretch goal |

**Estimated total effort for P0 + P1: ~6-8 hours of engineering + 2 hours compute time.**
**Agent is "production-ready" after P0 + P1 + P2 complete: ~2-3 days of focused work.**
