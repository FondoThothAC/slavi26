
import { BitsoClient } from '../api';

export class MockBitsoClient extends BitsoClient {
    // @ts-ignore
    private currentCandle: any;
    private currentCandles: Map<string, any> = new Map(); // State for multiple books
    private orders: any[] = [];
    private balance: { [currency: string]: number } = { 'mxn': 200000, 'usd': 10000, 'btc': 1.0 };
    private trades: any[] = [];

    // Override constructor to avoid needing keys
    constructor() {
        super();
        console.log("Mock Bitso Client Initialized");
    }

    public setStartBalance(amount: number) {
        // Reset state
        this.balance = { 'mxn': 0, 'usd': amount, 'btc': 0 };
        this.orders = [];
        this.trades = [];
    }

    // Set the current market state for the simulation tick
    public setCurrentCandle(candle: any, book: string = 'btc_usd') {
        this.currentCandle = candle; // Deprecated single book fallback
        this.currentCandles.set(book, candle);
        this.processOrders(book); // Check orders for THIS book
    }

    private processOrders(book: string) {
        const candle = this.currentCandles.get(book);
        if (!candle) return;

        const high = parseFloat(candle.high);
        const low = parseFloat(candle.low);
        const close = parseFloat(candle.close);

        this.orders.forEach(order => {
            if (order.status !== 'open') return;
            if (order.book !== book) return; // Only check orders for this book

            let filled = false;
            const price = parseFloat(order.price || '0');

            if (order.type === 'market') {
                filled = true;
                order.fillPrice = close;
            } else if (order.side === 'buy' && low <= price) {
                filled = true;
                order.fillPrice = price; // Limit fill
            } else if (order.side === 'sell' && high >= price) {
                filled = true;
                order.fillPrice = price;
            }

            if (filled) {
                order.status = 'filled';
                this.updateBalance(order);
                this.trades.push(order);
            }
        });
    }

    private updateBalance(order: any) {
        // Heuristic: If book contains 'mxn', use mxn. If 'usd', use usd.
        const currency = order.book.includes('mxn') ? 'mxn' : 'usd';

        const cost = parseFloat(order.amount) * order.fillPrice;
        if (order.side === 'buy') {
            this.balance[currency] = (this.balance[currency] || 0) - cost;
            this.balance['btc'] = (this.balance['btc'] || 0) + parseFloat(order.amount);
        } else {
            this.balance['btc'] = (this.balance['btc'] || 0) - parseFloat(order.amount);
            this.balance[currency] = (this.balance[currency] || 0) + cost;
        }
    }

    async getTicker(book: string) {
        let candle = this.currentCandles.get(book);

        // If we don't have this book loaded in simulation, fallback to currentCandle or synthesize?
        // In BacktestEngine we preload specific books. If agent asks for X and we only have Y, fail or mock.
        if (!candle && this.currentCandle) candle = this.currentCandle; // Fallback

        if (!candle) {
            // Mock data just to prevent crash if book not found
            candle = { close: 100, high: 100, low: 100, volume: 1000, vwap: 100 };
        }

        return {
            payload: {
                last: candle.close,
                high: candle.high,
                low: candle.low,
                bid: candle.close, // simplified
                ask: candle.close, // simplified
                volume: candle.volume,
                vwap: candle.vwap,
                created_at: new Date().toISOString(),
                book
            }
        };
    }

    async placeOrder(book: string, side: 'buy' | 'sell', type: 'limit' | 'market', amount: string, price: string | null = null) {
        const oid = 'mock-' + Math.random().toString(36).substr(2, 9);
        const order = {
            oid,
            book,
            side,
            type,
            amount,
            price,
            status: 'open',
            created_at: new Date().toISOString()
        };
        this.orders.push(order);
        // console.log(`[Mock] Order Placed: ${side} ${amount} @ ${price || 'market'}`);
        return { payload: { oid } };
    }

    async cancelOrder(oid: string) {
        const order = this.orders.find(o => o.oid === oid);
        if (order) order.status = 'cancelled';
        return { payload: [oid] };
    }

    // Helper to get equity for stats
    public getEquity() {
        // Only valid if currentCandle is set
        const price = this.currentCandle ? parseFloat(this.currentCandle.close) : 0;
        // Equity = MXN + (BTC * Price)
        // If we trade BTC_USD, 'mxn' should be 'usd'. 
        // Let's check config? For now assuming mxn/usd slots.
        const fiat = (this.balance['mxn'] || 0) + (this.balance['usd'] || 0);
        return fiat + ((this.balance['btc'] || 0) * price);
    }

    public withdrawProfit(amount: number) {
        // Deduced from fiat balance (assuming we sold to realize profit)
        if (this.balance['usd']) this.balance['usd'] -= amount;
        else if (this.balance['mxn']) this.balance['mxn'] -= amount;
    }

    public getTrades() {
        return this.trades;
    }
}
