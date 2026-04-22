
import axios from 'axios';
import { MockBitsoClient } from './MockBitsoClient';
import { AgentController } from '../AgentController';
// We need to subclass AgentController or modify it to accept a custom client.
// Or just instantiate strategies manually here.

// Simple Backtest Runner
export class BacktestEngine {
    private client: MockBitsoClient;
    private agent: any; // The strategy instance
    private history: any[] = [];
    private results: any[] = [];
    private startBalance: number = 0;
    private securedProfit: number = 0;

    constructor() {
        this.client = new MockBitsoClient();
    }

    // Map<book, candles[]>
    private multiBookHistory: Map<string, any[]> = new Map();

    async fetchHistory(book: string, time_bucket: number, start: number, end: number) {
        // Bitso API for OHLC? 
        // Official: https://bitso.com/api_info?#ohlc
        // https://api.bitso.com/v3/ohlc/?book=btc_mxn&time_bucket=86400&start=...&end=...
        // Note: 1 year range might be too big for one call, might need pagination or smaller buckets.
        // For demo, let's try 1 call request.

        console.log(`Fetching history for ${book}...`);
        try {
            const url = `https://api.bitso.com/v3/ohlc/?book=${book}&time_bucket=${time_bucket}`;
            // start/end are not fully documented in public docs, often it's just 'limit' or simple ranges.
            // Let's assume just fetching recent creates enough data or use a known public source if fails.
            // Actually, let's allow it to fail and generate MOCK data if API fails (for robustness of demo).

            const response = await axios.get(url);
            if (response.data.success) {
                // OHLC data often comes latest first
                const candles = response.data.payload.sort((a: any, b: any) => a.bucket_start_time - b.bucket_start_time);
                this.multiBookHistory.set(book, candles);
                // For single book compatibility (deprecated usage refactor)
                if (this.history.length === 0) this.history = candles;
                console.log(`Loaded ${candles.length} candles for ${book}.`);
            }
        } catch (e) {
            console.warn(`Failed to fetch Bitso data for ${book}, generating Synthetic Data...`, e);
            this.generateSyntheticData(book, start, end, time_bucket);
        }

        // The original logic for `this.history.length === 0` is now handled within the try/catch for `multiBookHistory` and `this.history`
        // if (this.history.length === 0) this.generateSyntheticData(start, end, time_bucket);
    }

    generateSyntheticData(book: string, start: number, end: number, bucket: number) {
        // Generate a random walk
        let price = book.includes('btc') ? 96000 : (book.includes('eth') ? 3600 : 1); // rough defaults
        if (book === 'eth_btc') price = 0.038;

        const candles = [];
        let time = start;
        while (time < end) {
            const change = (Math.random() - 0.5) * (price * 0.05); // 5% vol
            const open = price;
            const close = price + change;
            const high = Math.max(open, close) * 1.01;
            const low = Math.min(open, close) * 0.99;

            candles.push({ bucket_start_time: time, open, close, high, low, volume: 1 });
            price = close;
            time += bucket * 1000; // ms
        }
        this.multiBookHistory.set(book, candles);
        if (this.history.length === 0) this.history = candles;
        console.log(`Generated ${candles.length} synthetic candles for ${book}.`);
    }

    async run(StrategyClass: any, config: any) {
        console.log("Starting Backtest...");
        // Instantiate Agent with Mock Client
        // We need to bypass the protected client in Agent? 
        // StrategyClass constructor takes (client, config)

        this.agent = new StrategyClass(this.client, config);

        // Reset Client Balance to Config Amount (e.g. 10 USD)
        // Parse config.amount.
        const startAmount = parseFloat(config.amount) || 10;
        this.client.setStartBalance(startAmount);

        // Init
        await this.agent.init();

        // Record Start
        // @ts-ignore
        this.startBalance = this.client.getEquity();

        // Loop Sync
        // We need to iterate over TIME, not just one book's candles. A master clock.
        // Get sorted timestamps from one of the books (Assuming all alignment is roughly same for daily)
        // If not aligned, we need to map by timestamp.

        const bookIterator = this.multiBookHistory.keys();
        const masterBook = bookIterator.next().value;
        if (!masterBook) {
            console.log("No data loaded.");
            return { trades: [], equityCurve: [], finalEquity: this.startBalance };
        }
        const masterCandles = this.multiBookHistory.get(masterBook) || [];

        for (const candle of masterCandles) {
            const time = candle.bucket_start_time;

            // Set current candle for ALL loaded books
            for (const [bk, candles] of this.multiBookHistory.entries()) {
                const c = candles.find((c: any) => c.bucket_start_time === time);
                if (c) this.client.setCurrentCandle(c, bk); // We need to update MockClient to accept book arg
            }

            // Tic Strategy
            await this.agent.tick();

            // Profit Logic: "Every $100 gain, exit (secure)"
            // Logic: If (CurrentEquity - StartBalance) >= 100
            // Secure 100. Reset base? Or just count it?
            // "Exit to dollar account and reinvest" -> Usually means compound, but user said "exit".
            // Let's assume we "bank" it.
            // Simplified: If profit > 100, we deduce 100 from "trading capital" and add to "secured".
            // But if we do that, the bot has less capital to trade? "Vuelve a invertir" usually means compound.

            // Interpretation:
            // "100 usd de ganancia ... se vuelve a invertir" -> COMPOUNDING?
            // "Exit se pase a una cuenta de dolares" -> WITHDRAW?

            // Let's implement a hybrid: Log the event, and maybe reset the "Profit Counter".

            const currentEquity = this.client.getEquity();
            const totalProfit = (currentEquity + this.securedProfit) - this.startBalance;
            const unsecuredProfit = currentEquity - this.startBalance; // Current open profit

            if (unsecuredProfit >= 100) {
                // Secure $100
                this.securedProfit += 100;
                this.client.withdrawProfit(100); // We need this method in Client
                console.log(`[Backtest] Secured $100 Profit! Total Secured: ${this.securedProfit}`);
            }

            // Record Stats
            this.results.push({
                time: candle.bucket_start_time,
                price: candle.close,
                equity: this.client.getEquity() + this.securedProfit // Total Wealth
            });
        }

        console.log("Backtest Complete.");
        return {
            trades: this.client.getTrades(),
            equityCurve: this.results,
            finalEquity: this.client.getEquity() + this.securedProfit
        };
    }
}
