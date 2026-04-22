import { Exchange, Ticker, Order, OrderBook, Candle, Portfolio, OrderRequest, Balance } from '../exchanges/Exchange';
import { Strategy, Signal } from './StrategyEngine';

/**
 * Mock Exchange for Backtesting.
 * Simulates order execution against historical data.
 */
export class MockExchange implements Exchange {
    name = 'Backtest Exchange';
    type: 'crypto' | 'stocks' = 'crypto';

    // Store historical data: symbol -> timestamps -> Price
    private history: Map<string, { timestamp: number, price: number }[]> = new Map();
    private currentTickIndex = 0;

    // Simulated state
    private orders: Order[] = [];
    private balances: Map<string, number> = new Map();

    constructor(initialBalances: { [symbol: string]: number }) {
        for (const sym in initialBalances) {
            if (Object.prototype.hasOwnProperty.call(initialBalances, sym)) {
                this.balances.set(sym, initialBalances[sym] as number);
            }
        }
    }

    // Load CSV/JSON data into memory
    loadData(symbol: string, data: { timestamp: number, price: number }[]) {
        this.history.set(symbol, data);
    }

    // Move time forward
    nextTick() {
        this.currentTickIndex++;
    }

    getCurrentPrice(symbol: string): number {
        const data = this.history.get(symbol);
        if (!data) return 0;
        const tick = data[this.currentTickIndex];
        if (!tick) return 0;
        return tick.price;
    }

    async getTicker(symbol: string): Promise<Ticker> {
        const price = this.getCurrentPrice(symbol);
        return {
            symbol,
            bid: price, // For simplicity in mock, bid=ask=last
            ask: price,
            last: price,
            volume24h: 1000000,
            change24h: 0,
            timestamp: Date.now()
            // In a real backtest, this timestamp should match the historical data tick
        };
    }

    async createOrder(req: OrderRequest): Promise<Order> {
        const price = req.type === 'limit' && req.price ? req.price : this.getCurrentPrice(req.symbol);

        // Basic execution logic
        // 1. Check Balance
        // 2. Deduct Balance
        // 3. Add Activity

        // Simplified Execution for "Immediate Fill" simulation (Market)
        if (req.type === 'market') {
            this.executeTrade(req.symbol, req.side, req.amount, price);
            return {
                id: `ord_${Date.now()}_${Math.random()}`,
                symbol: req.symbol,
                side: req.side,
                type: req.type,
                status: 'filled',
                amount: req.amount,
                filled: req.amount,
                price: price,
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }

        // Limit orders just stored (would need logic to check if hit later)
        return {
            id: `ord_limit_${Date.now()}`,
            symbol: req.symbol,
            side: req.side,
            type: req.type,
            status: 'open',
            amount: req.amount,
            filled: 0,
            price: price,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    private executeTrade(symbol: string, side: 'buy' | 'sell', amount: number, price: number) {
        // Assume symbol is BASE/QUOTE (e.g. BTC/USDT)
        const parts = symbol.split('/');
        const base = parts[0];
        const quote = parts[1];

        if (!base || !quote) return;

        const cost = amount * price;
        const fee = cost * 0.001; // 0.1% simulated fee

        if (side === 'buy') {
            // Check Quote Balance
            const quoteBal = this.balances.get(quote) || 0;
            if (quoteBal >= cost) {
                this.balances.set(quote, quoteBal - cost);
                this.balances.set(base, (this.balances.get(base) || 0) + amount * 0.999); // Fee deducted from asset
            }
        } else {
            const baseBal = this.balances.get(base) || 0;
            if (baseBal >= amount) {
                this.balances.set(base, baseBal - amount);
                this.balances.set(quote, (this.balances.get(quote) || 0) + (cost - fee)); // Fee deducted from proceeds
            }
        }
    }

    async getBalance(): Promise<Balance[]> {
        return Array.from(this.balances.entries()).map(([k, v]) => ({
            asset: k,
            free: v,
            locked: 0,
            total: v
        }));
    }

    async getPortfolio(): Promise<Portfolio> {
        // Calculate total value in USD/USDT
        // Simplified: assume USDT is stable 1.0, others mark-to-market
        let total = 0;
        for (const [sym, qty] of this.balances) {
            if (sym === 'USDT' || sym === 'USD') {
                total += qty;
            } else {
                // Try to find a price for SYM/USDT
                // This is tricky in generic mock without explicit map of all prices
                // Just ignored for simple signal backtest unless loaded
                const price = this.getCurrentPrice(`${sym}/USDT`) || 0;
                total += qty * price;
            }
        }
        return { totalValue: total, totalPnL: 0, totalPnLPercent: 0, positions: [] };
    }

    // Stubs
    async getOrderBook(s: string) { return { bids: [], asks: [], timestamp: 0 }; }
    async getCandles(s: string) { return []; }
    async cancelOrder(id: string) { return true; } // Added id param to match likely interface
    async getOrder(id: string): Promise<Order> { throw new Error('Not impl'); } // Added return type
    async getOpenOrders() { return []; }

    // Helper to inspect
    getBalances() { return this.balances; }
}

export class BacktestSimulator {
    constructor(
        private strategy: Strategy,
        private exchange: MockExchange,
        private symbols: string[]
    ) { }

    async run(ticks: number) {
        const results = [];

        for (let i = 0; i < ticks; i++) {
            // For each tick (time step)
            for (const symbol of this.symbols) {
                // 1. Analyze
                const signals = await this.strategy.analyze(this.exchange, symbol);

                // 2. Execute
                for (const signal of signals) {
                    if (signal.action !== 'hold') {
                        // Pass signal to execute
                        await this.strategy.execute(this.exchange, signal);
                        results.push({ tick: i, signal });
                    }
                }
            }

            // Move time
            this.exchange.nextTick();
        }

        return results;
    }
}
