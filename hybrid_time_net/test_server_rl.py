"""Verify load-predictor server loads flash-trained RL agent and scales on spike."""
import os
import sys
import numpy as np

# Mirror server.py import path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "load-predictor")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "hybrid_time_net")))

from rl_agent import RLAgent


def test_server_rl_integration():
    print("--- Server RL Integration Test ---")
    models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "load-predictor", "models"))

    agent = RLAgent(state_size=7, action_size=5)
    agent.epsilon = 0.0
    checkpoint = os.path.join(models_dir, "rl_agent_checkpoint.pth")
    assert os.path.exists(checkpoint), f"Missing checkpoint: {checkpoint}"
    agent.load(checkpoint)
    print(f"Loaded checkpoint from {checkpoint}")

    # Simulate GetPrediction state construction (flash sale spike)
    history = np.array([50.0] * 23 + [2500.0])  # sudden spike on last tick
    mean = 50.0
    total_std = 10.0
    hour = 12

    prediction_error = max(0.0, history[-1] - mean)
    error_ratio = prediction_error / (mean + 1.0)

    current_state = np.array([
        total_std / 50.0,
        0.0,  # sla_violation_rate
        0.0,  # wasted_capacity
        (history[-1] - history[-3]) / (max(history) + 1e-8),
        agent.current_z_score / 10.0,
        np.sin(2 * np.pi * hour / 24),
        error_ratio,
    ], dtype=np.float32)

    action = agent.act(current_state)
    current_z_score = agent.step_z_score(action)
    adjusted_std = total_std + prediction_error * 0.5
    upper_bound = mean + current_z_score * adjusted_std
    servers = max(1, int(np.ceil(upper_bound / 25.0)))

    action_names = {0: "z-=0.5", 1: "z-=0.1", 2: "Hold", 3: "z+=0.5", 4: "PANIC"}
    print(f"\nFlash spike detected:")
    print(f"  history[-1]: {history[-1]:.0f} RPS, mean prediction: {mean:.0f} RPS")
    print(f"  prediction_error_ratio: {error_ratio:.1f}")
    print(f"  RL action: {action_names[action]}")
    print(f"  z-score: {current_z_score:.2f}")
    print(f"  upper_bound: {upper_bound:.0f} RPS -> {servers} servers")

    assert action == 4, f"Expected PANIC action (4), got {action}"
    assert upper_bound >= history[-1], f"Underprovisioned: upper_bound={upper_bound} < actual={history[-1]}"
    assert servers >= 100, f"Expected 100+ servers, got {servers}"
    print("\nPASS: Server integration scales correctly on 50x flash sale spike.")


if __name__ == "__main__":
    test_server_rl_integration()
