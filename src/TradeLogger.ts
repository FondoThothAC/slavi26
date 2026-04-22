import fs from 'fs';
import path from 'path';
import { tradeDB, TradeRecord } from './AsyncTradeDB';
import { telegram } from './utils/TelegramManager';

declare var console: any;
declare var process: any;
declare var __dirname: any;

interface LogEntry {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'TRADE';
    exchange: string;
    message: string;
}

/**
 * Trade Logger - Manages SQLite database and text logging for SLAVI Bot
 */
export class TradeLogger {
    private logDir: string;
    private logsFile: string;
    private logs: LogEntry[] = [];

    constructor(logDir: string = './logs') {
        this.logDir = logDir;
        this.logsFile = path.join(logDir, 'bot.log');

        // Ensure log directory exists
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * Log a trade execution (Async)
     */
    async logTrade(exchange: string, symbol: string, side: 'BUY' | 'SELL', price: number, amount: number, orderId: string, status: string = 'FILLED') {
        const record: TradeRecord = {
            timestamp: new Date().toISOString(),
            exchange,
            symbol,
            side,
            price,
            amount,
            total: price * amount,
            status,
            orderId
        };

        // Save to Database
        await tradeDB.insertTrade(record);

        // 🔥 Enviar alerta por Telegram si es un TRADE
        if (side === 'BUY' || side === 'SELL') {
            telegram.sendTradeAlert({
                symbol,
                side,
                price,
                amount
            }).catch(() => {}); // Fire & Forget
        }

        const quoteAsset = symbol.split('/')[1] || 'USD';
        const currencySymbol = quoteAsset === 'BNB' ? 'BNB ' : '$';
        this.log('TRADE', exchange, `${side} ${amount} ${symbol} @ ${price} = ${currencySymbol}${record.total.toFixed(4)}`);
    }

    /**
     * Log a message
     */
    log(level: 'INFO' | 'WARN' | 'ERROR' | 'TRADE', exchange: string, message: string) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            exchange,
            message
        };

        this.logs.push(entry);

        // Keep only last 500 logs in memory
        if (this.logs.length > 500) {
            this.logs.shift();
        }

        // Append to log file
        const logLine = `[${entry.timestamp}] [${entry.level}] [${entry.exchange}] ${entry.message}\n`;
        fs.appendFileSync(this.logsFile, logLine);

        // Also console
        console.log(`[${entry.level}] [${entry.exchange}] ${entry.message}`);
    }

    /**
     * Get recent trades from DB (Async)
     */
    async getRecentTrades(limit: number = 50): Promise<TradeRecord[]> {
        return await tradeDB.getRecentTrades(limit);
    }

    /**
     * Get recent logs
     */
    getRecentLogs(limit: number = 100): LogEntry[] {
        return this.logs.slice(-limit);
    }

    /**
     * Generate CSV content from DB for download (Async)
     */
    async getCSVContent(): Promise<string> {
        const trades = await tradeDB.getRecentTrades(1000); // Export last 1000 for now
        let csv = 'Timestamp,Exchange,Symbol,Side,Price,Amount,Total,Status,OrderID\n';
        for (const t of trades) {
            csv += `${t.timestamp},${t.exchange},${t.symbol},${t.side},${t.price},${t.amount},${t.total.toFixed(4)},${t.status},${t.orderId}\n`;
        }
        return csv;
    }

    /**
     * Get trade statistics from DB (Async)
     */
    async getStats() {
        return await tradeDB.getStats();
    }
}
