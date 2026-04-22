
import json
import math
import random

# Stats reales aproximadas de Binance (Volatilidad Anual y Trend)
# FET/BNB es muy volátil (~110%), BTC/BNB es más estable (~45%)
stats_pares = {
    'FETBNB': (1.10, 0.80), 'SOLBNB': (0.85, 0.60), 'ETHBNB': (0.55, 0.40),
    'BTCBNB': (0.45, 0.45), 'DOGEBNB': (1.20, 0.30), 'LINKBNB': (0.75, 0.40),
    'MATICBNB': (0.80, 0.20), 'NEARBNB': (1.00, 0.50), 'AVAXBNB': (0.95, 0.45),
    'DOTBNB': (0.70, 0.25)
}

def simulate_hft_multi(initial_bnb, weekly_usd_add, bnb_price=600):
    n_days = 360
    n_hours = n_days * 24
    
    cash_bnb = initial_bnb
    positions = {p: [] for p in stats_pares}
    prices = {p: 100.0 for p in stats_pares}
    
    # Config bot
    target = 0.003  # 0.3%
    fee = 0.00075   # 0.075% BNB Maker/Taker avg
    min_trade_bnb = 0.015 # ~$10
    
    total_trades = 0
    history = []
    total_bnb_invested = initial_bnb
    
    # Generar drifts horarios
    drifts = {p: s[1]/(365*24) for p,s in stats_pares.items()}
    vols = {p: (s[0])/math.sqrt(365*24) for p,s in stats_pares.items()}

    for h in range(n_hours):
        # Inyección semanal (convertida a BNB)
        if h > 0 and h % (24 * 7) == 0:
            add_bnb = weekly_usd_add / bnb_price
            cash_bnb += add_bnb
            total_bnb_invested += add_bnb
            
        for p in stats_pares:
            # Mover precio
            prices[p] *= math.exp(random.gauss(drifts[p], vols[p]))
            curr_p = prices[p]
            
            # 1. Checar Ventas
            for i in range(len(positions[p])-1, -1, -1):
                pos = positions[p][i]
                if curr_p >= pos['buy_price'] * (1 + target):
                    cash_bnb += pos['qty'] * curr_p * (1 - fee)
                    total_trades += 1
                    positions[p].pop(i)
            
            # 2. Intentar Compras (HFT: Sin dip, solo disponibilidad de capital)
            # El usuario no puso filtro de dip en su script, así que compra en cuanto hay balance.
            if cash_bnb >= min_trade_bnb:
                qty = (min_trade_bnb / curr_p) * (1 - fee)
                positions[p].append({'buy_price': curr_p, 'qty': qty})
                cash_bnb -= min_trade_bnb

        if h % 24 == 0:
            total_val = cash_bnb + sum(sum(pos['qty']*prices[p] for pos in positions[p]) for p in stats_pares)
            history.append(total_val)

    final_val = cash_bnb + sum(sum(pos['qty']*prices[p] for pos in positions[p]) for p in stats_pares)
    roi = (final_val / total_bnb_invested - 1) * 100
    
    return {
        "final_bnb": final_val,
        "invested_bnb": total_bnb_invested,
        "trades": total_trades,
        "roi": roi,
        "history": history
    }

# Simulación con $50 inicial (~0.08 BNB) y $10 semanales (~0.016 BNB)
res = simulate_hft_multi(0.08, 10)

print(f"--- RESULTADOS BNB SCALPER (360 DIAS) ---")
print(f"BNB Invertidos: {res['invested_bnb']:.4f}")
print(f"BNB Final: {res['final_bnb']:.4f}")
print(f"Trades Totales: {res['trades']}")
print(f"ROI Final: {res['roi']:.2f}%")

with open('bnb_hft_sim_results.json', 'w') as f:
    json.dump(res, f)
