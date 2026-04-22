import { Exchange, Ticker, OrderBook, Candle, OrderRequest, Order, Balance, Portfolio } from './Exchange';

declare var require: any;
declare var fetch: any;
declare var console: any;
const crypto = require('crypto');

/**
 * Bitso Exchange Integration.
 * Mexican crypto exchange (The Fiat Ramp).
 */
export class BitsoExchange implements Exchange {
    name = 'Bitso';
    type: 'crypto' | 'stocks' = 'crypto';

    private apiKey: string;
    private apiSecret: string;
    private baseUrl = 'https://api.bitso.com/v3';

    constructor(apiKey: string, apiSecret: string) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
    }

    private getAuthHeaders(method: string, path: string, body: string = '') {
        const nonce = new Date().getTime();
        const message = `${nonce}${method}/v3${path}${body}`;
        const signature = crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');

        const validParams = {
            nonce,
            method,
            path,
            keysLength: this.apiSecret.length
        };
        console.log('[DEBUG] Bitso Auth Params:', JSON.stringify(validParams));

        return {
            'Authorization': `Bitso ${this.apiKey}:${nonce}:${signature}`,
            'Content-Type': 'application/json'
        };
    }

    async getTicker(symbol: string): Promise<Ticker> {
        // Bitso uses '_' separator (e.g. btc_mxn)
        const formattedSymbol = symbol.toLowerCase().replace('/', '_');
        const response = await fetch(`${this.baseUrl}/ticker/?book=${formattedSymbol}`);
        const json = await response.json();

        if (!json.success) throw new Error(`Bitso API Error: ${json.error.message}`);

        const payload = json.payload;
        return {
            symbol: symbol,
            bid: parseFloat(payload.bid),
            ask: parseFloat(payload.ask),
            last: parseFloat(payload.last),
            volume24h: parseFloat(payload.volume),
            change24h: 0, // Bitso doesn't strictly give 24h change % in this endpoint
            timestamp: new Date(payload.created_at).getTime(),
        };
    }

    async getOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
        const formattedSymbol = symbol.toLowerCase().replace('/', '_');
        const response = await fetch(`${this.baseUrl}/order_book/?book=${formattedSymbol}`);
        const json = await response.json();

        if (!json.success) throw new Error(`Bitso API Error: ${json.error.message}`);

        return {
            bids: json.payload.bids.slice(0, depth).map((b: any) => [parseFloat(b.price), parseFloat(b.amount)]),
            asks: json.payload.asks.slice(0, depth).map((a: any) => [parseFloat(a.price), parseFloat(a.amount)]),
            timestamp: Date.now(),
        };
    }

    async getCandles(symbol: string, interval: string, limit = 100): Promise<Candle[]> {
        // Bitso doesn't have a standard OHLCV public endpoint in v3 compatible with typical timeframes easily
        // Placeholder implementation
        return [];
    }

    async createOrder(order: OrderRequest): Promise<Order> {
        const path = '/orders/';
        const body = JSON.stringify({
            book: order.symbol.toLowerCase().replace('/', '_'),
            side: order.side,
            type: order.type,
            major: order.amount.toFixed(8),
            price: order.price?.toFixed(2)
        });

        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: this.getAuthHeaders('POST', path, body),
            body: body
        });

        const json = await response.json();
        if (!json.success) throw new Error(`Bitso Order Error: ${json.error.message}`);

        return {
            id: json.payload.oid,
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            status: 'open',
            amount: order.amount,
            filled: 0,
            price: order.price || 0,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    }

    async getBalance(): Promise<Balance[]> {
        const path = '/balance/';
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: this.getAuthHeaders('GET', path)
        });

        const json = await response.json();
        if (!json.success) throw new Error(`Bitso Balance Error: ${json.error.message}`);

        return json.payload.balances.map((b: any) => ({
            asset: b.currency.toUpperCase(),
            free: parseFloat(b.available),
            locked: parseFloat(b.locked),
            total: parseFloat(b.total)
        }));
    }

    async cancelOrder(orderId: string, symbol?: string): Promise<boolean> {
        const path = `/orders/${orderId}/`;
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders('DELETE', path)
        });

        const json = await response.json();
        return json.success;
    }

    async getOrder(orderId: string, symbol?: string): Promise<Order> {
        // Bitso generally returns arrays of orders, but let's implement the specific endpoint
        // GET /orders/<oid>/
        const path = `/orders/${orderId}/`;
        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: this.getAuthHeaders('GET', path)
        });
        const json = await response.json();
        if (!json.success) throw new Error(`Bitso Error: ${json.error.message}`);

        const payload = json.payload[0]; // Bitso returns array even for single ID usually
        return this.mapBitsoOrder(payload);
    }

    async getOpenOrders(symbol?: string): Promise<Order[]> {
        let path = '/open_orders/';
        if (symbol) {
            path += `?book=${symbol.toLowerCase().replace('/', '_')}`;
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method: 'GET',
            headers: this.getAuthHeaders('GET', path)
        });

        const json = await response.json();
        if (!json.success) throw new Error(`Bitso Error: ${json.error.message}`);

        return json.payload.map((o: any) => this.mapBitsoOrder(o));
    }

    private mapBitsoOrder(o: any): Order {
        return {
            id: o.oid,
            symbol: o.book.replace('_', '/').toUpperCase(),
            side: o.side,
            type: o.type,
            status: o.status === 'open' ? 'open' : (o.status === 'completed' ? 'filled' : 'cancelled'),
            amount: parseFloat(o.original_amount),
            filled: parseFloat(o.original_amount) - parseFloat(o.unfilled_amount),
            price: parseFloat(o.price || 0),
            createdAt: new Date(o.created_at),
            updatedAt: new Date(o.updated_at || new Date())
        };
    }

    async getPortfolio(): Promise<Portfolio> {
        const balances = await this.getBalance();
        // Calculate approx value in USD (simplified)
        let totalVal = 0;
        // This is a rough estimation needing ticker prices, for now we return balances structure
        // A real production bot would fetch all tickers to calculate totalVal.
        return {
            totalValue: totalVal,
            totalPnL: 0,
            totalPnLPercent: 0,
            positions: []
        };
    }
}

