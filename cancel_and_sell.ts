import 'dotenv/config';
import { BinanceExchange } from './src/exchanges/BinanceExchange';

const exchange = new BinanceExchange(
    process.env.BINANCE_API_KEY || '',
    process.env.BINANCE_API_SECRET || ''
);

async function cancelAndSell() {
    console.log('=== CANCEL ALL ORDERS & SELL EVERYTHING ===\n');

    // 1. Cancel ALL open orders across all known pairs
    const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT', 'USDC/USDT', 'BTC/USDC', 'FDUSD/USDT'];
    for (const pair of pairs) {
        try {
            const orders = await exchange.getOpenOrders(pair);
            for (const o of orders) {
                console.log(`Cancelling ${pair} order ${o.id} (${o.side} ${o.amount} @ ${o.price})...`);
                await exchange.cancelOrder(o.id, pair);
                console.log('  -> Cancelled!');
            }
        } catch (e) { /* skip */ }
    }

    // 2. Wait a moment for cancellations to clear
    await new Promise(r => setTimeout(r, 1000));

    // 3. Check balances and sell everything
    const balances = await exchange.getBalance();
    for (const b of balances) {
        if (b.asset === 'USDT' || b.asset === 'MXN') continue;
        if (b.free <= 0) continue;

        const symbol = `${b.asset}/USDT`;
        try {
            const ticker = await exchange.getTicker(symbol);
            const value = b.free * ticker.bid;

            if (value > 1) {
                console.log(`SELLING ${b.free} ${b.asset} (~$${value.toFixed(2)}) at Market...`);
                const order = await exchange.createOrder({
                    symbol,
                    side: 'sell',
                    type: 'market',
                    amount: b.free
                });
                console.log(`  -> ${order.status}, Filled: ${order.filled}`);
            }
        } catch (e: any) {
            console.log(`  -> Skip ${b.asset}: ${e.message?.substring(0, 80)}`);
        }
    }

    // 4. Final balances
    console.log('\n--- FINAL BALANCES ---');
    const final = await exchange.getBalance();
    for (const b of final) {
        if (b.total > 0) console.log(`  ${b.asset}: Free=${b.free}, Locked=${b.locked}, Total=${b.total}`);
    }
    console.log('\n=== DONE ===');
}

cancelAndSell().catch(e => console.error('Error:', e));
