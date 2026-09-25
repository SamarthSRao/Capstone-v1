import os
import torch
import numpy as np
from rl_agent import RLAgent

def build_state(prediction_variance, std_train, sla_rate, wasted_capacity, recent_loads, current_z, hour, prediction_error_ratio):
    if len(recent_loads) >= 3:
        trend = (recent_loads[-1] - recent_loads[-3]) / (max(recent_loads) + 1e-8)
    else:
        trend = 0.0
    trend = np.clip(trend, -1.0, 1.0)
    
    MAX_WASTE = 1000.0
    
    return np.array([
        prediction_variance / std_train,       # [0] normalized variance
        sla_rate,                              # [1] SLA violation rate
        wasted_capacity / MAX_WASTE,           # [2] normalized waste
        trend,                                 # [3] load direction slope
        current_z / 10.0,                      # [4] current policy z-score (scaled to max 10)
        np.sin(2 * np.pi * hour / 24),         # [5] time of day sine
        prediction_error_ratio                 # [6] IMMEDIATE prediction error ratio
    ], dtype=np.float32)

def compute_reward(step_sla_violation, step_wasted_capacity, total_capacity, z_score, prev_z_score):
    # SLA penalty is dominant to force the agent to act aggressively during flash sales
    sla_penalty = -50.0 * step_sla_violation
    
    waste_ratio = step_wasted_capacity / (total_capacity + 1e-8)
    waste_penalty = -2.0 * waste_ratio # [-2, 0] range
    
    Z_STEP = 0.1
    action_cost = -0.1 * abs(z_score - prev_z_score) / Z_STEP
    
    efficiency_bonus = 1.0 if (not step_sla_violation and waste_ratio < 0.15) else 0.0
    
    return sla_penalty + waste_penalty + action_cost + efficiency_bonus

def train_flash_sale_rl():
    print("--- Training RL Agent on Micro-Simulation Flash Sale Data ---")
    
    # 7D state, 5 actions
    agent = RLAgent(state_size=7, action_size=5)
    agent.epsilon = 1.0  # Force exploration
    
    episodes = 1000
    best_reward = -float('inf')
    
    # Simulate a single episode representing the micro-simulation sequence:
    # 5 ticks of 50 RPS, then a massive 2500 RPS spike for 20 ticks.
    # Total ticks = 25.
    workload = [50]*5 + [50 + int(2450 * (i/5)) for i in range(5)] + [2500]*15
    
    # Mock ML predictions (the LSTM predicts 50 initially, lags behind the spike)
    # The LSTM std_dev (variance) initially is small (e.g. 10), then jumps slightly.
    std_train = 50.0
    
    for e in range(episodes):
        sla_violations = 0
        wasted_capacity_sum = 0
        episode_reward = 0.0
        
        recent_loads = [50, 50, 50]
        
        # Reset Z-score
        agent.current_z_score = 1.96
        
        state = build_state(10.0, std_train, 0.0, 0.0, recent_loads, agent.current_z_score, 12, 0.0)
        
        # Simulated "mean" prediction
        pred_mean = 50.0
        total_std = 10.0
        
        for t in range(len(workload)):
            actual_load = workload[t]
            
            # Predictor calculation logic (before RL action)
            prediction_error = max(0.0, actual_load - pred_mean)
            prediction_error_ratio = prediction_error / (pred_mean + 1.0)
            
            # Update state with immediate error ratio
            state[-1] = prediction_error_ratio
            
            action = agent.act(state)
            prev_z = agent.current_z_score
            current_z = agent.step_z_score(action)
            
            # Apply adjusted std logic
            adjusted_std = total_std + (prediction_error * 0.5)
            upper_bound = pred_mean + (current_z * adjusted_std)
            
            # Servers provisioned based on upper bound
            servers = max(1, int(np.ceil(upper_bound / 25.0))) # 25 rps per server
            capacity = servers * 25.0
            
            # Evaluate step
            step_sla = 1 if actual_load > capacity else 0
            step_waste = capacity - actual_load if capacity > actual_load else 0
            
            sla_violations += step_sla
            wasted_capacity_sum += step_waste
            
            reward = compute_reward(step_sla, step_waste, capacity, current_z, prev_z)
            
            # Simulate ML catching up over time
            if t >= 5:
                pred_mean = min(2500.0, pred_mean + 400.0)
                total_std = min(500.0, total_std + 100.0)
                
            recent_loads.append(actual_load)
            if len(recent_loads) > 24: recent_loads.pop(0)
            
            next_state = build_state(
                total_std, std_train, sla_violations / (t+1), wasted_capacity_sum / (t+1),
                recent_loads, current_z, 12, max(0.0, actual_load - pred_mean) / (pred_mean + 1.0)
            )
            
            done = (t == len(workload) - 1)
            
            # Massive bonus for 0 SLA violations across the flash sale
            if done and sla_violations == 0:
                reward += 100.0
                
            agent.remember(state, action, reward, next_state, done)
            state = next_state
            episode_reward += reward
            
            agent.replay(batch_size=32)
            
        if episode_reward > best_reward:
            best_reward = episode_reward
            os.makedirs("models", exist_ok=True)
            agent.save("models/rl_agent_checkpoint.pth")
            
        if (e + 1) % 100 == 0:
            print(f"Episode {e+1}/{episodes} - Reward: {episode_reward:.2f} | SLA Vio: {sla_violations} | Z-Score Final: {agent.current_z_score:.2f} | Epsilon: {agent.epsilon:.3f}")
            
    # Save final
    agent.save("models/rl_agent_checkpoint.pth")
    print("\nTraining Complete! Model saved to models/rl_agent_checkpoint.pth")

if __name__ == "__main__":
    train_flash_sale_rl()
