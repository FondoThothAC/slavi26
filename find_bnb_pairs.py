
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def find_active_bnb_pairs():
    info = client.get_exchange_info()
    trading_pairs = []
    for s in info['symbols']:
        if s['quoteAsset'] == 'BNB' and s['status'] == 'TRADING':
            min_notional = 0.01
            for f in s['filters']:
                if f['filterType'] == 'NOTIONAL':
                    min_notional = float(f.get('minNotional') or f.get('notional') or 0.01)
                elif f['filterType'] == 'MIN_NOTIONAL':
                    min_notional = float(f.get('minNotional') or 0.01)
            
            trading_pairs.append({
                'symbol': s['symbol'],
                'base': s['baseAsset'],
                'min_notional': min_notional
            })
    
    # Sort by "popularity" or just pick top ones
    # We'll just print them all for now to choose 10
    print(f"{'Symbol':<12} | {'MinBNB':<10}")
    print("-" * 25)
    for p in sorted(trading_pairs, key=lambda x: x['symbol']):
        print(f"{p['symbol']:12} | {p['min_notional']:.4f}")

if __name__ == "__main__":
    find_active_bnb_pairs()
