
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def get_all_balances():
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    account = client.get_account()
    print("--- ⚖️ BALANCE COMPLETO BINANCE (Assets > 0) ---")
    found = False
    for b in account['balances']:
        total = float(b['free']) + float(b['locked'])
        if total > 0:
            print(f"Asset: {b['asset']:8s} | Total: {total:14.8f} | Free: {b['free']:12s}")
            found = True
    if not found:
        print("❌ No se encontraron activos con saldo.")

if __name__ == "__main__":
    get_all_balances()
