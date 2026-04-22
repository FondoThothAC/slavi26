
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def debug_symbols():
    info = client.get_exchange_info()
    requested = ['FET', 'SOL', 'ETH', 'BTC', 'DOGE', 'LINK', 'MATIC', 'NEAR', 'AVAX', 'DOT']
    
    print(f"{'Symbol':<12} | {'Status':<10} | {'MinNotional':<12}")
    print("-" * 40)
    
    found_symbols = []
    for s in info['symbols']:
        # Check if it has BNB as quote or base
        is_bnb_pair = s['baseAsset'] == 'BNB' or s['quoteAsset'] == 'BNB'
        if not is_bnb_pair: continue
        
        base = s['baseAsset']
        quote = s['quoteAsset']
        
        # Check if base or quote is in our requested list
        if base in requested or quote in requested:
            min_notional = "N/A"
            for f in s['filters']:
                if f['filterType'] == 'NOTIONAL':
                    min_notional = f.get('minNotional') or f.get('notional') # API changes
                elif f['filterType'] == 'MIN_NOTIONAL':
                    min_notional = f.get('minNotional')
            
            print(f"{s['symbol']:12} | {s['status']:10} | {min_notional}")
            found_symbols.append(s['symbol'])

if __name__ == "__main__":
    debug_symbols()
