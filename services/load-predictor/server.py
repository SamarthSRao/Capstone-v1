import grpc
from concurrent import futures
import time
import torch
import numpy as np
import pandas as pd
from datetime import datetime
import json
import joblib
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../hybrid_time_net')))

# Import generated gRPC code
import predictor_pb2
import predictor_pb2_grpc

# Import models
from models.lstm import BayesianLSTM
try:
    from models.neural_prophet import WorkloadNeuralProphet
except ImportError:
    WorkloadNeuralProphet = None
from models.xgboost_residuals import XGBoostResidualModel
from models.hybrid_mlp import HybridMLPFusion
from rl_agent import RLAgent

class PredictorService(predictor_pb2_grpc.PredictorServicer):
    def __init__(self):
        print("Initializing HybridTimeNet models...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # 1. LSTM (Bayesian)
        self.lstm = BayesianLSTM(input_size=1, hidden_size=64, num_layers=2, dropout_rate=0.2).to(self.device)
        
        # 2. Seasonality Model (LinearRegression)
        self.season_model = None
        
        # 3. XGBoost
        self.xgb_model = XGBoostResidualModel()
        
        # 4. Fusion MLP
        self.fusion = HybridMLPFusion(input_size=3).to(self.device)
        
        # RL Agent
        self.rl_agent = RLAgent(state_size=7, action_size=5)
        self.rl_agent.epsilon = 0.0 # Inference mode
        
        # Load weights and stats
        models_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'models'))
        try:
            with open(os.path.join(models_dir, 'training_stats.json'), 'r') as f:
                self.stats = json.load(f)
            self.mean_train = self.stats.get('mean_train', 0.0)
            self.std_train = self.stats.get('std_train', 1.0)
            print("Loaded training stats.")
        except Exception as e:
            print("Could not load training stats:", e)
            self.mean_train = 0.0
            self.std_train = 1.0
            
        try:
            self.lstm.load_state_dict(torch.load(os.path.join(models_dir, 'lstm_weights.pth'), map_location=self.device))
            print("Loaded LSTM weights.")
        except Exception as e:
            print("Could not load LSTM weights:", e)
            
        try:
            self.season_model = joblib.load(os.path.join(models_dir, 'season_model.pkl'))
            print("Loaded Seasonality model.")
        except Exception as e:
            print("Could not load Seasonality model:", e)
            
        try:
            self.xgb_model.model.load_model(os.path.join(models_dir, 'xgboost_model.json'))
            print("Loaded XGBoost model.")
        except Exception as e:
            print("Could not load XGBoost model:", e)
            
        try:
            self.fusion.load_state_dict(torch.load(os.path.join(models_dir, 'fusion_mlp_weights.pth'), map_location=self.device))
            self.fusion.eval()
            print("Loaded Fusion MLP weights.")
        except Exception as e:
            print("Could not load Fusion MLP weights:", e)

        try:
            self.rl_agent.load(os.path.join(models_dir, 'rl_agent_checkpoint.pth'))
            print("Loaded trained RL Agent.")
        except Exception as e:
            print("Could not load RL Agent, using default initialized weights. Error:", e)

        self.last_state = np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0])
        # current_z_score is one value for the whole process. Concurrent
        # GetPrediction calls (monitor + /scale) would race and step it twice
        # per tick. The lock makes each step atomic. Callers should still
        # avoid having two controllers: the orchestrator only runs its
        # autonomous loop on Kubernetes, and uses POST /scale for the simulator.
        self._predict_lock = threading.Lock()

    def reset_rl(self):
        if hasattr(self, 'rl_agent') and self.rl_agent is not None:
            self.rl_agent.current_z_score = 1.96
        return 1.96

    def GetPrediction(self, request, context):
        # Serialize RL z-score updates. MC dropout itself is read-only, but
        # step_z_score mutates shared agent state.
        with self._predict_lock:
            return self._predict_locked(request, context)

    def _predict_locked(self, request, context):
        history = np.array(request.history)
        if len(history) < 24:
            # Fallback if not enough data
            return predictor_pb2.PredictionResponse(
                mean=history[-1] if len(history) > 0 else 0,
                std_dev=0,
                upper_bound=history[-1] if len(history) > 0 else 0,
                lower_bound=history[-1] if len(history) > 0 else 0
            )

        # dynamic stats fallback if needed
        local_mean = float(np.max(history)) if self.mean_train == 0.0 else self.mean_train
        local_std = float(np.std(history)) + 1.0 if self.std_train == 1.0 else self.std_train

        # Scale history
        scaled_history = (history - local_mean) / local_std
        input_t = torch.FloatTensor(scaled_history).unsqueeze(0).unsqueeze(-1).to(self.device)

        # --- Batched MC Dropout for Uncertainty Estimation ---
        mc_samples = 100
        batched_input = input_t.repeat(mc_samples, 1, 1)
        
        self.lstm.train() # Keep dropout ON for MC sampling
        
        with torch.no_grad():
            mus, logvars = self.lstm(batched_input)
            mus = mus.cpu().numpy()
            logvars = logvars.cpu().numpy()

        # Predictive mean from LSTM (un-scaled)
        lstm_mean_scaled = mus.mean()
        lstm_mean = float(lstm_mean_scaled * local_std + local_mean)
        
        # Scale uncertainty
        epistemic_var = mus.var() * (local_std ** 2)
        aleatoric_var = np.exp(logvars).mean() * (local_std ** 2)
        total_std = float(np.sqrt(epistemic_var + aleatoric_var))
        
        # Extract hour of day from timestamp
        try:
            dt = datetime.fromisoformat(request.timestamp)
            hour = dt.hour
        except Exception:
            hour = datetime.now().hour

        # --- Seasonality Prediction ---
        if self.season_model:
            hour_df = pd.DataFrame({
                'hour_sin': [np.sin(2 * np.pi * hour / 24)],
                'hour_cos': [np.cos(2 * np.pi * hour / 24)]
            })
            season_pred = float(self.season_model.predict(hour_df)[0])
        else:
            season_pred = lstm_mean * 0.98 + 50
            
        # --- XGBoost Residuals ---
        # Features for XGBoost: past 24 hours window + seasonality prediction
        xgb_input = np.append(history[-24:], season_pred).reshape(1, -1)
        try:
            xgb_residual = float(self.xgb_model.predict(xgb_input)[0])
        except Exception:
            xgb_residual = 0.0
            
        # --- Fusion ---
        try:
            fusion_input = torch.FloatTensor([[lstm_mean, season_pred, season_pred + xgb_residual]]).to(self.device)
            self.fusion.eval()
            with torch.no_grad():
                mean = float(self.fusion(fusion_input)[0][0])
        except Exception:
            mean = lstm_mean
            
        # True ML inference only (no reactive overrides)
        mean = max(0.0, mean)
        raw_ml_mean = mean
        
        # Dynamic Uncertainty Amplification (Pure ML Concept)
        # Instead of a hardcoded override, we measure the model's immediate prediction error.
        # If the actual incoming traffic (history[-1]) vastly exceeds what the model expected (mean),
        # the system recognizes a "Distribution Shift" (Flash Sale) and dynamically inflates the Bayesian Z-score.
        
        prediction_error = max(0.0, history[-1] - mean)
        error_ratio = prediction_error / (mean + 1.0)
        
        current_sla = request.sla_violation_rate
        current_wasted = request.wasted_capacity
        current_var_norm = float(total_std) / self.std_train
        
        if len(history) >= 3:
            trend = (history[-1] - history[-3]) / (max(history) + 1e-8)
        else:
            trend = 0.0
            
        # RL Agent Action
        if hasattr(self, 'rl_agent') and self.rl_agent is not None:
            # Add error ratio to state
            current_state = np.array([
                current_var_norm,
                current_sla,
                current_wasted / 1000.0,
                trend,
                self.rl_agent.current_z_score / 10.0,
                np.sin(2 * np.pi * hour / 24),
                error_ratio
            ], dtype=np.float32)
            
            action = self.rl_agent.act(current_state)
            current_z_score = self.rl_agent.step_z_score(action)
        else:
            action = 2
            current_z_score = 2.0 + (error_ratio * 0.5)
        
        # Calculate final bounds purely from ML mean + (dynamic_z * Bayesian_std_dev)
        std_dev = float(total_std)
        
        # If the error is massive, the variance inherently spikes.
        # We also factor the prediction error into the standard deviation for instantaneous shocks.
        adjusted_std = std_dev + (prediction_error * 0.5)
        
        upper_bound = mean + (current_z_score * adjusted_std)
        lower_bound = max(0, mean - (current_z_score * adjusted_std))
        
        # The Orchestrator scales based on the upper_bound!
        mean = upper_bound  # We feed the uncertainty-adjusted bound as the target mean for scaling.

        return predictor_pb2.PredictionResponse(
            mean=mean,
            std_dev=std_dev,
            upper_bound=upper_bound,
            lower_bound=lower_bound,
            z_score=current_z_score,
            rl_action=action,
            raw_ml_mean=raw_ml_mean,
            error_ratio=error_ratio,
            state_variance_norm=current_var_norm,
            state_sla=current_sla,
            state_waste_norm=current_wasted / 1000.0,
            state_trend=trend,
            state_hour_sin=float(np.sin(2 * np.pi * hour / 24)),
        )

def serve():
    service = PredictorService()

    class ResetHandler(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()

        def do_GET(self):
            if self.path not in ("/health", "/healthz", "/ready"):
                self.send_response(404)
                self.end_headers()
                return
            body = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            if self.path != "/reset":
                self.send_response(404)
                self.end_headers()
                return
            z = service.reset_rl()
            body = json.dumps({"status": "reset", "z_score": z}).encode()
            self.send_response(200)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format, *args):
            pass

    http_server = HTTPServer(("0.0.0.0", 50052), ResetHandler)
    threading.Thread(target=http_server.serve_forever, daemon=True).start()
    print("Predictor HTTP reset API listening on port 50052...")

    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    predictor_pb2_grpc.add_PredictorServicer_to_server(service, server)
    server.add_insecure_port('0.0.0.0:50051')
    print("Python Predictor gRPC server READY and listening on port 50051...")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
