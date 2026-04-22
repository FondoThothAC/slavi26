
import json
import urllib.request
import math
import random

def get_stats(symbol):
    try:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval=1h&limit=720"
        with urllib.request.urlopen(url) as r:
            data = json.loads(r.read().decode())
            closes = [float(k[4]) for k in data]
            returns = [math.log(closes[i]/closes[i-1]) for i in range(1, len(closes))]
            vol = (sum(x**2 for x in returns)/len(returns))**0.5 * math.sqrt(365*24) * 100
            trend = (closes[-1]/closes[0] - 1) * 12 # Annualized rough trend
            return vol, trend
    except: return 60, 0.5 # Defaults

def simulate(vol, trend, target, dip, fee, initial, weekly_add):
    n_days = 360
    n_hours = n_days * 24
    cash = initial
    pos = []
    trades = 0
    vol_h = (vol/100) / math.sqrt(365*24)
    drift_h = trend / (365*24)
    price = 100.0
    last_buy = 0
    
    for h in range(n_hours):
        if h > 0 and h % (24 * 7) == 0: cash += weekly_add
        price *= math.exp(random.gauss(drift_h, vol_h))
        
        # Sells
        for i in range(len(pos)-1, -1, -1):
            if price >= pos[i]['p'] * (1 + target):
                cash += pos[i]['q'] * price * (1 - fee)
                trades += 1
                pos.pop(i)
        
        # Buys
        ticket = max(5.0, (cash + len(pos)*price)/50) # Maintain granularity
        if cash >= ticket:
            if last_buy == 0 or price <= last_buy * (1 - dip):
                pos.append({'p': price, 'q': ticket/(price * (1 + fee))})
                cash -= ticket
                last_buy = price
    
    return (cash + sum(p['q']*price for p in pos)), trades

# Strategy 1: USDT (Target 4%, Dip 3%, Fee 0.1%)
# Strategy 2: BNB Scalper (Target 0.3%, Dip 0.15%, Fee 0.15%) - User proposal

print("--- Comparativa Volatilidad ---")
v_btc, t_btc = get_stats("BTCUSDT")
v_fet, t_fet = get_stats("FETBNB")
print(f"BTC/USDT: {v_btc:.1f}%")
print(f"FET/BNB: {v_fet:.1f}%")

res_usdt, t_u = simulate(v_btc, t_btc, 0.04, 0.03, 0.001, 50, 10)
res_bnb, t_b = simulate(v_fet, t_fet, 0.003, 0.0015, 0.0015, 50, 10)

print("\n--- Resultados 360 Dias ---")
print(f"USDT Base (4%): Final ${res_usdt:.2f}, Trades {t_u}")
print(f"BNB Base (0.3%): Final ${res_bnb:.2f}, Trades {t_b}")
