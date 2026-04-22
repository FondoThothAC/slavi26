// Trading Bot - Exchange Integrations
// Ubicación: Web/Bitso/src/exchanges/

/**
 * Interface común para todos los exchanges.
 */
export interface Exchange {
    name: string;
    type: 'crypto' | 'stocks';

    // Market Data
    getTicker(symbol: string): Promise<Ticker>;
    getOrderBook(symbol: string, depth?: number): Promise<OrderBook>;
    getCandles(symbol: string, interval: string, limit?: number): Promise<Candle[]>;

    // Trading
    createOrder(order: OrderRequest): Promise<Order>;
    cancelOrder(orderId: string, symbol?: string): Promise<boolean>;
    getOrder(orderId: string, symbol?: string): Promise<Order>;
    getOpenOrders(symbol?: string): Promise<Order[]>;

    // Account
    getBalance(): Promise<Balance[]>;
    getPortfolio(): Promise<Portfolio>;
}

export interface Ticker {
    symbol: string;
    bid: number;
    ask: number;
    last: number;
    volume24h: number;
    change24h: number;
    timestamp: number;
}

export interface OrderBook {
    bids: [number, number][]; // [price, amount]
    asks: [number, number][];
    timestamp: number;
}

export interface Candle {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface OrderRequest {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop';
    amount: number;
    price?: number;
    stopPrice?: number;
}

export interface Order {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit' | 'stop';
    status: 'pending' | 'open' | 'filled' | 'cancelled';
    amount: number;
    filled: number;
    price: number;
    avgPrice?: number;
    fee?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface Balance {
    asset: string;
    free: number;
    locked: number;
    total: number;
    usdValue?: number;
}

export interface Portfolio {
    totalValue: number;
    totalPnL: number;
    totalPnLPercent: number;
    positions: Position[];
}

export interface Position {
    symbol: string;
    amount: number;
    avgCost: number;
    currentPrice: number;
    value: number;
    pnl: number;
    pnlPercent: number;
}
