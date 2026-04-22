
import { BinanceExchange } from './src/exchanges/BinanceExchange';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.BINANCE_API_KEY || '';
const secret = process.env.BINANCE_SECRET || '';

console.log(`Checking Binance balances...`);

async function check() {
    try {
        const binance = new BinanceExchange(key, secret);
        // BinanceExchange class might need getBalance implementation if it's not fully standard or if I need to call the API directly.
        // Let's assume getBalance works or inspect the file first? 
        // I'll inspect BinanceExchange.ts first to be sure, but writing this script tentatively.
        // Actually, to be safe, I'll just use the class methods.
        const balances = await binance.getBalance();

        console.log("\n--- Active Binance Balances ---");
        const active = balances.filter(b => b.total > 0);

        if (active.length === 0) {
            console.log("No balances found > 0.");
        } else {
            active.forEach(b => {
                console.log(`${b.asset}: Available=${b.free} Locked=${b.locked} Total=${b.total}`);
            });
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

check();
