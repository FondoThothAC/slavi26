
import { Agent, AgentStatus } from './Agent';

export class MakerMaker extends Agent {
    public type = 'Maker-Maker';

    async init() {
        this.log(`Initializing Maker-Maker Strategy for ${this.config.book}...`);
        // No special setup needed for MM
    }

    async tick() {
        // 1. Get current ticker
        const ticker = await this.client.getTicker(this.config.book);
        const currentPrice = parseFloat(ticker.payload.last);

        // 2. Calculate spread
        // @ts-ignore
        const spread = this.config.spread || 0.01; // 1% default
        const buyPrice = (currentPrice * (1 - spread)).toFixed(2);
        const sellPrice = (currentPrice * (1 + spread)).toFixed(2);

        // 3. Place Orders (Simultaneously Buy and Sell)
        // Check if we already have open orders? For simple bot, just place new ones (and maybe cancel old ones in a real one)
        // To be safe in simple demo, we just place orders.

        this.log(`Tick: Price ${currentPrice} | Buy ${buyPrice} | Sell ${sellPrice}`);

        // Place Buy
        try {
            const buyResult = await this.client.placeOrder(this.config.book, 'buy', 'limit', this.config.amount, buyPrice);
            this.log(`Placed Buy: ${buyResult.payload.oid}`);
        } catch (e: any) { /* ignore for demo logs */ }

        // Place Sell
        try {
            const sellResult = await this.client.placeOrder(this.config.book, 'sell', 'limit', this.config.amount, sellPrice);
            this.log(`Placed Sell: ${sellResult.payload.oid}`);
        } catch (e: any) { /* ignore */ }
    }
}
