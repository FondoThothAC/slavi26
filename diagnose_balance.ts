import 'dotenv/config';
import { BinanceExchange } from './src/exchanges/BinanceExchange';
import * as fs from 'fs';

const exchange = new BinanceExchange(
    process.env.BINANCE_API_KEY || '',
    process.env.BINANCE_API_SECRET || ''
);

async function diagnose() {
    const lines: string[] = [];
    lines.push('=== DIAGNOSE BINANCE ACCOUNT ===');
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push('');

    const balances = await exchange.getBalance();
    let totalUSD = 0;

    lines.push('--- BALANCES ---');
    for (const b of balances) {
        if (b.total <= 0) continue;
        let usdVal = 0;
        if (b.asset === 'USDT') {
            usdVal = b.total;
        } else {
            try {
                const ticker = await exchange.getTicker(`${b.asset}/USDT`);
                usdVal = b.total * ticker.last;
            } catch (e) {
                // no pair
            }
        }
        totalUSD += usdVal;
        lines.push(`  ${b.asset}: free=${b.free} locked=${b.locked} total=${b.total} ~$${usdVal.toFixed(2)}`);
    }
    lines.push(`\n  TOTAL: $${totalUSD.toFixed(2)}`);

    lines.push('\n--- OPEN ORDERS ---');
    const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT', 'USDC/USDT', 'BTC/USDC', 'FDUSD/USDT'];
    let hasOrders = false;
    for (const pair of pairs) {
        try {
            const orders = await exchange.getOpenOrders(pair);
            for (const o of orders) {
                hasOrders = true;
                const age = Math.floor((Date.now() - o.createdAt.getTime()) / 60000);
                lines.push(`  ${pair}: ID=${o.id} ${o.side} ${o.amount}@${o.price} age=${age}m`);
            }
        } catch (e) { /* skip */ }
    }
    if (!hasOrders) lines.push('  (none)');

    // Check recent trades from log
    lines.push('\n--- RECENT LOG ENTRIES ---');
    try {
        const log = fs.readFileSync('logs/bot.log', 'utf-8');
        const logLines = log.split('\n').filter(l => l.trim());
        const last50 = logLines.slice(-50);
        for (const l of last50) {
            lines.push(`  ${l.substring(0, 120)}`);
        }
    } catch (e) {
        lines.push('  (could not read log)');
    }

    const output = lines.join('\n');
    fs.writeFileSync('diagnosis_result.txt', output);
    console.log(output);
    console.log('\nWritten to diagnosis_result.txt');
}

diagnose().catch(e => console.error('Error:', e));
