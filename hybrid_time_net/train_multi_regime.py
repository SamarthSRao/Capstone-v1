#!/usr/bin/env python3
"""
Multi-Regime HybridTimeNet & RL Training Pipeline
Trains:
1. Bayesian LSTM (epistemic + aleatoric uncertainty via MC Dropout)
2. Seasonality Linear Regression (diurnal sine/cosine harmonics)
3. XGBoost Residual Model (non-linear residual patterns)
4. Fusion MLP (optimal blending of point predictions)
5. 7D Deep Q-Network RL Agent (dynamic Z-score adaptation with panic mode)

Saves all checkpoints to hybrid_time_net/models/ and synchronizes them to
services/load-predictor/models/.
"""

import os
import sys
import json
import shutil
import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from models.lstm import BayesianLSTM
from models.xgboost_residuals import XGBoostResidualModel
from models.hybrid_mlp import HybridMLPFusion
from rl_agent import RLAgent
from data.load_real_world_datasets import build_multi_regime_dataset

MODELS_DIR = os.path.join(BASE_DIR, "models")
SERVICE_MODELS_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "services", "load-predictor", "models"))


def create_sequences(data, seq_length=24):
    xs, ys = [], []
    for i in range(len(data) - seq_length):
        xs.append(data[i : i + seq_length])
        ys.append(data[i + seq_length] if i + seq_length < len(data) else data[-1])
    return np.array(xs), np.array(ys)


def gaussian_nll_loss(mu, logvar, target):
    var = torch.exp(logvar)
    loss = 0.5 * ((target - mu) ** 2) / var + 0.5 * logvar
    return loss.mean()


def build_7d_state(variance_norm, sla_rate, waste_norm, trend, current_z, hour, error_ratio):
    return np.array([
        float(variance_norm),
        float(sla_rate),
        float(waste_norm),
        float(trend),
        float(current_z / 10.0),
        float(np.sin(2 * np.pi * hour / 24)),
        float(error_ratio)
    ], dtype=np.float32)


def compute_rl_reward(step_sla_violation, step_wasted_capacity, total_capacity, z_score, prev_z_score):
    sla_penalty = -50.0 * step_sla_violation
    waste_ratio = step_wasted_capacity / (total_capacity + 1e-8)
    waste_penalty = -2.0 * waste_ratio
    action_cost = -0.1 * abs(z_score - prev_z_score) / 0.1
    efficiency_bonus = 1.0 if (not step_sla_violation and waste_ratio < 0.15) else 0.0
    return sla_penalty + waste_penalty + action_cost + efficiency_bonus


def run_training():
    print("=" * 70)
    print(" HYBRIDTIMENET: MULTI-REGIME END-TO-END TRAINING")
    print("=" * 70)

    # 1. Dataset Loading
    csv_path = os.path.join(BASE_DIR, "data", "multi_regime_workload.csv")
    if not os.path.exists(csv_path):
        print("multi_regime_workload.csv not found. Generating now...")
        csv_path = build_multi_regime_dataset()

    df = pd.read_csv(csv_path)
    df["ds"] = pd.to_datetime(df["ds"])
    df = df.sort_values("ds").reset_index(drop=True)
    print(f"[1/6] Ingested Multi-Regime Workload: {len(df)} records", flush=True)
    print(f"      Mean Load: {df['y'].mean():.1f} RPS | Peak: {df['y'].max():.1f} RPS | Min: {df['y'].min():.1f} RPS", flush=True)

    seq_length = 24
    train_size = int(len(df) * 0.8)
    train_df = df.iloc[:train_size].copy()
    test_df = df.iloc[train_size:].copy()

    X_train_raw, y_train_raw = create_sequences(train_df["y"].values, seq_length)
    mean_train = float(X_train_raw.mean())
    std_train = float(X_train_raw.std())
    if std_train < 1e-4:
        std_train = 1.0

    X_train_norm = (X_train_raw - mean_train) / std_train
    y_train_norm = (y_train_raw - mean_train) / std_train

    X_train_t = torch.FloatTensor(X_train_norm).unsqueeze(-1)
    y_train_t = torch.FloatTensor(y_train_norm).unsqueeze(-1)

    # 2. Bayesian LSTM Training (100 Epochs with Cosine Annealing)
    print("\n[2/6] Deep Training Bayesian LSTM (100 Epochs with Cosine Annealing)...", flush=True)
    lstm_model = BayesianLSTM(input_size=1, hidden_size=64, num_layers=2, dropout_rate=0.2)
    optimizer_lstm = torch.optim.AdamW(lstm_model.parameters(), lr=0.004, weight_decay=1e-4)
    epochs_lstm = 100
    scheduler_lstm = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer_lstm, T_max=epochs_lstm, eta_min=0.0005)

    best_lstm_loss = float('inf')
    best_lstm_state = None

    for ep in range(epochs_lstm):
        lstm_model.train()
        optimizer_lstm.zero_grad()
        mu, logvar = lstm_model(X_train_t)
        loss = gaussian_nll_loss(mu, logvar, y_train_t)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(lstm_model.parameters(), max_norm=1.0)
        optimizer_lstm.step()
        scheduler_lstm.step()

        if loss.item() < best_lstm_loss:
            best_lstm_loss = loss.item()
            best_lstm_state = {k: v.cpu().clone() for k, v in lstm_model.state_dict().items()}

        if (ep + 1) % 20 == 0:
            current_lr = scheduler_lstm.get_last_lr()[0]
            print(f"      Epoch [{ep+1:3d}/{epochs_lstm}] - NLL Loss: {loss.item():.4f} (Best: {best_lstm_loss:.4f}) | lr: {current_lr:.5f}", flush=True)

    if best_lstm_state is not None:
        lstm_model.load_state_dict(best_lstm_state)

    # 3. Seasonality Modeling
    print("\n[3/6] Fitting Diurnal Seasonality (Fourier Sine/Cosine Harmonics)...", flush=True)
    train_df["hour_sin"] = np.sin(2 * np.pi * train_df["ds"].dt.hour / 24)
    train_df["hour_cos"] = np.cos(2 * np.pi * train_df["ds"].dt.hour / 24)
    season_model = LinearRegression()
    season_model.fit(train_df[["hour_sin", "hour_cos"]], train_df["y"])
    season_preds_train = season_model.predict(train_df[["hour_sin", "hour_cos"]])

    # 4. XGBoost Residuals (250 estimators)
    print("\n[4/6] Fitting High-Capacity XGBoost on Non-Linear Residuals...", flush=True)
    train_residuals = train_df["y"].values[seq_length:] - season_preds_train[seq_length:]
    xgb_features = []
    for i in range(len(train_residuals)):
        window = train_df["y"].values[i : i + seq_length]
        xgb_features.append(np.append(window, season_preds_train[i + seq_length]))
    
    xgb_model = XGBoostResidualModel()
    xgb_model.model.n_estimators = 250
    xgb_model.model.learning_rate = 0.03
    xgb_model.model.max_depth = 5
    xgb_model.fit(np.array(xgb_features), train_residuals)

    # 5. Fusion MLP Fitting (Smooth L1 Loss)
    print("\n[5/6] Fitting Fusion MLP Ensemble (Robust Smooth-L1 Loss)...", flush=True)
    fusion_model = HybridMLPFusion(input_size=3, hidden_size=32)
    optimizer_fusion = torch.optim.Adam(fusion_model.parameters(), lr=0.008)
    criterion_fusion = nn.SmoothL1Loss()

    with torch.no_grad():
        lstm_model.eval()
        mu_train, _ = lstm_model(X_train_t)
        lstm_train_unscaled = mu_train.squeeze().numpy() * std_train + mean_train

    xgb_preds_train = xgb_model.predict(np.array(xgb_features))
    season_cut = season_preds_train[seq_length:]
    fusion_X = np.stack([
        lstm_train_unscaled[:len(xgb_preds_train)],
        season_cut[:len(xgb_preds_train)],
        season_cut[:len(xgb_preds_train)] + xgb_preds_train
    ], axis=1)
    fusion_y = y_train_raw[:len(xgb_preds_train)]

    fusion_X_t = torch.FloatTensor(fusion_X)
    fusion_y_t = torch.FloatTensor(fusion_y).unsqueeze(-1)

    for ep in range(60):
        fusion_model.train()
        optimizer_fusion.zero_grad()
        out = fusion_model(fusion_X_t)
        loss = criterion_fusion(out, fusion_y_t)
        loss.backward()
        optimizer_fusion.step()

    # Benchmark on Test Set
    history = train_df["y"].values[-seq_length:]
    test_values = np.concatenate((history, test_df["y"].values))
    X_test_raw, y_test_actual = create_sequences(test_values, seq_length)
    X_test_norm = (X_test_raw - mean_train) / std_train
    X_test_t = torch.FloatTensor(X_test_norm).unsqueeze(-1)

    # Monte Carlo Dropout on test set
    mc_samples = 40
    lstm_model.train()
    mc_mus, mc_logvars = [], []
    with torch.no_grad():
        for _ in range(mc_samples):
            mu_s, logvar_s = lstm_model(X_test_t)
            mc_mus.append(mu_s.numpy())
            mc_logvars.append(logvar_s.numpy())

    mc_mus = np.array(mc_mus)
    mc_logvars = np.array(mc_logvars)

    lstm_mean = mc_mus.mean(axis=0).flatten() * std_train + mean_train
    epistemic_var = mc_mus.var(axis=0).flatten() * (std_train ** 2)
    aleatoric_var = np.exp(mc_logvars).mean(axis=0).flatten() * (std_train ** 2)
    total_std = np.sqrt(epistemic_var + aleatoric_var)

    test_df["hour_sin"] = np.sin(2 * np.pi * test_df["ds"].dt.hour / 24)
    test_df["hour_cos"] = np.cos(2 * np.pi * test_df["ds"].dt.hour / 24)
    season_preds_test = season_model.predict(test_df[["hour_sin", "hour_cos"]])

    xgb_test_feats = []
    for i in range(len(y_test_actual)):
        window = test_values[i : i + seq_length]
        xgb_test_feats.append(np.append(window, season_preds_test[i]))
    xgb_preds_test = xgb_model.predict(np.array(xgb_test_feats))

    fusion_test_in = torch.FloatTensor(np.stack([
        lstm_mean,
        season_preds_test,
        season_preds_test + xgb_preds_test
    ], axis=1))

    fusion_model.eval()
    with torch.no_grad():
        final_preds = fusion_model(fusion_test_in).squeeze().numpy()
    final_preds = np.maximum(final_preds, 0.0)

    mae = float(mean_absolute_error(y_test_actual, final_preds))
    rmse = float(np.sqrt(mean_squared_error(y_test_actual, final_preds)))
    avg_unc = float(total_std.mean())

    print("\n--- Test Set Ensemble Metrics ---", flush=True)
    print(f"      MAE:  {mae:.2f} RPS", flush=True)
    print(f"      RMSE: {rmse:.2f} RPS", flush=True)
    print(f"      Mean Uncertainty (Total StdDev): {avg_unc:.2f} RPS", flush=True)

    # 6. Deep Q-Network RL Training: 3-Stage Curriculum (1,000 Episodes)
    print("\n[6/6] Training 7D Deep Q-Network RL Agent (1,000 Curriculum Episodes)...", flush=True)
    print("      Curriculum: Phase 1 (Diurnal) -> Phase 2 (Poisson Jitter) -> Phase 3 (Flash Shock Surges)", flush=True)
    rl_agent = RLAgent(state_size=7, action_size=5)
    rl_agent.epsilon = 1.0
    rl_agent.epsilon_decay = 0.9985  # Slower exploration decay across 1000 episodes
    rl_agent.epsilon_min = 0.03

    episodes = 1000
    N = len(y_test_actual)
    ep_len = 40

    best_reward = -float('inf')
    best_agent_weights = None

    for ep in range(episodes):
        sla_violations = 0
        wasted_sum = 0
        ep_reward = 0.0
        
        start_idx = np.random.randint(0, max(1, N - ep_len - 1))
        recent_loads = [float(y_test_actual[start_idx])]
        rl_agent.current_z_score = 1.96

        curr_state = build_7d_state(
            total_std[start_idx] / std_train, 0.0, 0.0, 0.0,
            rl_agent.current_z_score, test_df.iloc[start_idx]["ds"].hour, 0.0
        )

        # Curriculum selection:
        # Ep 0-300: Normal organic diurnal (no synthetic shocks)
        # Ep 301-600: Micro-burst Poisson jitter (random bursts 200-400 RPS)
        # Ep 601-1000: Extreme flash sale surges (1500 - 2500 RPS)
        if ep < 300:
            regime = "Organic"
            shock_type = 0
        elif ep < 600:
            regime = "Jitter"
            shock_type = 1 if (ep % 2 == 0) else 0
        else:
            regime = "Flash Surge"
            shock_type = 2 if (ep % 2 == 0) else 1

        shock_idx = np.random.randint(10, 25) if shock_type > 0 else -1
        shock_magnitude = 350.0 if shock_type == 1 else 1600.0

        for step in range(ep_len):
            t = start_idx + step
            actual = float(y_test_actual[t])
            if shock_type > 0 and 0 <= (step - shock_idx) < (8 if shock_type == 1 else 12):
                actual += shock_magnitude

            pred = float(final_preds[t])
            err = max(0.0, actual - pred)
            err_ratio = err / (pred + 1.0)
            curr_state[6] = err_ratio

            action = rl_agent.act(curr_state)
            prev_z = rl_agent.current_z_score
            current_z = rl_agent.step_z_score(action)

            recent_loads.append(actual)
            if len(recent_loads) > 24:
                recent_loads.pop(0)

            # Provisioning logic
            adjusted_std = total_std[t] + (err * 0.5)
            upper_bound = pred + (current_z * adjusted_std)
            servers = max(1, int(np.ceil(upper_bound / 25.0)))
            capacity = servers * 25.0

            step_sla = 1 if actual > capacity else 0
            step_waste = capacity - actual if capacity > actual else 0
            sla_violations += step_sla
            wasted_sum += step_waste

            reward = compute_rl_reward(step_sla, step_waste, capacity, current_z, prev_z)

            trend = (recent_loads[-1] - recent_loads[-3]) / (max(recent_loads) + 1e-8) if len(recent_loads) >= 3 else 0.0
            trend = float(np.clip(trend, -1.0, 1.0))

            next_t = min(t + 1, N - 1)
            next_hour = test_df.iloc[next_t]["ds"].hour
            next_state = build_7d_state(
                total_std[next_t] / std_train,
                sla_violations / (step + 1),
                (wasted_sum / (step + 1)) / 1000.0,
                trend,
                current_z,
                next_hour,
                max(0.0, actual - float(final_preds[next_t])) / (float(final_preds[next_t]) + 1.0)
            )

            done = (step == ep_len - 1)
            if done and sla_violations == 0:
                reward += 100.0

            rl_agent.remember(curr_state, action, reward, next_state, done)
            curr_state = next_state
            ep_reward += reward

            rl_agent.replay(batch_size=32)

        if ep_reward > best_reward and sla_violations == 0:
            best_reward = ep_reward
            best_agent_weights = {
                'model_state_dict': {k: v.cpu().clone() for k, v in rl_agent.model.state_dict().items()},
                'target_model_state_dict': {k: v.cpu().clone() for k, v in rl_agent.target_model.state_dict().items()},
                'current_z_score': rl_agent.current_z_score,
                'epsilon': rl_agent.epsilon
            }

        if (ep + 1) % 100 == 0:
            print(f"      Ep [{ep+1:4d}/{episodes}] ({regime:11s}) - Reward: {ep_reward:6.1f} | SLA Vio: {sla_violations} | Final Z: {rl_agent.current_z_score:4.2f} | Eps: {rl_agent.epsilon:.3f}", flush=True)

    if best_agent_weights is not None:
        rl_agent.model.load_state_dict(best_agent_weights['model_state_dict'])
        rl_agent.target_model.load_state_dict(best_agent_weights['target_model_state_dict'])
        rl_agent.current_z_score = best_agent_weights['current_z_score']
        print(f"\n[OK] Loaded best checkpoint (Reward: {best_reward:.1f})", flush=True)

    # 7. Save All Artifacts
    print("\n--- Saving Trained Models & Statistics ---")
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(SERVICE_MODELS_DIR, exist_ok=True)

    # LSTM
    torch.save(lstm_model.state_dict(), os.path.join(MODELS_DIR, "lstm_weights.pth"))
    # Seasonality
    joblib.dump(season_model, os.path.join(MODELS_DIR, "season_model.pkl"))
    # XGBoost
    xgb_model.model.save_model(os.path.join(MODELS_DIR, "xgboost_model.json"))
    # Fusion MLP
    torch.save(fusion_model.state_dict(), os.path.join(MODELS_DIR, "fusion_mlp_weights.pth"))
    # RL Agent
    rl_agent.save(os.path.join(MODELS_DIR, "rl_agent_checkpoint.pth"))

    # Training Stats
    stats = {
        "mean_train": mean_train,
        "std_train": std_train,
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "avg_uncertainty": round(avg_unc, 2),
        "epochs_lstm": epochs_lstm,
        "episodes_rl": episodes,
        "seq_length": seq_length
    }
    with open(os.path.join(MODELS_DIR, "training_stats.json"), "w") as f:
        json.dump(stats, f, indent=2)

    # Synchronize to services/load-predictor/models/
    files_to_sync = [
        "lstm_weights.pth",
        "season_model.pkl",
        "xgboost_model.json",
        "fusion_mlp_weights.pth",
        "rl_agent_checkpoint.pth",
        "training_stats.json"
    ]
    for fn in files_to_sync:
        src = os.path.join(MODELS_DIR, fn)
        dst = os.path.join(SERVICE_MODELS_DIR, fn)
        shutil.copy2(src, dst)

    print("[OK] All 6 model artifacts saved to hybrid_time_net/models/")
    print("[OK] Synchronized seamlessly to services/load-predictor/models/")
    print("=" * 70)
    print(" TRAINING COMPLETE & PRODUCTION WEIGHTS DEPLOYED!")
    print("=" * 70)


if __name__ == "__main__":
    run_training()
