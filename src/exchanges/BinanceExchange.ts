import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Exchange, Ticker, OrderBook, Candle, OrderRequest, Order, Balance, Portfolio } from './Exchange';

/**
 * Binance Exchange Integration (Spot API v3)
 * Fixed with Strict Declarations + Integrated WebSocket + Trailing Stop.
 */
export class BinanceExchange extends EventEmitter implements Exchange {
    // 🔥 MANDATORY DECLARATIONS (TypeScript Strict Fix)
    public name = 'Binance';
    public type: 'crypto' | 'stocks' = 'crypto';

    private apiKey: string;
    private apiSecret: string;
    private baseUrl: string;
    private wsUrl: string;
    private recvWindow: number;
    private minRequestInterval: number;

    // Internal State
    private lastRequestTime: number = 0;
    private timeOffset: number = 0;
    private ws: WebSocket | null = null;
    private wsReconnectAttempts: number = 0;
    private readonly maxWsReconnect: number = 5;

    private priceCache: Map<string, { price: number; ts: number }> = new Map();

    // Trailing Stop config per symbol
    private trailingConfig: Map<string, {
        peak: number;
        trailPercent: number;
        lastCheck: number;
    }> = new Map();
    private priceHistory: Map<string, number[]> = new Map();

    constructor(apiKey: string, apiSecret: string, config?: {
        baseUrl?: string;
        wsUrl?: string;
        recvWindow?: number;
        throttleMs?: number;
    }) {
        super();
        
        // 🔥 VALIDACIÓN OBLIGATORIA
        if (!apiKey || !apiSecret) {
            throw new Error(
                '❌ Binance credentials missing!\n' +
                'Verifica tu archivo .env:\n' +
                '  BINANCE_API_KEY=tu_key\n' +
                '  BINANCE_SECRET=tu_secret'
            );
        }
        
        this.apiKey = apiKey.trim();
        this.apiSecret = apiSecret.trim();
        this.baseUrl = config?.baseUrl ?? 'https://api.binance.com/api/v3';
        this.wsUrl = config?.wsUrl ?? 'wss://stream.binance.com:9443';
        this.recvWindow = config?.recvWindow ?? 10000;
        this.minRequestInterval = config?.throttleMs ?? 50;

        this.syncTime(); // Sync clock in background
    }

    // --- Core Logic (Throttling & Signing) ---

    private async throttle(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.minRequestInterval) {
            await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - elapsed));
        }
        this.lastRequestTime = Date.now();
    }

    private getSignature(queryString: string): string {
        return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
    }

    private async syncTime() {
        try {
            const res: any = await (await fetch(`${this.baseUrl}/time`)).json();
            this.timeOffset = res.serverTime - Date.now();
            console.log(`[Binance] Time Synced. Offset: ${this.timeOffset}ms`);
        } catch (e) {
            console.error(`[Binance] Time Sync Failed`);
        }
    }

    // --- API Request Helpers ---

    private async signedRequest(endpoint: string, method: string, params: Record<string, any> = {}) {
        await this.throttle();
        const timestamp = Date.now() + this.timeOffset - 1000;
        const allParams = { recvWindow: this.recvWindow, ...params, timestamp };

        const queryString = Object.keys(allParams)
            .map(k => `${k}=${encodeURIComponent((allParams as any)[k])}`)
            .join('&');

        const signature = this.getSignature(queryString);
        const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

        const res = await fetch(url, {
            method: method,
            headers: { 'X-MBX-APIKEY': this.apiKey }
        });

        const json: any = await res.json();
        if (!res.ok) throw new Error(`Binance API Error: ${JSON.stringify(json)}`);
        return json;
    }

    // --- Interface Exchange Implementation ---

    async getTicker(symbol: string): Promise<Ticker> {
        const formatted = symbol.replace('/', '').toUpperCase();
        const url = `${this.baseUrl}/ticker/24hr?symbol=${formatted}`;
        const res = await (await fetch(url)).json() as any;

        return {
            symbol,
            bid: parseFloat(res.bidPrice),
            ask: parseFloat(res.askPrice),
            last: parseFloat(res.lastPrice),
            volume24h: parseFloat(res.quoteVolume),
            change24h: parseFloat(res.priceChangePercent),
            timestamp: res.closeTime
        };
    }

    async getAllTickers(): Promise<Ticker[]> {
        const url = `${this.baseUrl}/ticker/24hr`;
        const res = await (await fetch(url)).json() as any[];
        return res.map(t => ({
            symbol: t.symbol,
            bid: parseFloat(t.bidPrice),
            ask: parseFloat(t.askPrice),
            last: parseFloat(t.lastPrice),
            volume24h: parseFloat(t.quoteVolume),
            change24h: parseFloat(t.priceChangePercent),
            timestamp: t.closeTime
        }));
    }

    async getMyTrades(symbol: string, limit: number = 20): Promise<any[]> {
        const formatted = symbol.replace('/', '').toUpperCase();
        return this.signedRequest('/myTrades', 'GET', { symbol: formatted, limit });
    }

    async getBalance(): Promise<Balance[]> {
        const data = await this.signedRequest('/account', 'GET');
        return data.balances
            .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
            .map((b: any) => ({
                asset: b.asset,
                free: parseFloat(b.free),
                locked: parseFloat(b.locked),
                total: parseFloat(b.free) + parseFloat(b.locked)
            }));
    }

    async createOrder(order: OrderRequest): Promise<Order> {
        // 🔥 NORMALIZACIÓN TOTAL (Evitar -1121)
        const symbol = order.symbol.trim().toUpperCase().replace('/', '').replace(/\s+/g, '');
        const params: any = {
            symbol,
            side: order.side.toUpperCase(),
            type: order.type.toUpperCase()
        };

        if (order.type === 'market') {
            if (order.side === 'buy') {
                // For BUY MARKET, we use quoteOrderQty (how much BNB to spend)
                // We use the raw amount if it's small (assumed BNB), otherwise we might need to recalculate
                // Special case: if amount > 1 and quote is BNB, it's likely a miscalculation of Base units.
                // But generally, the bot now sends BNB amount here.
                params.quoteOrderQty = order.amount.toFixed(8);
            } else {
                // For SELL MARKET, we use quantity (how many coins to sell)
                params.quantity = this.formatQuantity(order.symbol, order.amount);
            }
        } else {
            params.quantity = this.formatQuantity(order.symbol, order.amount);
            params.price = order.price?.toFixed(8);
            params.timeInForce = 'GTC';
        }

        console.log(`[DEBUG] Binance Order: ${params.side} ${params.type} ${params.symbol} | Qty/Quote: ${params.quantity || params.quoteOrderQty} | Price: ${params.price || 'MKT'}`);

        const res = await this.signedRequest('/order', 'POST', params);

        return {
            id: res.orderId.toString(),
            symbol: order.symbol,
            side: order.side,
            type: order.type,
            status: res.status === 'FILLED' ? 'filled' : 'open',
            amount: parseFloat(res.origQty || res.executedQty),
            filled: parseFloat(res.executedQty),
            price: parseFloat(res.price || res.fills?.[0]?.price || 0),
            createdAt: new Date(res.transactTime),
            updatedAt: new Date(res.transactTime)
        };
    }

    // --- WebSocket & Trailing Logic ---

    public connectWebSocket(symbols: string[]): void {
        const streams = symbols.map(s => `${s.replace('/', '').toLowerCase()}@ticker`).join('/');
        const url = `${this.wsUrl}/stream?streams=${streams}`;

        this.ws = new WebSocket(url);
        this.ws.on('open', () => {
            console.log('✅ [Binance WS] Connected');
            this.wsReconnectAttempts = 0;
            this.emit('connected');
        });
        this.ws.on('message', (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                const d = parsed.data;
                if (d?.s && d?.c) {
                    const symbol = `${d.s.slice(0, -3)}/BNB`;
                    const price = parseFloat(d.c);
                    this.priceCache.set(symbol, { price, ts: Date.now() });
                    this.evaluateTrailingStop(symbol, price);
                    this.emit('ticker', { symbol, price });
                }
            } catch (e) {
                // Ignore parse errors
            }
        });
        this.ws.on('error', (err) => {
            console.error('[WS] Error:', err.message);
            this.attemptReconnect(symbols);
        });
        this.ws.on('close', () => {
            this.attemptReconnect(symbols);
        });
    }

    private attemptReconnect(symbols: string[]): void {
        if (this.wsReconnectAttempts < this.maxWsReconnect) {
            const delay = 1000 * Math.pow(2, this.wsReconnectAttempts++);
            console.log(`[WS] Reconnecting in ${delay}ms...`);
            setTimeout(() => this.connectWebSocket(symbols), delay);
        }
    }

    private evaluateTrailingStop(symbol: string, currentPrice: number) {
        // Track history for dashboard
        if (!this.priceHistory.has(symbol)) this.priceHistory.set(symbol, []);
        const history = this.priceHistory.get(symbol)!;
        history.push(currentPrice);
        if (history.length > 500) history.shift();

        const config = this.trailingConfig.get(symbol);
        if (!config) return;
        if (currentPrice > config.peak) config.peak = currentPrice;
        if (currentPrice <= config.peak * (1 - config.trailPercent)) {
            console.log(`🎯 [Trail] ${symbol} hit @ ${currentPrice} (peak: ${config.peak})`);
            this.emit('trailingStopHit', { symbol, price: currentPrice, peak: config.peak });
            this.trailingConfig.delete(symbol);
        }
    }

    public registerPosition(symbol: string, entryPrice: number, trailPercent = 0.002) {
        this.trailingConfig.set(symbol, { peak: entryPrice, trailPercent, lastCheck: Date.now() });
        console.log(`[Trail] Registered ${symbol} @ ${entryPrice} | Trail: ${(trailPercent * 100).toFixed(2)}%`);
    }

    // --- Helpers ---
    private formatQuantity(symbol: string, amount: number): string {
        const factor = symbol.includes('BTC') ? 100000 : 100;
        return (Math.floor(amount * factor) / factor).toFixed(symbol.includes('BTC') ? 5 : 2);
    }

    // Required by Interface
    async getOrderBook(): Promise<OrderBook> { return { bids: [], asks: [], timestamp: Date.now() }; }
    async getCandles(): Promise<Candle[]> { return []; }
    async cancelOrder(id: string, s?: string): Promise<boolean> { return true; }
    async getOrder(id: string, s?: string): Promise<Order> { throw new Error("Not implemented"); }
    async getOpenOrders(symbol?: string): Promise<Order[]> { return []; }
    async getPortfolio(): Promise<Portfolio> { return { totalValue: 0, totalPnL: 0, totalPnLPercent: 0, positions: [] }; }

    public getCachedPrice(symbol: string): number | null {
        const cached = this.priceCache.get(symbol);
        if (!cached || Date.now() - cached.ts > 10000) return null;
        return cached.price;
    }

    public disconnectWebSocket(): void {
        this.ws?.terminate();
        this.ws = null;
    }

    /**
     * pruneCaches: Prevents memory leaks by clearing old price history
     */
    public pruneCaches() {
        let pruned = 0;
        for (const [symbol, history] of this.priceHistory.entries()) {
            if (history.length > 300) {
                this.priceHistory.set(symbol, history.slice(-300));
                pruned++;
            }
        }
        if (pruned > 0) {
            console.log(`[Binance] Pruned price history for ${pruned} symbols.`);
        }

        // Also prune priceCache (Throttle cache)
        const now = Date.now();
        for (const [symbol, data] of this.priceCache.entries()) {
            if (now - data.ts > 60000) {
                this.priceCache.delete(symbol);
            }
        }
    }
}
