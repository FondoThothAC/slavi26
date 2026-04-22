
import 'dotenv/config';
import { BinanceExchange } from './src/exchanges/BinanceExchange';
import { MarketScanner } from './src/MarketScanner';

async function main() {
    const key = process.env.BINANCE_API_KEY || '';
    const secret = process.env.BINANCE_API_SECRET || '';

    if (!key) {
        console.error("No API Key found. Scanning public data anyway...");
    }

    const binance = new BinanceExchange(key, secret);
    const scanner = new MarketScanner(binance);

    console.log("🔍 Scanning for Top 5 Trending Coins...");
    const topCoins = await scanner.findTrendingCoins(5);

    topCoins.forEach((c, i) => {
        console.log(`#${i + 1} [${c.symbol}] Price: ${c.price}, ${c.reason}`);
    });

    console.log("\n🔍 Checking for Triangular Arbitrage Loops (TODO)...");
}

main();
