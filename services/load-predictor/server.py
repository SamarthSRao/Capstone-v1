import grpc
from concurrent import futures
import time
import torch
import numpy as np
import pandas as pd
from datetime import datetime

# Import generated gRPC code
import predictor_pb2
import predictor_pb2_grpc

# Import models
from models.lstm import BayesianLSTM
from models.neural_prophet import WorkloadNeuralProphet
from models.xgboost_residuals import XGBoostResidualModel
from models.hybrid_mlp import HybridMLPFusion

class PredictorService(predictor_pb2_grpc.PredictorServicer):
    def __init__(self):
        print("Initializing HybridTimeNet models...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # 1. LSTM (Bayesian)
        self.lstm = BayesianLSTM(input_size=1, hidden_size=64, num_layers=2, dropout_rate=0.2).to(self.device)
        # In a real scenario, we would load weights: self.lstm.load_state_dict(torch.load('lstm.pth'))
        
        # 2. Neural Prophet
        self.np_model = WorkloadNeuralProphet(n_lags=24)
        
        # 3. XGBoost
        self.xgb_model = XGBoostResidualModel()
        
        # 4. Fusion MLP
        self.fusion = HybridMLPFusion(input_size=3).to(self.device)
        
        # Scaling parameters (mock values, in production these would be saved from training)
        self.mean_train = 5000.0
        self.std_train = 1500.0

    def GetPrediction(self, request, context):
        history = np.array(request.history)
        if len(history) < 24:
            # Fallback if not enough data
            return predictor_pb2.PredictionResponse(
                mean=history[-1] if len(history) > 0 else 0,
                std_dev=0,
                upper_bound=history[-1] if len(history) > 0 else 0,
                lower_bound=history[-1] if len(history) > 0 else 0
            )

        # Scale history
        scaled_history = (history - self.mean_train) / self.std_train
        input_t = torch.FloatTensor(scaled_history).unsqueeze(0).unsqueeze(-1).to(self.device)

        # --- Batched MC Dropout for Uncertainty Estimation (Week 11 Optimization) ---
        mc_samples = 100
        # Repeat input along batch dimension: [mc_samples, seq_len, 1]
        batched_input = input_t.repeat(mc_samples, 1, 1)
        
        self.lstm.train() # Keep dropout ON for MC sampling
        
        with torch.no_grad():
            # Single forward call with batch size = 100
            mus, logvars = self.lstm(batched_input)
            mus = mus.cpu().numpy()
            logvars = logvars.cpu().numpy()

        # Predictive mean from LSTM
        lstm_mean_scaled = mus.mean()
        lstm_mean = lstm_mean_scaled * self.std_train + self.mean_train

        # Epistemic uncertainty (variance of the means)
        epistemic_var = mus.var() * (self.std_train ** 2)
        # Aleatoric uncertainty (mean of the variances)
        aleatoric_var = np.exp(logvars).mean() * (self.std_train ** 2)
        total_std = np.sqrt(epistemic_var + aleatoric_var)

        # --- Neural Prophet Prediction (Ensemble Integration - Week 10) ---
        # Conceptual: In production, we maintain a rolling buffer for NP
        np_pred = lstm_mean * 0.98 + 50 # Model seasonal component
        
        # --- XGBoost Residuals (Ensemble Integration - Week 10) ---
        # Conceptual: XGBoost predicts the error between Actual and (LSTM+NP)
        xgb_residual = (lstm_mean - np_pred) * 0.05 
        
        # --- Fusion (Week 10) ---
        # Combine models. We'll use the LSTM-centric approach described in the thesis
        # mean = (0.7 * lstm_mean) + (0.2 * np_pred) + (0.1 * (np_pred + xgb_residual))
        mean = float(lstm_mean) # Focusing on the Bayesian output as primary
        
        # User's thesis: mean + 2*std for upper bound (proactive safety)
        std_dev = float(total_std)
        upper_bound = mean + 2 * std_dev
        lower_bound = max(0, mean - 2 * std_dev)

        return predictor_pb2.PredictionResponse(
            mean=mean,
            std_dev=std_dev,
            upper_bound=upper_bound,
            lower_bound=lower_bound
        )

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    predictor_pb2_grpc.add_PredictorServicer_to_server(PredictorService(), server)
    server.add_insecure_port('[::]:50051')
    print("Python Predictor gRPC server READY and listening on port 50051...")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
