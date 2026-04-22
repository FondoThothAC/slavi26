import dotenv from 'dotenv';
import * as fs from 'fs';

// 2. Capturador de muerte súbita (Síncrono)
process.on('exit', (code) => {
    // Esto se ejecuta aunque todo lo demás falle
    fs.writeSync(
        process.stderr.fd, 
        `\n💥 [FATAL] El proceso terminó con código ${code}. Verifica la consola.\n`
    );
});

dotenv.config();

import { BinanceExchange } from './exchanges/BinanceExchange';
import { ProductionGridBot, BotConfig } from './ProductionGridBot';
import { tradeDB } from './AsyncTradeDB';
import { isPortAvailable } from './utils/portChecker';
import { telegram } from './utils/TelegramManager';
import { startWebSocketServer, stopWebSocketServer } from './ws-server';

async function main() {
    // 🔥 REGISTRAR HANDLERS PRIMERO (antes de cualquier async)
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 [FATAL] Unhandled Rejection at:', promise);
        console.error('💥 Reason:', reason);
        console.error('💥 Stack:', reason instanceof Error ? reason.stack : 'No stack');
    });
    
    process.on('uncaughtException', (error) => {
        console.error('💥 [FATAL] Uncaught Exception:', error);
        console.error('💥 Stack:', error.stack);
        // Permite que el proceso siga vivo un momento para el log
    });

    process.on('exit', (code) => {
        console.log(`[DEBUG] Process exiting with code: ${code}`);
    });

    console.log('🚀 SLAVI v2.2.0 (2026-04-22) - BINANCE BNB STRATEGY');
    console.log('🎯 Config: Base BNB | Top 10 Vol | Target +0.3% | Fee 0.075%');

    let bot: ProductionGridBot | null = null;
    let exchange: BinanceExchange | null = null;

    try {
        // 🔍 DEBUG: Verificar credenciales ANTES de usarlas
        const apiKey = process.env.BINANCE_API_KEY?.trim();
        const apiSecret = process.env.BINANCE_SECRET?.trim();
        
        if (!apiKey || !apiSecret) {
            throw new Error('❌ Binance credentials missing or empty in .env');
        }
        console.log('[✓] Credentials loaded (API Key starts with: ' + apiKey.slice(0, 8) + '...)');

        // 0. Verificar puertos antes de iniciar
        const ports = [3334, 8080];
        for (const port of ports) {
            if (!(await isPortAvailable(port))) {
                console.warn(`⚠️ Port ${port} in use, waiting for system to release it...`);
                await new Promise(r => setTimeout(r, 1000));
                if (!(await isPortAvailable(port))) {
                    console.error(`❌ Port ${port} is permanently blocked.`);
                    process.exit(1);
                }
            }
        }

        // 1. Inicializar DB
        console.log('[1/4] Conectando a SQLite...');
        await tradeDB.init();
        console.log('[✓] SQLite connected');

        // 2. Inicializar Exchange
        console.log('[2/4] Inicializando Binance Exchange...');
        exchange = new BinanceExchange(apiKey, apiSecret, {
            throttleMs: 50,
            recvWindow: 10000
        });
        
        // Test de conexión básico (público)
        console.log('[3/4] Probando conexión con Binance...');
        await exchange.getTicker('BNB/USDT'); 
        console.log('[✓] Binance API reachable');

        // 3. Crear Bot
        console.log('[4/4] Creando ProductionGridBot...');
        const botConfig: BotConfig = {
            baseAsset: 'BNB',
            pairCount: 1,
            targetProfit: 0.003,
            commissionRate: 0.00075,
            orderSizeBNB: 0.0105,
            wsEnabled: true,
            trailingStop: {
                basePercent: 0.002,
                volatilityMultiplier: 2.0
            },
            maxConcurrentPairs: 10,
            scanIntervalMs: 5000
        };
        
        bot = new ProductionGridBot(exchange, tradeDB, botConfig);
        await bot.initialize();

        // 3.5 Iniciar Servidor WebSocket Antigravity
        startWebSocketServer(8080);

        await bot.start();

        // 🚀 Alerta de Telegram: Sistema Online
        if (telegram.isEnabled()) {
            await telegram.sendSystemAlert('🚀 SLAVI BNB Strategy is now ONLINE and scanning.');
        }

        // ✅ Todo exitoso
        console.log('✅ System Online. WebSocket activo escuchando Top 10...');
        console.log('🔧 PRODUCTION PANEL: http://localhost:3334');
        console.log('🔒 Process kept alive. Press Ctrl+C to stop.');
        
        // Heartbeat de diagnóstico
        const heartbeat = setInterval(() => {
            const wsState = (exchange as any).ws?.readyState;
            console.log(`[❤️] Heartbeat | Uptime: ${Math.floor(process.uptime())}s | WS: ${wsState === 1 ? 'OPEN' : wsState === 2 ? 'CLOSING' : wsState === 3 ? 'CLOSED' : 'UNKNOWN'}`);
        }, 10000);

        // Manejo de cierre limpio
        const shutdown = async () => {
            console.log('\n🛑 Apagando bots y liberando puertos...');
            clearInterval(heartbeat);
            try {
                if (bot) await bot.stop();
                await stopWebSocketServer();
                if (exchange) exchange.disconnectWebSocket();
            } catch (e) {
                console.error('[Shutdown] Error during cleanup:', e);
            }
            console.log('✅ Shutdown complete.');
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // --- BALANCE CACHE (Tarea 4 v2.2) ---
        let balanceCache = { bnb: 0, lastUpdate: 0 };
        const BALANCE_CACHE_SECONDS = 60;

        const getAvailableBalance = async (): Promise<number> => {
            const now = Date.now();
            if (now - balanceCache.lastUpdate < BALANCE_CACHE_SECONDS * 1000) {
                return balanceCache.bnb;
            }
            
            try {
                const balances = await exchange!.getBalance();
                const bnb = balances.find((b: any) => b.asset === 'BNB')?.free || 0;
                balanceCache = { bnb, lastUpdate: now };
                return bnb;
            } catch (e) {
                console.warn('[Balance] Failed to fetch live balance, using cache.');
                return balanceCache.bnb;
            }
        };

        // 🔥 ANCLA FINAL
        process.stdin.resume();

    } catch (error: any) {
        console.error('💥 [STARTUP CRASH] El bot falló durante la inicialización:');
        console.error('💥 Error:', error?.message || error);
        console.error('💥 Stack:', error?.stack);
        
        if (exchange) {
            try { exchange.disconnectWebSocket(); } catch(e) {}
        }
        
        console.log('\n⚠️  La ventana se mantendrá abierta 30 segundos para que leas el error...');
        setTimeout(() => {
            console.log('💤 Cerrando automáticamente...');
            process.exit(1);
        }, 30000);
        
        process.stdin.resume();
    }
}

main();
