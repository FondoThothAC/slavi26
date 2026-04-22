
import os
import time
import math
import hmac
import hashlib
import requests
from binance.client import Client
from binance.exceptions import BinanceAPIException
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv('BINANCE_API_KEY')
API_SECRET = os.getenv('BINANCE_API_SECRET')
BASE_URL = 'https://api.binance.com'

def get_client():
    c = Client(API_KEY, API_SECRET)
    server_time = c.get_server_time()
    c.timestamp_offset = server_time['serverTime'] - int(time.time() * 1000)
    return c

def truncate(qty, step_size):
    # Binance requiere TRUNCAR, nunca redondear hacia arriba
    precision = int(round(-math.log(float(step_size), 10), 0))
    factor = 10 ** precision
    return math.floor(float(qty) * factor) / factor

def final_aggressive_consolidation():
    print("--- ⚔️ ESTRATEGIA DE CONSOLIDACIÓN AGRESIVA V3 (Truncate Mode) ---")
    c = get_client()
    
    # 1. TRADE DIRECTO SOL -> BNB
    try:
        sol_bal = float(c.get_asset_balance(asset='SOL')['free'])
        info = c.get_symbol_info('SOLBNB')
        step_size = next(f['stepSize'] for f in info['filters'] if f['filterType'] == 'LOT_SIZE')
        
        # TRUNCAR cantidad para evitar "Insufficient Balance"
        qty_to_sell = truncate(sol_bal, step_size)
        
        ticker = c.get_symbol_ticker(symbol='SOLBNB')
        price = float(ticker['price'])
        
        if qty_to_sell * price > 0.01: 
            print(f"🔄 Vendiendo {qty_to_sell} SOL por BNB...")
            c.order_market_sell(symbol='SOLBNB', quantity=f"{qty_to_sell:.3f}") # SOL suele usar 3 decimales
            print("✅ SOL convertido a BNB.")
        else:
            print("ℹ️ Saldo SOL insuficiente para trade directo.")
    except Exception as e:
        print(f"⚠️ Error en trade SOLBNB: {e}")

    # 2. BALANCE FINAL
    time.sleep(2)
    bnb = c.get_asset_balance(asset='BNB')
    print(f"\n✨ BALANCE FINAL PARA EL BOT: {bnb['free']} BNB")

if __name__ == "__main__":
    final_aggressive_consolidation()
