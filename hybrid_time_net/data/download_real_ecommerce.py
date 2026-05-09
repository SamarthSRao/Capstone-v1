import pandas as pd

def download_and_process():
    url = "https://archive.ics.uci.edu/ml/machine-learning-databases/00352/Online%20Retail.xlsx"
    print("Downloading UCI Online Retail Dataset (this may take a minute)...")
    df = pd.read_excel(url)
    print("Data downloaded. Processing...")

    # The dataset has 'InvoiceDate'. We will count the number of rows (items/requests) per hour.
    df['ds'] = df['InvoiceDate'].dt.floor('h')
    
    # Count number of transactions per hour (representing workload/requests)
    workload = df.groupby('ds').size().reset_index(name='y')

    # Fill missing hours with 0 to make it a continuous time series
    workload.set_index('ds', inplace=True)
    workload = workload.resample('h').sum().reset_index()
    
    # Optional: Scale it up a bit to simulate a larger application
    workload['y'] = workload['y'] * 5 

    workload.to_csv("real_ecommerce_workload.csv", index=False)
    print(f"Saved {len(workload)} hours of workload data to real_ecommerce_workload.csv")
    print(workload.head())

if __name__ == "__main__":
    download_and_process()
