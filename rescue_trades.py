
import os
import time
import math
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

PARES = ['FETBNB', 'SOLBNB', 'DOTBNB', 'POLBNB', 'SUIBNB', 'TRXBNB', 'XRPBNB', 'ADABNB', 'LTCBNB', 'BCHBNB']
TARGET_BNB = 0.003

def format_value(value, precision):
    return "{:0.{}f}".format(float(value), precision)

def rescue_trades():
    print("--- 🩺 RESCATE DE TRADES ---")
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    info = client.get_exchange_info()
    
    for symbol in PARES:
        base_asset = next(s['baseAsset'] for s in info['symbols'] if s['symbol'] == symbol)
        balance = client.get_asset_balance(asset=base_asset)
        free = float(balance['free'])
        
        if free > 0:
            print(f"\n📦 Detectado: {free} {base_asset}")
            # Ver si ya tiene orden de venta
            orders = client.get_open_orders(symbol=symbol)
            if any(o['side'] == 'SELL' for o in orders):
                print(f"   ✅ Ya tiene orden de venta activa.")
                continue
            
            # Obtener filtros
            s_info = next(s for s in info['symbols'] if s['symbol'] == symbol)
            tick_size = next(f['tickSize'] for f in s_info['filters'] if f['filterType'] == 'PRICE_FILTER')
            step_size = next(f['stepSize'] for f in s_info['filters'] if f['filterType'] == 'LOT_SIZE')
            price_prec = int(round(-math.log(float(tick_size), 10), 0))
            qty_prec = int(round(-math.log(float(step_size), 10), 0))
            
            # Obtener precio actual para el target
            ticker = client.get_symbol_ticker(symbol=symbol)
            price = float(ticker['price'])
            
            target_price = format_value(price * (1 + TARGET_BNB), price_prec)
            qty_to_sell = format_value(free, qty_prec)
            
            try:
                print(f"   🔄 Colocando venta de rescate: {qty_to_sell} @ {target_price} BNB")
                client.order_limit_sell(symbol=symbol, quantity=qty_to_sell, price=target_price)
                print(f"   🚀 Venta colocada con éxito.")
            except Exception as e:
                print(f"   ❌ Falló rescate de {symbol}: {e}")

if __name__ == "__main__":
    rescue_trades()
