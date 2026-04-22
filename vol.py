
import json
import urllib.request
import numpy as np

def get_data(symbol):
    url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1h&limit=720"
    try:
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read().decode())
            return [float(k[4]) for k in data]
    except: return None

for p in ["BNBBTC", "BTCUSDT", "FETBNB"]:
    c = get_data(p)
    if c:
        v = np.std(np.diff(np.log(c))) * np.sqrt(365*24) * 100
        print(f"{p}: {v:.1f}%")
