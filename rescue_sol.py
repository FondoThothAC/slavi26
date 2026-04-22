
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

def rescue_sol_v3():
    print("--- 🩺 RESCUE SOL V3 (Manual Filters) ---")
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    symbol = 'SOLBNB'
    balance = client.get_asset_balance(asset='SOL')
    free = float(balance['free'])
    
    if free > 0.01:
        print(f"📦 Detectado: {free} SOL")
        
        info = client.get_symbol_info(symbol)
        
        # Extracción robusta de filtros
        tick_size = 0.0001
        step_size = 0.001
        min_notional = 0.01
        
        for f in info['filters']:
            if f['filterType'] == 'PRICE_FILTER':
                tick_size = float(f['tickSize'])
            if f['filterType'] == 'LOT_SIZE':
                step_size = float(f['stepSize'])
            if f['filterType'] in ['MIN_NOTIONAL', 'NOTIONAL']:
                min_notional = float(f.get('minNotional') or f.get('notional') or 0.01)
        
        price_prec = int(round(-math.log(tick_size, 10), 0))
        
        ticker = client.get_symbol_ticker(symbol=symbol)
        price = float(ticker['price'])
        
        # Forzamos un notional seguro de 0.011 BNB (Binance suele pedir 0.01 de base)
        # 0.071 * price = valor. Si valor < 0.011, ajustamos precio.
        target_price = price * 1.005 # +0.5%
        qty_to_sell = truncate(free, step_size)
        
        if qty_to_sell * target_price < min_notional + 0.001:
            print(f"⚠️ Notional insuficiente. Ajustando precio...")
            target_price = (min_notional + 0.002) / qty_to_sell
            
        formatted_price = "{:0.{}f}".format(target_price, price_prec)
        
        try:
            print(f"   🔄 Colocando venta: {qty_to_sell} @ {formatted_price} BNB")
            client.order_limit_sell(symbol=symbol, quantity=f"{qty_to_sell:.3f}", price=formatted_price)
            print("   🚀 SOL rescatado exitosamente.")
        except Exception as e:
            print(f"   ❌ Falló rescate: {e}")
    else:
        print("✅ No hay SOL suelto para rescatar.")

if __name__ == "__main__":
    rescue_sol_v3()
