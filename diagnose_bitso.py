
import os
import time
import hmac
import hashlib
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv('BITSO_API_KEY')
API_SECRET = os.getenv('BITSO_API_SECRET')
BASE_URL = 'https://api.bitso.com/v3'

def get_auth_headers(method, path, body=''):
    nonce = str(int(time.time() * 1000))
    message = nonce + method + '/v3' + path + body
    signature = hmac.new(API_SECRET.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).hexdigest()
    return {
        'Authorization': f'Bitso {API_KEY}:{nonce}:{signature}',
        'Content-Type': 'application/json'
    }

def check_bitso():
    print("--- ⚔️ REPORTE DE SALDO BITSO ---")
    path = '/balance/'
    headers = get_auth_headers('GET', path)
    
    try:
        response = requests.get(BASE_URL + path, headers=headers)
        json_data = response.json()
        
        if not json_data['success']:
            print(f"❌ Error Bitso: {json_data['error']['message']}")
            return

        balances = json_data['payload']['balances']
        for b in balances:
            total = float(b['total'])
            if total > 0.00000001:
                print(f"Currency: {b['currency']:8s} | Total: {total:12.6f} | Disponible: {b['available']:12s}")
                
    except Exception as e:
        print(f"❌ Error en Bitso: {e}")

if __name__ == "__main__":
    check_bitso()
