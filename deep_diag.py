
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def debug_account():
    # Sincronizar tiempo
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    print("--- 🔍 DIAGNÓSTICO PROFUNDO DE CUENTA ---")
    account = client.get_account()
    
    print(f"Can Trade: {account['canTrade']}")
    print(f"Account Type: {account['accountType']}")
    
    bnb = next((b for b in account['balances'] if b['asset'] == 'BNB'), None)
    if bnb:
        print(f"BNB Free: {bnb['free']}")
        print(f"BNB Locked: {bnb['locked']}")
        total = float(bnb['free']) + float(bnb['locked'])
        print(f"BNB Total: {total}")
    else:
        print("❌ No se encontró BNB en la cuenta.")

    # Ver si hay órdenes abiertas que bloqueen capital
    open_orders = client.get_open_orders()
    if open_orders:
        print(f"\n⚠️ Tienes {len(open_orders)} órdenes abiertas:")
        for o in open_orders:
            print(f"   - {o['symbol']} {o['side']} | Qty: {o['origQty']} | Price: {o['price']}")
    else:
        print("\n✅ No hay órdenes abiertas bloqueando saldo.")

if __name__ == "__main__":
    debug_account()
