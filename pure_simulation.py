
import json
import math
import random
from datetime import datetime, timedelta

random.seed(42)

symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'SHIBUSDT']
vol_trends = {
    'BTCUSDT': (0.50, 0.20), 'ETHUSDT': (0.60, 0.25), 'SOLUSDT': (0.90, 0.35),
    'BNBUSDT': (0.45, 0.15), 'XRPUSDT': (0.70, 0.10), 'ADAUSDT': (0.80, 0.05),
    'DOGEUSDT': (1.20, 0.10), 'DOTUSDT': (0.75, 0.08), 'MATICUSDT': (0.85, 0.12),
    'SHIBUSDT': (1.40, 0.05)
}

n_days = 360
n_hours = n_days * 24
fee_maker = 0.0002 # 0.02% assuming BNB fee discount + Maker
target_profit = 1.04 # 4% Net
dip_threshold = 0.97 # 3% Dip

# Generate Prices (Strong Bull Market as per user scenario)
prices = {}
for sym in symbols:
    vol, trend = vol_trends[sym]
    # Adjust trend to be "Strong Bull" (+100% avg)
    vol_h = vol / math.sqrt(365 * 24)
    drift_h = (1.0 / 365 / 24) # ~100% annual
    p = [100.0]
    for _ in range(n_hours-1):
        p.append(p[-1] * math.exp(random.gauss(drift_h, vol_h)))
    prices[sym] = p

def simulate_optimized(initial_cap, weekly_add):
    cash = initial_cap
    positions = {s: [] for s in symbols}
    last_buy = {s: 0 for s in symbols}
    trades = []
    balance_history = []
    
    for h in range(n_hours):
        # Weekly injection
        if h > 0 and h % (24 * 7) == 0:
            cash += weekly_add
            
        # Sells (Maker)
        for s in symbols:
            for i in range(len(positions[s])-1, -1, -1):
                pos = positions[s][i]
                curr = prices[s][h]
                if curr >= pos['buy_price'] * target_profit:
                    rev = pos['qty'] * curr * (1 - fee_maker)
                    cash += rev
                    trades.append(rev - pos['ticket'])
                    positions[s].pop(i)
        
        # Balance
        pos_val = sum(sum(p['qty']*prices[s][h] for p in ps) for s,ps in positions.items())
        balance = cash + pos_val
        
        # Aggressive Usage logic (Keep 90% invested)
        invested_pct = (pos_val / balance) if balance > 0 else 0
        
        # Ticket scaling (Starting at 5, scaling with balance)
        ticket = max(5.0, balance / 50.0) # Approx 50 tickets total capacity
        
        if h % 1 == 0 and cash >= ticket:
            s = symbols[h % len(symbols)]
            curr = prices[s][h]
            force_buy = invested_pct < 0.7
            
            if last_buy[s] == 0 or curr <= last_buy[s] * dip_threshold or force_buy:
                positions[s].append({'qty': ticket/(curr*(1+fee_maker)), 'buy_price': curr, 'ticket': ticket})
                cash -= ticket
                last_buy[s] = curr
        
        if h % 24 == 0:
            balance_history.append(balance)
            
    final_equity = cash + sum(sum(p['qty']*prices[s][-1] for p in ps) for s,ps in positions.items())
    total_invested_extra = weekly_add * (n_days // 7)
    return final_equity, len(trades), balance_history, total_invested_extra

# Run Simulation
final, n_trades, history, extra = simulate_optimized(50, 10)
pure_bnh = 50 * (sum(prices[s][-1]/prices[s][0] for s in symbols)/len(symbols)) + extra # Simplified BNH for comparison

results = {
    "Initial": 50,
    "Extra_Invested": extra,
    "Final_Equity": final,
    "Trades": n_trades,
    "ROI_Total": ((final / (50 + extra)) - 1) * 100,
    "BNH_Comparison": pure_bnh,
    "History": history
}

with open('optimized_360d_results.json', 'w') as f:
    json.dump(results, f)

print(f"Final Equity: ${final:.2f}")
print(f"Total Invested: ${50 + extra:.2f}")
print(f"ROI: {results['ROI_Total']:.2f}%")
print(f"Trades: {n_trades}")
