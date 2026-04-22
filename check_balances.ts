
import { BitsoExchange } from './src/exchanges/BitsoExchange';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.BITSO_API_KEY || '';
const secret = process.env.BITSO_API_SECRET || '';

console.log(`Checking balances with Key ending in ...${key.slice(-4)}`);

async function check() {
    try {
        const bitso = new BitsoExchange(key, secret);
        const balances = await bitso.getBalance();

        console.log("\n--- Active Balances ---");
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
