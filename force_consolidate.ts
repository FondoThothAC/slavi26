import 'dotenv/config';
import { BinanceExchange } from './src/exchanges/BinanceExchange';

const exchange = new BinanceExchange(
    process.env.BINANCE_API_KEY || '',
    process.env.BINANCE_API_SECRET || ''
);

async function forceConsolidate() {
    console.log('=== FORCE CONSOLIDATION TO USDT ===\n');

    const balances = await exchange.getBalance();

    for (const b of balances) {
        if (b.asset === 'USDT' || b.asset === 'MXN') continue;
        if (b.free <= 0) continue;

        const symbol = `${b.asset}/USDT`;
        try {
            const ticker = await exchange.getTicker(symbol);
            const value = b.free * ticker.bid;
            console.log(`${b.asset}: ${b.free} (~$${value.toFixed(2)})`);

            if (value > 1) { // Sell anything worth > $1
                console.log(`  -> SELLING ${b.free} ${b.asset} at Market...`);
                const order = await exchange.createOrder({
                    symbol,
                    side: 'sell',
                    type: 'market',
                    amount: b.free
                });
                console.log(`  -> Result: ${order.status}, Filled: ${order.filled}`);
            } else {
                console.log(`  -> Too small to sell ($${value.toFixed(2)})`);
            }
        } catch (e: any) {
            console.log(`  -> Skip (${e.message?.substring(0, 60)})`);
        }
    }

    // Final balance check
    console.log('\n--- FINAL BALANCES ---');
    const final = await exchange.getBalance();
    for (const b of final) {
        if (b.total > 0) console.log(`  ${b.asset}: ${b.total}`);
    }
    console.log('\n=== DONE ===');
}

forceConsolidate().catch(e => console.error('Error:', e));
