from neuralprophet import NeuralProphet
import pandas as pd

class WorkloadNeuralProphet:
    def __init__(self, n_lags=24):
        self.model = NeuralProphet(
            n_forecasts=1,
            n_lags=n_lags,
            yearly_seasonality=False,
            weekly_seasonality=True,
            daily_seasonality=True,
            epochs=50,
            learning_rate=0.01
        )
        
    def fit(self, df):
        """
        df must have 'ds' (datetime) and 'y' (target workload) columns
        """
        metrics = self.model.fit(df, freq="H")
        return metrics
        
    def predict(self, df):
        forecast = self.model.predict(df)
        return forecast
