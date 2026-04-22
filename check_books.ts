
import { BitsoExchange } from './src/exchanges/BitsoExchange';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.BITSO_API_KEY || '';
const secret = process.env.BITSO_API_SECRET || '';

async function checkBooks() {
    try {
        const bitso = new BitsoExchange(key, secret);
        // BitsoExchange might not have a public getBooks method exposed, 
        // but let's try to fetch tickers or inspect the allowed pairs.
        // Actually, looking at BitsoExchange.ts is safer.
        // But assuming standard API:
        const response = await fetch('https://api.bitso.com/v3/available_books/');
        const data = await response.json() as any;

        if (data.success) {
            console.log("Bitso Books containing BNB:");
            const bnbBooks = data.payload.filter((b: any) => b.book.includes('bnb'));
            bnbBooks.forEach((b: any) => console.log(b.book));

            console.log("\nBitso Books containing USD:");
            const usdBooks = data.payload.filter((b: any) => b.book.includes('_usd'));
            usdBooks.forEach((b: any) => console.log(b.book));
        } else {
            console.error("Failed to fetch books");
        }
    } catch (e: any) {
        console.log(e.message);
    }
}

checkBooks();
