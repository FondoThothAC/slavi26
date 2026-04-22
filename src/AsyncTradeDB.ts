import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

export interface TradeRecord {
    id?: number;
    timestamp: string;
    exchange: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    price: number;
    amount: number;
    total: number;
    status: string;
    orderId: string;
}

export class AsyncTradeDB {
    private db: Database | null = null;
    private dbPath: string;
    private priceCache: Map<string, { price: number, expiry: number }> = new Map();

    constructor(dbPath: string = './data/trades.db') {
        this.dbPath = dbPath;
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    async init() {
        if (this.db) return;

        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });

        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                exchange TEXT NOT NULL,
                symbol TEXT NOT NULL,
                side TEXT CHECK(side IN ('BUY', 'SELL', 'buy', 'sell')),
                price REAL NOT NULL,
                amount REAL NOT NULL,
                total REAL NOT NULL,
                status TEXT,
                orderId TEXT
            )
        `);

        // Critical indexes for performance
        await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC)`);
        await this.db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)`);
        
        console.log(`[AsyncTradeDB] Connected to SQLite at ${this.dbPath}`);
    }

    async insertTrade(trade: TradeRecord): Promise<number> {
        if (!this.db) await this.init();
        
        const result = await this.db!.run(`
            INSERT INTO trades (timestamp, exchange, symbol, side, price, amount, total, status, orderId)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            trade.timestamp,
            trade.exchange,
            trade.symbol,
            trade.side.toUpperCase(),
            trade.price,
            trade.amount,
            trade.total,
            trade.status,
            trade.orderId
        ]);

        return result.lastID!;
    }

    async getRecentTrades(limit: number = 50): Promise<TradeRecord[]> {
        if (!this.db) await this.init();
        
        return await this.db!.all<TradeRecord[]>(
            `SELECT * FROM trades ORDER BY timestamp DESC LIMIT ?`,
            [limit]
        );
    }

    async *getAllBatches(batchSize: number = 50, offset: number = 0) {
        if (!this.db) await this.init();
        
        let currentOffset = offset;
        while (true) {
            const rows = await this.db!.all<TradeRecord[]>(
                `SELECT * FROM trades ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
                [batchSize, currentOffset]
            );
            
            if (rows.length === 0) break;
            yield rows;
            currentOffset += batchSize;
            // Yield control to event loop
            await new Promise(resolve => setImmediate(resolve));
        }
    }

    /**
     * Get Open Positions (Draft calculation)
     * Finds symbols where we have bought more than we have sold.
     */
    async getOpenPositions(): Promise<{ symbol: string; amount: number; avgPrice: number }[]> {
        if (!this.db) await this.init();

        const rows = await this.db!.all(`
            SELECT 
                symbol, 
                SUM(CASE WHEN side IN ('BUY', 'buy') THEN amount ELSE -amount END) as net_amount,
                AVG(CASE WHEN side IN ('BUY', 'buy') THEN price ELSE NULL END) as avg_buy_price
            FROM trades 
            GROUP BY symbol 
            HAVING net_amount > 0.00000001
        `);

        return rows.map(r => ({
            symbol: r.symbol,
            amount: r.net_amount,
            avgPrice: r.avg_buy_price || 0
        }));
    }

    async getStats() {
        if (!this.db) await this.init();
        
        const rows = await this.db!.get(`
            SELECT 
                COUNT(*) as count,
                SUM(CASE WHEN side IN ('BUY', 'buy') THEN total ELSE 0 END) as buys,
                SUM(CASE WHEN side IN ('SELL', 'sell') THEN total ELSE 0 END) as sells
            FROM trades
        `);

        const tradeCount = rows.count || 0;
        const totalBuys = rows.buys || 0;
        const totalSells = rows.sells || 0;
        const netProfit = totalSells - totalBuys;
        const profitPercent = totalBuys > 0 ? (netProfit / totalBuys) * 100 : 0;

        return {
            tradeCount,
            totalBuys: totalBuys.toFixed(2),
            totalSells: totalSells.toFixed(2),
            netProfit: netProfit.toFixed(2),
            profitPercent: profitPercent.toFixed(2)
        };
    }

    setCachedPrice(symbol: string, price: number, ttlMs: number = 30000) {
        this.priceCache.set(symbol, {
            price,
            expiry: Date.now() + ttlMs
        });
    }

    getCachedPrice(symbol: string): number | null {
        const data = this.priceCache.get(symbol);
        if (!data) return null;
        if (Date.now() > data.expiry) {
            this.priceCache.delete(symbol);
            return null;
        }
        return data.price;
    }

    async close() {
        if (this.db) {
            await this.db.close();
            this.db = null;
        }
    }
}

// Singleton for shared use
export const tradeDB = new AsyncTradeDB();
