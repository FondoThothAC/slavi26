
import json
import math
import random

# Simulación BNBBTC 1 Año
# BNB suele apreciarse contra BTC en bull markets, pero con menos volatilidad que las alts.
def simulate_bnbbtc(initial_btc, weekly_btc_add):
    n_days = 360
    n_hours = n_days * 24
    
    cash_btc = initial_btc
    pos_bnb = []
    
    # Stats BNBBTC aproximadas (Volatility ~45% annual, Trend +15% annual)
    vol_h = 0.45 / math.sqrt(365 * 24)
    drift_h = 0.15 / (365 * 24)
    
    # Config Scalping
    target = 0.003  # 0.3%
    fee = 0.00075   # 0.075% BNB Maker/Taker
    min_trade_btc = 0.0001 # ~$6-7 USD at 60k BTC
    
    price = 0.009 # Precio inicial BNB/BTC (aprox)
    total_trades = 0
    history = []
    total_btc_invested = initial_btc
    
    for h in range(n_hours):
        # Inyección semanal
        if h > 0 and h % (24 * 7) == 0:
            cash_btc += weekly_btc_add
            total_btc_invested += weekly_btc_add
            
        # Mover precio
        price *= math.exp(random.gauss(drift_h, vol_h))
        
        # 1. Ventas
        for i in range(len(pos_bnb)-1, -1, -1):
            pos = pos_bnb[i]
            if price >= pos['buy_price'] * (1 + target):
                cash_btc += pos['qty'] * price * (1 - fee)
                total_trades += 1
                pos_bnb.pop(i)
        
        # 2. Compras
        # Con $7 (~0.0001 BTC), operamos en cuanto hay balance
        if cash_btc >= min_trade_btc:
            qty = (min_trade_btc / price) * (1 - fee)
            pos_bnb.append({'buy_price': price, 'qty': qty})
            cash_btc -= min_trade_btc
            
        if h % 24 == 0:
            total_val = cash_btc + sum(p['qty'] * price for p in pos_bnb)
            history.append(total_val)
            
    final_val = cash_btc + sum(p['qty'] * price for p in pos_bnb)
    roi_pct = (final_val / total_btc_invested - 1) * 100
    
    return {
        "final_btc": final_val,
        "invested_btc": total_btc_invested,
        "trades": total_trades,
        "roi": roi_pct,
        "history": history
    }

# Simulación con equivalente a $7 USD (~0.00011 BTC) y $10 semanal (~0.00016 BTC)
res = simulate_bnbbtc(0.00011, 0.00016)

print(f"--- RESULTADOS BNBBTC (360 DIAS) ---")
print(f"BTC Invertidos: {res['invested_btc']:.6f}")
print(f"BTC Final: {res['final_btc']:.6f}")
print(f"Trades Totales: {res['trades']}")
print(f"ROI Final (en BTC): {res['roi']:.2f}%")

with open('bnbbtc_sim_results.json', 'w') as f:
    json.dump(res, f)
