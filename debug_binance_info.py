
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def debug_info():
    info = client.get_exchange_info()
    for s in info['symbols']:
        if s['symbol'] == 'FETBNB':
            print("--- KEYS IN SYMBOL ---")
            print(s.keys())
            print("\n--- FILTERS ---")
            for f in s['filters']:
                print(f)
            break

if __name__ == "__main__":
    debug_info()
