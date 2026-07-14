import numpy as np
from rl_agent import RLAgent
import torch

def test_rl_agent():
    print("Loading Trained RL Agent...")
    agent = RLAgent(state_size=3, action_size=3)
    try:
        agent.load("models/rl_agent_checkpoint.pth")
        agent.model.eval()
        agent.epsilon = 0.0 # pure exploitation (no random exploration)
        print("Model loaded successfully.")
    except Exception as e:
        print(f"Error loading model (it might not be saved yet): {e}")
        return

    print("\n--- Testing Agent Scenarios ---")
    
    # State format: [normalized_variance, current_sla_violation_rate, normalized_wasted_capacity]
    
    scenarios = [
        {"name": "High Volatility, High SLA Violations", "state": np.array([2.5, 0.15, 0.0])},
        {"name": "Low Volatility, High Wasted Capacity", "state": np.array([0.5, 0.0, 0.8])},
        {"name": "Stable System (No Violations, Low Waste)", "state": np.array([1.0, 0.0, 0.1])},
    ]

    for s in scenarios:
        state = s["state"]
        action = agent.act(state)
        
        # Action map: 0 = decrease margin, 1 = hold, 2 = increase margin
        action_map = {0: "Decrease Uncertainty Margin", 1: "Hold Margin Steady", 2: "Increase Uncertainty Margin"}
        
        print(f"\nScenario: {s['name']}")
        print(f"State [Var, SLA, Waste]: {state}")
        print(f"RL Agent Decision: {action_map[action]} (Action ID: {action})")

if __name__ == "__main__":
    test_rl_agent()
