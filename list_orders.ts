
import { BitsoExchange } from './src/exchanges/BitsoExchange';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.BITSO_API_KEY || '';
const secret = process.env.BITSO_API_SECRET || '';

async function listOrders() {
    console.log("Fetching active orders...");
    try {
        const bitso = new BitsoExchange(key, secret);
        const orders = await bitso.getOpenOrders('xrp_usd');

        if (orders.length === 0) {
            console.log("No active orders found.");
        } else {
            console.log(`Found ${orders.length} active orders:\n`);
            console.log("ID\t\tSide\tPrice\tAmount\tDate");
            console.log("------------------------------------------------");
            orders.forEach(o => {
                console.log(`${o.id.slice(0, 8)}...\t${o.side.toUpperCase()}\t$${o.price}\t${o.amount} XRP\t${o.createdAt.toLocaleTimeString()}`);
            });
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

listOrders();
