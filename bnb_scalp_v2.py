
import math
import random

def simulate_hft(vol, trend, target, dip, fee, initial, weekly_add):
    n_hours = 360 * 24
    cash = initial
    pos = []
    trades = 0
    price = 100.0
    vol_h = (vol/100) / math.sqrt(365*24)
    drift_h = trend / (365*24)
    last_buy_price = 0
    total_invested = initial
    
    for h in range(n_hours):
        if h > 0 and h % (24 * 7) == 0:
            cash += weekly_add
            total_invested += weekly_add
        
        # Price move
        price *= math.exp(random.gauss(drift_h, vol_h))
        
        # 1. Sells
        for i in range(len(pos)-1, -1, -1):
            if price >= pos[i]['p'] * (1 + target):
                cash += pos[i]['q'] * price * (1 - fee)
                trades += 1
                pos.pop(i)
        
        # 2. Capital Usage & Buys
        pos_val = sum(p['q'] * price for p in pos)
        balance = cash + pos_val
        usage = pos_val / balance if balance > 0 else 0
        
        ticket = max(5.0, balance / 20) # Aggressive: 20 positions
        
        # Buy if dip OR if usage is too low (Force Buy to maintain 95% usage)
        force_buy = usage < 0.90
        dip_buy = last_buy_price == 0 or price <= last_buy_price * (1 - dip)
        
        if (dip_buy or force_buy) and cash >= ticket:
            pos.append({'p': price, 'q': ticket / (price * (1 + fee))})
            cash -= ticket
            last_buy_price = price
            
    final_equity = cash + sum(p['q'] * price for p in pos)
    roi = (final_equity / total_invested - 1) * 100
    return final_equity, trades, roi

# Compare USDT (Safe) vs BNB (Aggressive Scalper)
# USDT: Target 4%, Dip 1%, Fee 0.1% (Standard)
# BNB: Target 0.3%, Dip 0.15%, Fee 0.075% (Maker-to-Maker)

v_usdt, t_usdt = 54, 0.4 # Annualized stats from previous fetch
v_bnb, t_bnb = 82, 0.6

print("=== Simulacion HFT 360 Dias (95% Usage) ===")
res_u, tr_u, roi_u = simulate_hft(v_usdt, t_usdt, 0.04, 0.01, 0.001, 50, 10)
res_b, tr_b, roi_b = simulate_hft(v_bnb, t_bnb, 0.003, 0.0015, 0.00075, 50, 10)

print(f"USDT Base (4%): ROI {roi_u:.1f}%, Trades {tr_u}")
print(f"BNB Base (0.3%): ROI {roi_b:.1f}%, Trades {tr_b}")
