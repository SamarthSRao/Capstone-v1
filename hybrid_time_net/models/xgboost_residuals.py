import xgboost as xgb
import numpy as np

class XGBoostResidualModel:
    def __init__(self):
        self.model = xgb.XGBRegressor(
            objective='reg:squarederror',
            n_estimators=100,
            learning_rate=0.05,
            max_depth=5,
            subsample=0.8,
            colsample_bytree=0.8
        )
        
    def fit(self, X, y_residuals):
        """
        X: features (e.g., lag values, time features)
        y_residuals: The residuals from Neural Prophet (Actual - NP_Prediction)
        """
        self.model.fit(X, y_residuals)
        
    def predict(self, X):
        return self.model.predict(X)
