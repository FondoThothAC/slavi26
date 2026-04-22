
import json
import math
import random

# Fixed seed
random.seed(42)

symbols = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT', 'SOLUSDT', 'BNBUSDT', 'CFGUSDT', 'DEXEUSDT', 'BONKUSDT', 'OPUSDT', 'FLOKIUSDT']
vol_trends = {
    'BTCUSDT': (0.50, 0.15), 'ETHUSDT': (0.65, 0.20), 'XRPUSDT': (0.85, 0.10),
    'SOLUSDT': (0.90, 0.25), 'BNBUSDT': (0.55, 0.12), 'CFGUSDT': (1.20, 0.05),
    'DEXEUSDT': (1.15, 0.08), 'BONKUSDT': (1.30, 0.03), 'OPUSDT': (0.95, 0.15),
    'FLOKIUSDT': (1.10, 0.10),
}

n_days = 30 # 30 days is enough to show the point
# Simulate every hour to keep it fast, but allow MULTIPLE trades per hour to simulate velocity
n_hours = n_days * 24
fee = 0.001
target_gross = 1.012

# Generate Prices
prices_all = {}
for sym in symbols:
    vol, trend = vol_trends.get(sym, (0.7, 0.1))
    vol_h = vol / math.sqrt(365 * 24)
    drift_h = (trend / 365 / 24)
    p = [100.0]
    for _ in range(n_hours-1):
        p.append(p[-1] * math.exp(random.gauss(drift_h, vol_h)))
    prices_all[sym] = p

def simulate(initial, max_trades_per_hour):
    cash = initial
    positions = {s: [] for s in symbols}
    last_buy = {s: 0 for s in symbols}
    ticket = 5.0
    realized_profit = 0.0
    
    for h in range(n_hours):
        # Sells
        for s in symbols:
            for i in range(len(positions[s])-1, -1, -1):
                pos = positions[s][i]
                curr = prices_all[s][h]
                if curr >= pos['buy_price'] * target_gross:
                    val = pos['qty'] * curr * (1 - fee)
                    realized_profit += (val - ticket)
                    cash += val
                    positions[s].pop(i)
        
        # Threshold
        pos_val = sum(sum(p['qty']*prices_all[s][h] for p in ps) for s,ps in positions.items())
        balance = cash + pos_val
        if balance < 200: dt = 0.995
        elif balance < 1000: dt = 0.996
        else: dt = 0.997
        
        # Buys - The "Velocity" factor
        # If max_trades_per_hour is high, we can buy many tickets if dips allow
        trades_this_hour = 0
        sym_order = list(symbols)
        random.shuffle(sym_order)
        
        for s in sym_order:
            if trades_this_hour >= max_trades_per_hour: break
            if cash < ticket: break
            
            curr = prices_all[s][h]
            if last_buy[s] == 0 or curr <= last_buy[s] * dt:
                positions[s].append({'qty': ticket/(curr*(1+fee)), 'buy_price': curr})
                cash -= ticket
                last_buy[s] = curr
                trades_this_hour += 1
                
    final_equity = cash + sum(sum(p['qty']*prices_all[s][-1] for p in ps) for s,ps in positions.items())
    return realized_profit, final_equity

# Simulation cases
# Case A: $50 account, slow velocity (1 trade/hour max)
pA, eA = simulate(50, 1)
roiA = (eA/50 - 1) * 100

# Case B: $600 account, slow velocity (1 trade/hour max) -> IDLE CASH ISSUE
pB, eB = simulate(600, 1)
roiB = (eB/600 - 1) * 100

# Case C: $600 account, HFT velocity (10 trades/hour max - one for each coin) -> CAPITAL EFFICIENCY
pC, eC = simulate(600, 10)
roiC = (eC/600 - 1) * 100

print(f"RESULTS (30 DAYS):")
print(f"$50 (Slow):  ROI {roiA:.2f}% | Profit ${eA-50:.2f}")
print(f"$600 (Slow): ROI {roiB:.2f}% | Profit ${eB-600:.2f} (Idle Cash!)")
print(f"$600 (HFT):  ROI {roiC:.2f}% | Profit ${eC-600:.2f} (Velocity!)")

data = {
    "labels": ["$50 (Slow)", "$600 (Slow)", "$600 (HFT)"],
    "roi": [roiA, roiB, roiC],
    "profit": [eA-50, eB-600, eC-600]
}
with open('velocity_final.json', 'w') as f:
    json.dump(data, f)
