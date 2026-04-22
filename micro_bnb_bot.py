
import os
import time
from datetime import datetime
from decimal import Decimal, ROUND_DOWN
from binance.client import Client
from binance.exceptions import BinanceAPIException
from dotenv import load_dotenv

# Configuración - Eduardo Celis - BBNB Mode (Mar 16, 2026)
load_dotenv()

# .env: BINANCE_API_KEY=xxx BINANCE_API_SECRET=yyy
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

# ESTRATEGIA: BNB BASE (Scalping Veloz)
PARES = [
    'FETBNB', 'SOLBNB', 'DOTBNB', 'POLBNB', 'SUIBNB',
    'TRXBNB', 'XRPBNB', 'ADABNB', 'LTCBNB', 'BCHBNB'
]

TARGET_BNB = 0.003       # +0.3% Neto
MIN_BNB_TRADE = 0.0105    # SEGURIDAD: 0.0105 BNB (~$6.40 USD) para cubrir fees y Noitonal
ultima_semana = None
filtros = {}

import math

def get_exchange_info():
    """Obtiene los filtros de precisión de Binance para evitar errores de decimales."""
    global filtros
    print("⏳ Cargando filtros de precisión...")
    try:
        info = client.get_exchange_info()
        for s in info['symbols']:
            if s['symbol'] in PARES:
                # Extraer tickSize y stepSize de los filtros
                tick_size = next(f['tickSize'] for f in s['filters'] if f['filterType'] == 'PRICE_FILTER')
                step_size = next(f['stepSize'] for f in s['filters'] if f['filterType'] == 'LOT_SIZE')
                
                # Calcular precisión decimal (ej: 0.001 -> 3)
                price_prec = int(round(-math.log(float(tick_size), 10), 0))
                qty_prec = int(round(-math.log(float(step_size), 10), 0))
                
                filtros[s['symbol']] = {
                    'price_prec': price_prec,
                    'qty_prec': qty_prec,
                    'tick_size': tick_size,
                    'step_size': step_size
                }
        print("✅ Filtros cargados correctamente.")
    except Exception as e:
        print(f"❌ Error cargando filtros: {e}")

def format_value(value, precision):
    """Formatea decimales según la precisión del par."""
    return "{:0.{}f}".format(float(value), precision)

def get_bnb_balance():
    try:
        balance = client.get_asset_balance(asset='BNB')
        return float(balance['free'])
    except:
        return 0.0

def scalp_trade(symbol, bnb_amount):
    try:
        # 1. Obtener precio y filtros
        ticker = client.get_symbol_ticker(symbol=symbol)
        price = float(ticker['price'])
        f = filtros[symbol]
        
        # 2. Cantidad ajustada a la precisión de Binance
        qty_raw = bnb_amount / price
        qty = format_value(qty_raw, f['qty_prec'])
        
        # 3. COMPRA MARKET (Entrada rápida)
        buy_order = client.order_market_buy(symbol=symbol, quoteOrderQty=bnb_amount)
        print(f"✅ BUY {symbol}: {bnb_amount} BNB")
        
        # 4. Obtener cantidad REAL comprada (después de 0.075% fee)
        qty_executed = float(buy_order['executedQty'])
        
        # Ajustamos la cantidad de venta a lo que realmente tenemos (re-formatear por seguridad)
        qty_to_sell = format_value(qty_executed, f['qty_prec'])
        
        # 5. VENTA LIMIT (+0.3%)
        target_price_raw = price * (1 + TARGET_BNB)
        target_price = format_value(target_price_raw, f['price_prec'])
        
        print(f"⏳ Colocando venta: {qty_to_sell} {symbol} @ {target_price}")
        client.order_limit_sell(
            symbol=symbol,
            quantity=qty_to_sell,
            price=target_price
        )
        print(f"🎯 LIMIT SELL PLACED: {symbol} @ {target_price} BNB")
        return True
    except BinanceAPIException as e:
        print(f"❌ Error en {symbol}: {e.message}")
        return False

def is_new_week():
    global ultima_semana
    now = datetime.now()
    semana = now.isocalendar()[1]
    if (ultima_semana is None) or (ultima_semana != semana):
        # Si es la primera vez, marcamos la semana pero no inyectamos 
        # (se asume que la inyección ocurre al final de la semana o manualmente)
        if ultima_semana is not None:
            ultima_semana = semana
            return True
        ultima_semana = semana
    return False

def main():
    print("🚀 BNB SCALPER BOT (0.3% Target) INICIADO")
    
    # Sincronización de tiempo inicial
    try:
        server_time = client.get_server_time()
        client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
        print(f"✅ Tiempo sincronizado con Binance (Offset: {client.timestamp_offset}ms)")
    except Exception as e:
        print(f"⚠️ Error sincronización: {e}")

    get_exchange_info()
    
    while True:
        try:
            # 1. El balance REAL dictamina qué podemos hacer
            bnb_real = get_bnb_balance()
            
            # 2. Si es nueva semana, el usuario debe inyectar manualmente. 
            # El bot solo avisa que el buffer "debería" subir.
            if is_new_week():
                print(f"📅 ¡NUEVA SEMANA! Recuerda inyectar capital fresco.")
            
            # 3. Intentar trades si hay balance suficiente
            if bnb_real >= MIN_BNB_TRADE:
                for par in PARES:
                    if scalp_trade(par, MIN_BNB_TRADE):
                        # Esperamos para no saturar las órdenes
                        time.sleep(2)
                        break # Un trade por loop para rotar monedas
            else:
                # El bot está esperando saldo. Informamos al usuario cada 3 ciclos (~30s)
                if not hasattr(main, 'counter'): main.counter = 0
                main.counter += 1
                
                if main.counter >= 3:
                    print(f"⏳ [{datetime.now().strftime('%H:%M:%S')}] Esperando saldo. BNB Disponible: {bnb_real:.6f} | Requerido: {MIN_BNB_TRADE}")
                    # Verificar órdenes abiertas para dar feedback
                    try:
                        open_orders = client.get_open_orders()
                        if open_orders:
                            print(f"   🔔 {len(open_orders)} órdenes de venta activas (FET/SOL/etc) esperando profit...")
                    except:
                        pass
                    main.counter = 0
            
            time.sleep(10) # Pausa de seguridad
            
        except KeyboardInterrupt:
            print("\n🛑 BOT DETENIDO")
            break
        except Exception as e:
            print(f"⚠️ Error general: {e}")
            time.sleep(30)

if __name__ == "__main__":
    main()
