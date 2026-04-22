
import pandas as pd
import numpy as np
import requests
import time
import matplotlib.pyplot as plt
from datetime import datetime

# configuration
symbols = ['BTCUSDT','ETHUSDT','XRPUSDT','SOLUSDT','BNBUSDT','CFGUSDT','DEXEUSDT','OPUSDT','FLOKIUSDT','BONKUSDT']
ticket_size = 5.0
profit_target_net = 0.01 # 1% net
fee_rate = 0.001 # 0.1% binance fee

# Fetch Data
real_prices = {}
print("Fetching real market data from Binance...")
for sym in symbols:
    try:
        url = f'https://api.binance.com/api/v3/klines?symbol={sym}&interval=1h&limit=720'
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            closes = [float(k[4]) for k in data]
            real_prices[sym] = np.array(closes)
            print(f" ✓ {sym} loaded ({len(closes)} candles)")
        else:
            print(f" ✗ {sym} failed: {resp.status_code}")
    except Exception as e:
        print(f" ✗ {sym} error: {e}")
    time.sleep(0.1)

# Simulation
valid_symbols = [s for s in real_prices if len(real_prices[s]) >= 720]
if not valid_symbols:
    print("No valid data to simulate.")
    exit()

tickets_activos = [] # list of dicts
ganancia_realizada = 0.0
portfolio_history = []
capital_en_hold_history = []

for t in range(720):
    current_step_gain = 0
    held_value = 0
    
    # 1. Check Sales
    for ticket in tickets_activos[:]: # Copy to allow removal
        sym = ticket['coin']
        precio_actual = real_prices[sym][t]
        
        if precio_actual >= ticket['target']:
            # Sell!
            revenue = ticket['qty'] * precio_actual * (1 - fee_rate)
            gain = revenue - ticket_size
            ganancia_realizada += gain
            tickets_activos.remove(ticket)
    
    # 2. Try DCA Entries (one per symbol per step if conditions met)
    for sym in valid_symbols:
        precio_actual = real_prices[sym][t]
        
        # Dynamic threshold based on active tickets
        n = len(tickets_activos)
        threshold = 0.005 if n < 100 else 0.004 if n < 300 else 0.003 if n < 600 else 0.002 if n < 1000 else 0.001
        
        tickets_moneda = [tk for tk in tickets_activos if tk['coin'] == sym]
        
        comprar = False
        if not tickets_moneda:
            comprar = True
        else:
            # Check last ticket for this coin
            last_tk = tickets_moneda[-1]
            if precio_actual <= last_tk['buy_price'] * (1 - threshold):
                comprar = True
        
        if comprar:
            p_compra = precio_actual * 1.0005 # small slippage
            qty = (ticket_size * (1 - fee_rate)) / p_compra 
            target = (ticket_size * (1 + profit_target_net)) / (qty * (1 - fee_rate))
            
            tickets_activos.append({
                'coin': sym,
                'buy_price': p_compra,
                'target': target,
                'qty': qty,
                'timestamp': t
            })
            
    # Track current held value
    for tk in tickets_activos:
        held_value += tk['qty'] * real_prices[tk['coin']][t]
        
    portfolio_history.append(ganancia_realizada + held_value)
    capital_en_hold_history.append(held_value)

# Visualization
plt.figure(figsize=(12, 6))
plt.plot(portfolio_history, label='Portfolio Value (Total)', color='#00ffcc', linewidth=2)
plt.plot(capital_en_hold_history, label='Capital in Hold', color='#ff3366', linestyle='--', alpha=0.7)
plt.fill_between(range(720), portfolio_history, color='#00ffcc', alpha=0.1)

plt.title('DCA-Hold Strategy Simulation (30 Days - 1h Resolution)', fontsize=14, color='white')
plt.xlabel('Hours', color='white')
plt.ylabel('USD Value', color='white')
plt.grid(True, which='both', linestyle='--', alpha=0.2)
plt.legend()
plt.style.use('dark_background')

# Save results
stats = f"Final Total Portfolio Value: ${portfolio_history[-1]:.2f}\n"
stats += f"Total Realized Profit: ${ganancia_realizada:.2f}\n"
stats += f"Active Tickets at End: {len(tickets_activos)}\n"
stats += f"Capital currently in Hold: ${capital_en_hold_history[-1]:.2f}"
print(stats)

plt.savefig('strategy_simulation.png', facecolor='#121212')
with open('simulation_stats.txt', 'w') as f:
    f.write(stats)
