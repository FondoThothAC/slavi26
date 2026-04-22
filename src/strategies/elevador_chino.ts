
import { Agent, AgentStatus } from './Agent';

export class ElevadorChino extends Agent {
    public type = 'Elevador Chino (Grid)';

    async init() {
        this.log(`Initializing Grid for ${this.config.book}...`);

        // Use config levels or default
        // @ts-ignore
        const levels = this.config.gridLevels || 5;
        // @ts-ignore
        const spread = this.config.spread || 0.005;

        const ticker = await this.client.getTicker(this.config.book);
        const centerPrice = parseFloat(ticker.payload.last);

        this.log(`Center: ${centerPrice} | Levels: ${levels}`);

        // Place Buys (Below)
        for (let i = 1; i <= levels; i++) {
            const buyPrice = (centerPrice * (1 - (spread * i))).toFixed(2);
            try {
                await this.client.placeOrder(this.config.book, 'buy', 'limit', this.config.amount, buyPrice);
            } catch (e) { }
        }

        // Place Sells (Above)
        for (let i = 1; i <= levels; i++) {
            const sellPrice = (centerPrice * (1 + (spread * i))).toFixed(2);
            try {
                await this.client.placeOrder(this.config.book, 'sell', 'limit', this.config.amount, sellPrice);
            } catch (e) { }
        }

        this.log('Grid Initialized.');
    }

    async tick() {
        // Monitor Logic
        // In a real grid, we check if orders are occupied.
        // For simulation/demo: Just log heartbeat or checking logic.
        // this.log('Monitor: Scanning grid status...');
    }
}
