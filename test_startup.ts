// test_startup.ts - Ejecutar con: npx ts-node test_startup.ts
import dotenv from 'dotenv';
dotenv.config();

import { BinanceExchange } from './src/exchanges/BinanceExchange';

async function test() {
    console.log('🧪 Testing Binance connection only...');
    
    const apiKey = process.env.BINANCE_API_KEY?.trim();
    const apiSecret = process.env.BINANCE_SECRET?.trim();

    if (!apiKey || !apiSecret) {
        console.error('❌ Credentials missing in .env');
        process.exit(1);
    }

    const exchange = new BinanceExchange(apiKey, apiSecret);
    
    try {
        // Test 1: Endpoint público
        console.log('[1] Testing public endpoint...');
        const ticker = await exchange.getTicker('BNB/USDT');
        console.log('✅ Public OK. Current BNB Price:', ticker.last);
        
        // Test 2: WebSocket
        console.log('[2] Testing WebSocket...');
        exchange.connectWebSocket(['BNB/USDT']);
        
        exchange.once('ticker', (data) => {
            console.log('✅ WebSocket received data:', data.symbol, data.price);
            exchange.disconnectWebSocket();
            console.log('🎉 All tests passed. The issue is likely in ProductionGridBot logic.');
            process.exit(0);
        });
        
        exchange.on('error', (err) => {
            console.error('❌ WebSocket error:', err);
            process.exit(1);
        });
        
        // Mantener vivo para WS
        setTimeout(() => {
            console.log('⚠️ WebSocket timeout');
            process.exit(1);
        }, 15000);
        
    } catch (e: any) {
        console.error('💥 Test failed:', e?.message || e);
        process.exit(1);
    }
}

test();
