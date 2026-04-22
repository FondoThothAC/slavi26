import os, time, json
from binance.client import Client
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()
c = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))
s = c.get_server_time()['serverTime']
c.timestamp_offset = s - int(time.time() * 1000)

# Get all balances
acc = c.get_account()
bals = [b for b in acc['balances'] if float(b['free']) > 0 or float(b['locked']) > 0]

# Get BNB price for conversions
bnb_usd = float(c.get_symbol_ticker(symbol='BNBUSDT')['price'])

# Calculate 24h P&L from trades
now_ms = int(time.time() * 1000) + c.timestamp_offset
day_ago_ms = now_ms - (24 * 60 * 60 * 1000)

pairs = ['FETBNB', 'SOLBNB', 'DOTBNB', 'POLBNB', 'SUIBNB', 'TRXBNB', 'XRPBNB', 'ADABNB', 'LTCBNB', 'BCHBNB']

total_pnl_bnb = 0
trade_count_24h = 0
trade_details = []

for symbol in pairs:
    try:
        trades = c.get_my_trades(symbol=symbol, limit=50)
        recent = [t for t in trades if t['time'] >= day_ago_ms]
        
        for t in recent:
            trade_count_24h += 1
            qty = float(t['qty'])
            price = float(t['price'])
            fee = float(t['commission'])
            is_buy = t['isBuyer']
            
            if is_buy:
                cost_bnb = qty * price + fee
                total_pnl_bnb -= cost_bnb
            else:
                revenue_bnb = qty * price - fee
                total_pnl_bnb += revenue_bnb
            
            trade_details.append({
                "symbol": symbol,
                "side": "BUY" if is_buy else "SELL",
                "qty": qty,
                "price": price,
                "bnb_value": qty * price,
                "fee": fee,
                "time": time.strftime('%m/%d %H:%M', time.gmtime(t['time']/1000))
            })
    except:
        pass

result = {
    "bnb_usd_price": bnb_usd,
    "pnl_24h_bnb": round(total_pnl_bnb, 8),
    "pnl_24h_usd": round(total_pnl_bnb * bnb_usd, 4),
    "trades_24h": trade_count_24h,
    "trade_details": trade_details[-20:],  # last 20
    "balances": [{
        "asset": b['asset'],
        "free": float(b['free']),
        "locked": float(b['locked']),
        "total": float(b['free']) + float(b['locked'])
    } for b in bals]
}

with open('pnl_result.json', 'w') as f:
    json.dump(result, f, indent=2)

print("DONE")
