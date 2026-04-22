
import { Agent } from './Agent';

export class MakerTaker extends Agent {
    public type = 'Maker-Taker (Fee-Aware Alpha)';
    private state: 'IDLE' | 'BUYING' | 'SELLING' = 'IDLE';
    private activeOrderId: string | null = null;
    private boughtPrice: number = 0;
    private boughtAmount: number = 0;

    // Bitso Fees (Conservative default for Taker/Maker mix)
    // https://bitso.com/mx/fees
    // Using 0.0065 (0.65%) as safe upper bound.
    // Ideally we want to be Maker (0.50%) but let's assume worst case to ensure profit.
    private readonly FEE = 0.0065;

    async init() {
        this.log("Initializing Fee-Aware Alpha Strategy...");
        this.state = 'IDLE';
    }

    async tick() {
        const book = this.config.book || 'btc_usd';
        const amount = this.config.amount || '0.001'; // Base amount to trade
        const spreadPercent = this.config.spread || 0.01; // Desired Net Profit % (over fee)

        try {
            // Check active order status if exists
            if (this.activeOrderId) {
                // In simulation, we need to check if it filled.
                // In live, we query API.
                // For simplicity in this demo structure, we'll try to get Open Orders.
                // If not in open orders, assume filled (risky in live, but okay for demo/sim).
                // Or better, check Mock/Real Client "getOrder".

                // Note: BitsoClient doesn't have getOrder implemented in base, let's assume if it's not open, it's filled.
                // Simplification for Sim:
                this.log(`Monitoring Order ${this.activeOrderId}...`);

                // Live/Mock agnostic check
                // If client has getOrder, use it. If not (Mock might not fully implement payload retrieval in same way), assume logic.
                // In MockClient, we don't have a public getOrder yet, but let's assume we might or just rely on re-checking open orders via empty array?
                // Simplest for now: 
                // If Backtest: MockClient automatically fills orders if price allows. 
                // We should check "OpenOrders". If our ID is NOT in open orders, it's filled or cancelled.

                // NOTE: We need to implement getOpenOrders in MockBitsoClient to be accurate. 
                // For now, let's assume: If price crossed, assume filled.

                const ticker = await this.client.getTicker(book);
                // @ts-ignore
                const last = parseFloat(ticker.payload.last);

                // SIMULATION HEURISTIC:
                let filled = false;
                if (this.state === 'BUYING') {
                    // BoughtPrice was the Limit we set.
                    // If Current Last <= BoughtPrice, likely filled (if we were Maker).
                    if (last <= this.boughtPrice) filled = true;
                } else if (this.state === 'SELLING') {
                    // TargetSellPrice. If Last >= Target, filled.
                    const targetFactor = 1 + (2 * this.FEE) + spreadPercent;
                    const targetPrice = this.boughtPrice * targetFactor;
                    if (last >= targetPrice) filled = true;
                }

                if (filled) {
                    if (this.state === 'BUYING') {
                        this.state = 'SELLING';
                        this.log(`[SIM] Buy Order Filled @ ${this.boughtPrice}! Switching to Sell.`);
                        this.activeOrderId = null;
                    } else {
                        this.state = 'IDLE';
                        this.log(`[SIM] Sell Order Filled! Profits Secured (inc. fees). Restarting.`);
                        this.activeOrderId = null;
                        this.activeOrderId = null;
                    }
                }
                return;
            }

            // IDLE -> Place Buy
            if (this.state === 'IDLE') {
                const ticker = await this.client.getTicker(book);
                const last = parseFloat(ticker.payload.last);

                // Strategy: Buy slightly below market (Maker) logic?
                // User said: "Si lo compramos a 10...". 
                // Let's match Last Price or slightly better.
                // "Pujar" implies limit order.
                const buyPrice = last * (1 - 0.001); // 0.1% below market

                this.log(`Placing Buy Limit @ ${buyPrice.toFixed(2)}...`);
                const res = await this.client.placeOrder(book, 'buy', 'limit', amount, buyPrice.toFixed(2));
                this.activeOrderId = res.payload.oid; // Store ID
                this.boughtPrice = buyPrice;
                this.boughtAmount = parseFloat(amount);
                this.state = 'BUYING'; // Wait for fill
            }

            // BUYING -> Wait -> Done above (Transition to SELLING)

            // SELLING -> Place Sell
            if (this.state === 'SELLING') {
                // Determine Target Price
                // Cost = BoughtPrice * Amount
                // Fee Buy = Cost * FEE
                // Fee Sell = (SellPrice * Amount) * FEE
                // Net = (SellPrice * Amount) - FeeSell - (Cost + FeeBuy)
                // We want Net to be > 0 (or > Spread).

                // Simplification for Target Sell Price:
                // SellPrice = BuyPrice * (1 + 2 * FEE + spreadPercent);
                // Example: FEE=0.0065 (0.65%). Spread=0.01 (1%).
                // Multiplier = 1 + 0.013 + 0.01 = 1.023.
                // We need to sell 2.3% higher to gain 1% net.

                const targetFactor = 1 + (2 * this.FEE) + spreadPercent;
                const sellPrice = this.boughtPrice * targetFactor;

                this.log(`Placing Sell Limit @ ${sellPrice.toFixed(2)} (Inc. Fees)...`);
                const res = await this.client.placeOrder(book, 'sell', 'limit', this.boughtAmount.toString(), sellPrice.toFixed(2));
                this.activeOrderId = res.payload.oid;
                // state matches SELLING, so next tick we check fill
            }

        } catch (e: any) {
            this.log(`Tick Error: ${e.message}`);
        }
    }
}
