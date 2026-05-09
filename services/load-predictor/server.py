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

        # --- MC Dropout for Uncertainty Estimation ---
        mc_samples = 50
        self.lstm.train() # Keep dropout ON for MC sampling
        
        mus = []
        logvars = []
        with torch.no_grad():
            for _ in range(mc_samples):
                mu, logvar = self.lstm(input_t)
                mus.append(mu.cpu().numpy())
                logvars.append(logvar.cpu().numpy())
        
        mus = np.array(mus)
        logvars = np.array(logvars)

        # Predictive mean from LSTM
        lstm_mean_scaled = mus.mean()
        lstm_mean = lstm_mean_scaled * self.std_train + self.mean_train

        # Epistemic & Aleatoric uncertainty
        epistemic_var = mus.var() * (self.std_train ** 2)
        aleatoric_var = np.exp(logvars).mean() * (self.std_train ** 2)
        total_std = np.sqrt(epistemic_var + aleatoric_var)

        # --- Neural Prophet Prediction ---
        # Mocking NP and XGBoost logic for this implementation as they require dataframes/fitting
        # In full implementation, we'd maintain a small buffer for NP.fit/predict
        np_pred = lstm_mean * 0.95 + 100 # Mock NP prediction
        
        # --- XGBoost Residuals ---
        xgb_residual = (lstm_mean - np_pred) * 0.1 # Mock XGBoost residual prediction
        
        # --- Fusion ---
        # For this example, we'll use a simple weighted average instead of the MLP 
        # to ensure the response is reasonable without pre-trained weights.
        # final_mean = (lstm_mean + np_pred + (np_pred + xgb_residual)) / 3
        
        # User's thesis: mean + 2*std for upper bound
        mean = float(lstm_mean)
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
    print("Python Predictor gRPC server starting on port 50051...")
    server.start()
    server.wait_for_termination()

if __name__ == '__main__':
    serve()
