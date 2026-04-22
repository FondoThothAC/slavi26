
import { Agent } from './Agent';

export class TriangularArbitrage extends Agent {
    public type = 'Triangular Arbitrage (Multi-Pair)';
    private pairs: string[] = ['btc_usd', 'eth_btc', 'eth_usd']; // Default path: USD->BTC->ETH->USD
    // Cycle: Buy BTC with USD, Buy ETH with BTC, Sell ETH for USD.

    async init() {
        this.log(`Initializing Triangular Arbitrage for ${this.pairs.join(' -> ')}...`);
        // Config could allow overriding pairs
        if (this.config.pairs) this.pairs = this.config.pairs;
    }

    async tick() {
        // 1. Fetch Tickers for all 3 pairs
        // Note: Real arbitrage needs simultaneous order book snapshots.
        // For simulation/demo, getting tickers sequentially is acceptable approximation 
        // if market isn't moving microseconds fast (1 tick = 1 day/hour in sim).

        try {
            if (!this.pairs[0] || !this.pairs[1] || !this.pairs[2]) throw new Error("Invalid pairs config");

            const p1 = await this.client.getTicker(this.pairs[0]); // e.g. btc_usd
            const p2 = await this.client.getTicker(this.pairs[1]); // e.g. eth_btc
            const p3 = await this.client.getTicker(this.pairs[2]); // e.g. eth_usd

            // Prices
            // Assuming we are buying p1, buying p2, selling p3.
            // USD -> BTC (Ask P1)
            // BTC -> ETH (Ask P2)
            // ETH -> USD (Bid P3)

            // @ts-ignore
            const price1 = parseFloat(p1.payload.last); // Ask ideally
            // @ts-ignore
            const price2 = parseFloat(p2.payload.last); // Ask ideally
            // @ts-ignore
            const price3 = parseFloat(p3.payload.last); // Bid ideally

            // Calculation: 
            // Start 1 USD.
            // BTC = 1 / price1
            // ETH = BTC / price2 (Wait, eth_btc means price is in BTC. 1 ETH = x BTC. So to buy ETH with BTC, we pay Price2. BTC / Price2? No.)
            // Pair formats:
            // btc_usd: 1 BTC = x USD.  To Buy BTC: Start/x.
            // eth_btc: 1 ETH = x BTC.  To Buy ETH: Have BTC. AmountETH = AmountBTC / Price2.
            // eth_usd: 1 ETH = x USD.  To Sell ETH: AmountETH * Price3.

            const startUSD = 10;
            const btcAmount = startUSD / price1; // 10 / 96000 = 0.0001
            const ethAmount = btcAmount / price2; // 0.0001 / 0.038 = 0.002
            const endUSD = ethAmount * price3; // 0.002 * 3600 = 7.2

            const profit = endUSD - startUSD;
            const roi = (profit / startUSD) * 100;

            // Use user-defined 'spread' as Minimum Profit % (e.g., 1 = 1%)
            // If config.spread is 0.01 (1%), we expect roi > 1.
            // Note: UI default is 0.01. If user inputs "1", it usually means 1.
            // Let's assume input is raw number. If user types 0.01, it's 0.01%.
            // User probably means "Target Profit".
            const minProfitPercent = this.config.spread || 0.5; // Default 0.5% if missing

            this.log(`Cycle: ${this.pairs.join('->')} | ROI: ${roi.toFixed(4)}% | Result: $${endUSD.toFixed(2)}`);

            if (roi > minProfitPercent) {
                this.log(`PROFITABLE OPPORTUNITY (${roi.toFixed(2)}% > ${minProfitPercent}%)! Executing...`);
                // Execute Orders
                if (this.pairs[0]) await this.client.placeOrder(this.pairs[0], 'buy', 'market', startUSD.toString()); // Buy BTC
                if (this.pairs[1]) await this.client.placeOrder(this.pairs[1], 'buy', 'market', btcAmount.toFixed(8)); // Buy ETH with BTC
                if (this.pairs[2]) await this.client.placeOrder(this.pairs[2], 'sell', 'market', ethAmount.toFixed(8)); // Sell ETH for USD
            }

        } catch (e: any) {
            this.log(`Arb Check Failed: ${e.message}`);
        }
    }
}
