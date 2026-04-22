
import os
import time
import math
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def truncate(qty, step_size):
    precision = int(round(-math.log(float(step_size), 10), 0))
    factor = 10 ** precision
    return math.floor(float(qty) * factor) / factor

def aggressive_fet_release():
    print("--- ⚡ LIBERACIÓN RÁPIDA DE FET ---")
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    symbol = 'FETBNB'
    
    # 1. Cancelar orden previa
    orders = client.get_open_orders(symbol=symbol)
    for o in orders:
        if o['side'] == 'SELL':
            print(f"🛑 Cancelando orden vieja de FET: {o['orderId']}")
            client.cancel_order(symbol=symbol, orderId=o['orderId'])

    # 2. Obtener balance real
    balance = client.get_asset_balance(asset='FET')
    free = float(balance['free'])
    
    if free > 1:
        ticker = client.get_symbol_ticker(symbol=symbol)
        price = float(ticker['price'])
        
        # Queremos vender YA, pero que cumpla > 0.01 BNB
        # 28.8 * 0.000355 = 0.01022 BNB (Válido)
        target_price = price * 1.001 # Solo 0.1% arriba del actual
        if free * target_price < 0.0101:
            target_price = 0.0101 / free # Precio mínimo para que sea 0.0101 BNB
            
        info = client.get_symbol_info(symbol)
        tick_size = next(float(f['tickSize']) for f in info['filters'] if f['filterType'] == 'PRICE_FILTER')
        price_prec = int(round(-math.log(tick_size, 10), 0))
        
        formatted_price = "{:0.{}f}".format(target_price, price_prec)
        print(f"🔄 Colocando venta AGRESIVA: {free} @ {formatted_price} BNB")
        client.order_limit_sell(symbol=symbol, quantity=f"{free:.1f}", price=formatted_price)
        print("🚀 FET listo para liberar saldo.")
    else:
        print("❌ No hay FET disponible.")

if __name__ == "__main__":
    aggressive_fet_release()
