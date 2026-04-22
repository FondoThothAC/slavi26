
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def check_binance():
    print("--- ⚔️ REPORTE DE SALDO BINANCE (Sincronizando...) ---")
    
    # Sincronizar tiempo para evitar error -1021
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    try:
        account = client.get_account()
        balances = [b for b in account['balances'] if float(b['free']) > 0 or float(b['locked']) > 0]
        
        has_locked = False
        for b in balances:
            free = float(b['free'])
            locked = float(b['locked'])
            if free < 0.000001 and locked < 0.000001: continue
            
            print(f"Asset: {b['asset']:8s} | Libre: {free:12.6f} | Congelado: {locked:12.6f}")
            
            if locked > 0:
                has_locked = True
                # Buscar órdenes abiertas para este asset
                open_orders = client.get_open_orders()
                for o in open_orders:
                    if o['symbol'].startswith(b['asset']) or o['symbol'].endswith(b['asset']):
                        print(f"   ⚠️ ORDEN ACTIVA: {o['symbol']} | ID: {o['orderId']} | Qty: {o['origQty']}")
        
        if not has_locked:
            print("✅ No hay fondos congelados en órdenes abiertas.")
            
    except Exception as e:
        print(f"❌ Error al consultar balance: {e}")

if __name__ == "__main__":
    check_binance()
