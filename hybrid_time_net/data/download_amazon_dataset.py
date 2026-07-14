import pandas as pd
import os

def download_and_process_amazon_data():
    print("Downloading Large Ecommerce Retail Dataset (Amazon-like)...")
    url = "https://archive.ics.uci.edu/ml/machine-learning-databases/00352/Online%20Retail.xlsx"
    
    file_name = "Online_Retail.xlsx"
    if not os.path.exists(file_name):
        import urllib.request
        print("Downloading from UCI repository (this may take a minute)...")
        urllib.request.urlretrieve(url, file_name)
        
    print("Data downloaded. Processing into time-series workload...")
    df = pd.read_excel(file_name)

    # Count the number of transactions per hour to represent requests
    df['ds'] = df['InvoiceDate'].dt.floor('h')
    workload = df.groupby('ds').size().reset_index(name='y')

    # Fill missing hours with 0
    workload.set_index('ds', inplace=True)
    workload = workload.resample('h').sum().reset_index()
    
    # Scale it up to simulate a larger Amazon-like load (e.g. 100x)
    workload['y'] = workload['y'] * 100 

    save_path = "data/amazon_workload.csv"
    workload.to_csv(save_path, index=False)
    print(f"Saved {len(workload)} hours of workload data to {save_path}")

if __name__ == "__main__":
    download_and_process_amazon_data()
