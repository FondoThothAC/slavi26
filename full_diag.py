import os, time, json
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
c = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))
s = c.get_server_time()['serverTime']
c.timestamp_offset = s - int(time.time() * 1000)

acc = c.get_account()
bals = [b for b in acc['balances'] if float(b['free']) > 0 or float(b['locked']) > 0]

result = {"balances": [], "total_usd": 0, "open_orders": [], "trades": {}}

for b in bals:
    asset = b['asset']
    free = float(b['free'])
    locked = float(b['locked'])
    total = free + locked
    
    usd_val = 0
    try:
        if asset in ('USDT', 'FDUSD'):
            usd_val = total
        elif asset == 'BNB':
            t = c.get_symbol_ticker(symbol='BNBUSDT')
            usd_val = total * float(t['price'])
        else:
            try:
                t = c.get_symbol_ticker(symbol=f'{asset}USDT')
                usd_val = total * float(t['price'])
            except:
                try:
                    t = c.get_symbol_ticker(symbol=f'{asset}BNB')
                    bnb_price = float(c.get_symbol_ticker(symbol='BNBUSDT')['price'])
                    usd_val = total * float(t['price']) * bnb_price
                except:
                    pass
    except:
        pass
    
    result["total_usd"] += usd_val
    result["balances"].append({
        "asset": asset, "free": free, "locked": locked, "total": total, "usd": round(usd_val, 4)
    })

orders = c.get_open_orders()
for o in orders:
    result["open_orders"].append({
        "symbol": o['symbol'], "side": o['side'], "qty": o['origQty'], 
        "price": o['price'], "status": o['status']
    })

for symbol in ['FETBNB', 'SOLBNB']:
    try:
        trades = c.get_my_trades(symbol=symbol, limit=10)
        result["trades"][symbol] = [{
            "time": time.strftime('%Y-%m-%d %H:%M', time.gmtime(t['time']/1000)),
            "side": "BUY" if t['isBuyer'] else "SELL",
            "qty": t['qty'], "price": t['price'],
            "fee": t['commission'], "feeAsset": t['commissionAsset']
        } for t in trades]
    except:
        result["trades"][symbol] = []

with open('diag_result.json', 'w') as f:
    json.dump(result, f, indent=2)

print("DONE")
