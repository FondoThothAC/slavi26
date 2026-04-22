
import json
import urllib.request
import numpy as np
import time

def get_binance_data(symbol, interval='1h', limit=720):
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}"
    try:
        with urllib.request.urlopen(url) as response:
            data = json.loads(response.read().decode())
            return [float(k[4]) for k in data]
    except Exception as e:
        print(f"Error fetching {symbol}: {e}")
        return None

pairs = ["BNBBTC", "BTCUSDT", "SOLBNB", "FETBNB", "ETHBNB"]
print("=== Volatilidad Anualizada (Basada en 1 mes / 720h) ===")
for p in pairs:
    closes = get_binance_data(p)
    if closes and len(closes) > 1:
        returns = np.diff(np.log(closes))
        vol = np.std(returns) * np.sqrt(365 * 24) * 100
        print(f"{p}: {vol:.2f}%")
    time.sleep(0.5)
