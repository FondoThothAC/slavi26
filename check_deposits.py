
import os
import time
from binance.client import Client
from dotenv import load_dotenv

load_dotenv()
client = Client(os.getenv('BINANCE_API_KEY'), os.getenv('BINANCE_API_SECRET'))

def check_deposits():
    server_time = client.get_server_time()
    client.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    
    print("--- 📥 ÚLTIMOS DEPÓSITOS BINANCE ---")
    deposits = client.get_deposit_history()
    for d in deposits[:5]:
        status_map = {0: 'Pendiente', 6: 'Confirmado', 1: 'Exitoso'}
        status = status_map.get(d['status'], f"Estado {d['status']}")
        print(f"Moneda: {d['coin']:5s} | Cantidad: {d['amount']:8s} | Estado: {status:10s} | Tiempo: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(d['insertTime']/1000))}")

if __name__ == "__main__":
    check_deposits()
