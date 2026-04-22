
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def check_history():
    # Sincronizar tiempo
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    PARES = [
        'FETBNB', 'SOLBNB', 'DOTBNB', 'POLBNB', 'SUIBNB',
        'TRXBNB', 'XRPBNB', 'ADABNB', 'LTCBNB', 'BCHBNB'
    ]
    
    print("--- 📜 HISTORIAL DE TRADES RECIENTES ---")
    any_trades = False
    for symbol in PARES:
        try:
            trades = client.get_my_trades(symbol=symbol, limit=5)
            if trades:
                any_trades = True
                print(f"\n🪙 Pair: {symbol}")
                for t in trades:
                    side = "BUY" if t['isBuyer'] else "SELL"
                    print(f"   {side} | Qty: {t['qty']:15s} | Price: {t['price']:15s} | Time: {time.strftime('%H:%M:%S', time.localtime(t['time']/1000))}")
        except Exception as e:
            # print(f"Error en {symbol}: {e}")
            pass
            
    if not any_trades:
        print("❌ No se encontraron trades recientes en los pares configurados.")

if __name__ == "__main__":
    check_history()
