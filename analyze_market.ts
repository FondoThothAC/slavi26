
import { BitsoExchange } from './src/exchanges/BitsoExchange';

// Mock config or hardcode keys (public data doesn't strictly need keys but BitsoExchange class is set up with them)
// We will use empty keys since ticker/orderbook are public endpoints usually, but our class might require them in constructor.
// If BitsoExchange requires auth headers for getTicker, we will use the .env ones. 
// However, our class might fail without keys if it tries to sign.
// Checking BitsoExchange.ts: getTicker uses fetch from baseUrl + /ticker/?book=...
// And it doesn't call getAuthHeaders for getTicker? 
// Wait, BitsoExchange.ts: 
// async getTicker... 
// const response = await fetch(`${this.baseUrl}/ticker/?book=${formattedSymbol}`);
// No headers passed. So public access is fine.

declare var console: any;

async function analyze() {
    console.log("Fetching market data from Bitso...");
    const bitso = new BitsoExchange('', '');

    // List of popular pairs on Bitso
    const pairs = [
        'btc_mxn', 'eth_mxn', 'xrp_mxn', 'usd_mxn',
        'btc_usd', 'eth_usd', 'xrp_usd',
        'tusd_mxn', 'mana_mxn', 'matic_mxn'
    ];

    console.log("Pair\t\tPrice\t\tVolume (24h)\tSpread");
    console.log("-------------------------------------------------------------");

    for (const pair of pairs) {
        try {
            const ticker = await bitso.getTicker(pair);
            const spread = ((ticker.ask - ticker.bid) / ticker.bid * 100).toFixed(4);
            // Volume is usually in base currency.
            // Let's normalize to approximate USD or MXN volume if possible, or just print raw.
            console.log(`${pair.toUpperCase()}\t\t${ticker.last}\t\t${ticker.volume24h.toFixed(2)}\t\t${spread}%`);
        } catch (e: any) {
            console.log(`${pair}: Error - ${e.message}`);
        }
    }
}

analyze();
