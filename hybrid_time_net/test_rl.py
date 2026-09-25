import numpy as np
from rl_agent import RLAgent
from train_rl_flash import build_state

ACTION_NAMES = {0: "z -= 0.5", 1: "z -= 0.1", 2: "Hold", 3: "z += 0.5", 4: "PANIC z += 2.0"}


def test_rl_agent():
    print("Loading Trained RL Agent...")
    agent = RLAgent(state_size=7, action_size=5)
    try:
        agent.load("models/rl_agent_checkpoint.pth")
        agent.model.eval()
        agent.epsilon = 0.0
        print("Model loaded successfully.")
    except Exception as e:
        print(f"Error loading model (it might not be saved yet): {e}")
        return

    print("\n--- Testing Agent Scenarios ---")

    scenarios = [
        ("Baseline traffic", build_state(10.0, 50.0, 0.0, 0.0, [50, 50, 50], 1.96, 12, 0.0)),
        ("Moderate spike", build_state(10.0, 50.0, 0.0, 0.0, [50, 50, 500], 1.96, 12, 9.0)),
        ("Flash sale spike", build_state(10.0, 50.0, 0.0, 0.0, [50, 50, 2500], 1.96, 12, 49.0)),
    ]

    for name, state in scenarios:
        action = agent.act(state)
        print(f"\nScenario: {name}")
        print(f"State (7D): {state}")
        print(f"RL Agent Decision: {ACTION_NAMES[action]} (Action ID: {action})")


if __name__ == "__main__":
    test_rl_agent()
