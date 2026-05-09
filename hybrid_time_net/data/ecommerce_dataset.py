import pandas as pd
import numpy as np

def generate_ecommerce_workload(start_date='2024-01-01', periods=2000, save_path=None):
    """
    Generates a synthetic, highly volatile e-commerce workload dataset.
    Incorporates:
    - Base growth trend
    - Daily seasonality (active during day, inactive at night)
    - Weekly seasonality (weekend surges)
    - Flash sales / Promotional events (sudden massive spikes)
    """
    dates = pd.date_range(start=start_date, periods=periods, freq='h')
    
    # 1. Base traffic + slight growth trend
    base_traffic = 500
    trend = np.linspace(0, 300, periods)
    
    # 2. Daily Seasonality (peaks around 12 PM and 8 PM)
    hours = dates.hour
    daily_seasonality = -200 * np.cos((hours - 4) * (2 * np.pi / 24)) + \
                        100 * np.cos((hours - 20) * (2 * np.pi / 24))
                        
    # 3. Weekly Seasonality (higher traffic on weekends: Saturday/Sunday)
    days = dates.dayofweek
    weekly_seasonality = np.where(days >= 5, 400, 0)
    
    # 4. Volatility / Flash Sales (Random extreme spikes)
    # 2% chance of a flash sale in any given hour
    flash_sales = np.random.choice([0, 1], size=periods, p=[0.98, 0.02])
    flash_sale_spikes = flash_sales * np.random.uniform(800, 2000, size=periods)
    
    # 5. General Noise
    noise = np.random.normal(0, 50, periods)
    
    # Combine all components
    y = base_traffic + trend + daily_seasonality + weekly_seasonality + flash_sale_spikes + noise
    y = np.maximum(y, 50) # Ensure no negative traffic
    
    df = pd.DataFrame({'ds': dates, 'y': y})
    
    if save_path:
        df.to_csv(save_path, index=False)
        print(f"Dataset saved to {save_path}")
        
    return df

if __name__ == "__main__":
    generate_ecommerce_workload(save_path='ecommerce_workload.csv')
