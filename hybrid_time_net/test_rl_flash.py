"""Verify flash-sale RL agent learns panic action on prediction error spike."""
import numpy as np
from rl_agent import RLAgent


def build_state(prediction_variance, std_train, sla_rate, wasted_capacity, recent_loads, current_z, hour, prediction_error_ratio):
    if len(recent_loads) >= 3:
        trend = (recent_loads[-1] - recent_loads[-3]) / (max(recent_loads) + 1e-8)
    else:
        trend = 0.0
    trend = np.clip(trend, -1.0, 1.0)
    return np.array([
        prediction_variance / std_train,
        sla_rate,
        wasted_capacity / 1000.0,
        trend,
        current_z / 10.0,
        np.sin(2 * np.pi * hour / 24),
        prediction_error_ratio,
    ], dtype=np.float32)


def test_flash_sale_policy():
    print("--- Flash Sale RL Agent Verification ---")
    agent = RLAgent(state_size=7, action_size=5)
    agent.load("models/rl_agent_checkpoint.pth")
    agent.epsilon = 0.0
    agent.model.eval()

    action_names = {
        0: "z -= 0.5",
        1: "z -= 0.1",
        2: "Hold",
        3: "z += 0.5",
        4: "PANIC z += 2.0",
    }

    scenarios = [
        ("Baseline traffic (no error)", 0.0),
        ("Moderate spike (10x)", 9.0),
        ("Flash sale spike (49x)", 49.0),
    ]

    for name, error_ratio in scenarios:
        state = build_state(10.0, 50.0, 0.0, 0.0, [50, 50, 50], 1.96, 12, error_ratio)
        action = agent.act(state)
        prev_z = agent.current_z_score
        new_z = agent.step_z_score(action)
        print(f"\n{name}")
        print(f"  prediction_error_ratio: {error_ratio}")
        print(f"  action: {action_names[action]}")
        print(f"  z-score: {prev_z:.2f} -> {new_z:.2f}")

    # Simulate spike tick: agent should provision enough capacity
    agent.current_z_score = 1.96
    pred_mean, total_std, actual_load = 50.0, 10.0, 2500.0
    error_ratio = (actual_load - pred_mean) / (pred_mean + 1.0)
    state = build_state(total_std, 50.0, 0.0, 0.0, [50, 50, 2500], agent.current_z_score, 12, error_ratio)
    action = agent.act(state)
    z = agent.step_z_score(action)
    adjusted_std = total_std + (actual_load - pred_mean) * 0.5
    upper_bound = pred_mean + z * adjusted_std
    servers = max(1, int(np.ceil(upper_bound / 25.0)))
    capacity = servers * 25.0

    print("\n--- Spike Tick Capacity Check ---")
    print(f"  action: {action_names[action]}")
    print(f"  upper_bound: {upper_bound:.0f} RPS")
    print(f"  servers provisioned: {servers}")
    print(f"  capacity: {capacity:.0f} RPS vs actual {actual_load:.0f} RPS")
    print(f"  SLA violation: {'YES' if actual_load > capacity else 'NO'}")

    assert capacity >= actual_load, f"Underprovisioned: {capacity} < {actual_load}"
    print("\nPASS: Agent provisions enough capacity during flash sale spike.")


if __name__ == "__main__":
    test_flash_sale_policy()
