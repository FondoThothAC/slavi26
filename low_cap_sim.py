
import json
import math
import random

random.seed(42)

def simulate_low_cap(initial_cap, weekly_add, target_roi=0.04, dip=0.03, fee=0.001):
    n_days = 360
    n_hours = n_days * 24
    cash = initial_cap
    pos = []
    trades = 0
    price = 70000.0  # BTC Price
    vol_h = 0.50 / math.sqrt(365*24)
    drift_h = 0.80 / (365*24) # Strong bull for the test
    last_buy = 0
    total_invested = initial_cap
    
    # Binance Constraints
    MIN_NOTIONAL = 5.0 # Cannot buy/sell less than $5
    STEP_SIZE = 0.00001 # BTC precision example
    
    history = []

    for h in range(n_hours):
        if h > 0 and h % (24 * 7) == 0:
            cash += weekly_add
            total_invested += weekly_add
        
        price *= math.exp(random.gauss(drift_h, vol_h))
        
        # 1. Sells (Must be > $5)
        for i in range(len(pos)-1, -1, -1):
            if price >= pos[i]['p'] * (1 + target_roi):
                val = pos[i]['q'] * price
                if val >= MIN_NOTIONAL:
                    cash += val * (1 - fee)
                    trades += 1
                    pos.pop(i)
                # If val < 5, it's "dust" - bot has to wait or combine
        
        # 2. Buys (Must move >= $5)
        # With $7 initial, we can only have ONE position at a time (7 > 5)
        # We only buy if we have enough cash AND it's a dip
        if cash >= 5.0: # Minimum to place an order
            if last_buy == 0 or price <= last_buy * (1 - dip):
                ticket = cash # Use all available cash to maximize use of the small balance
                qty = ticket / (price * (1 + fee))
                # Round to step size
                qty = math.floor(qty / STEP_SIZE) * STEP_SIZE
                if qty * price >= MIN_NOTIONAL:
                    pos.append({'p': price, 'q': qty})
                    cash -= ticket
                    last_buy = price
        
        if h % 24 == 0:
            history.append(cash + sum(p['q']*price for p in pos))
            
    final_equity = cash + sum(p['q']*price for p in pos)
    return {
        "final": final_equity,
        "invested": total_invested,
        "trades": trades,
        "roi": (final_equity / total_invested - 1) * 100,
        "history": history
    }

results = {}
for add in [6, 12, 14]:
    results[f"plus_{add}"] = simulate_low_cap(7, add)

print(json.dumps({k: {"Final": v["final"], "ROI": v["roi"], "Trades": v["trades"]} for k,v in results.items()}, indent=2))

with open('low_cap_results.json', 'w') as f:
    json.dump(results, f)
