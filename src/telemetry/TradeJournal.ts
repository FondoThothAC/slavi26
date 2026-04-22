import Database from 'better-sqlite3';
import { TradeJournalEntry } from '../types';

/**
 * @description Registro persistente de operaciones para análisis posterior.
 * Utiliza SQLite para garantizar integridad y rapidez.
 */
export class TradeJournal {
    private db: Database.Database;

    constructor(dbPath: string = 'trades.db') {
        this.db = new Database(dbPath);
        this.ensureSchema();
    }

    private ensureSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS trade_journal (
                trade_id TEXT PRIMARY KEY, 
                pair TEXT NOT NULL, 
                entry_reason TEXT NOT NULL,
                entry_price REAL NOT NULL, 
                entry_time TEXT NOT NULL, 
                exit_reason TEXT,
                exit_price REAL, 
                exit_time TEXT, 
                target_activated INTEGER NOT NULL DEFAULT 0,
                target_trigger_price REAL, 
                trailing_armed INTEGER NOT NULL DEFAULT 0,
                peak_profit_pct REAL NOT NULL DEFAULT 0, 
                trailing_exit_trigger_pct REAL NOT NULL,
                final_profit_pct REAL, 
                fee_pct REAL NOT NULL, 
                slippage_pct REAL NOT NULL DEFAULT 0,
                hold_duration_minutes REAL NOT NULL DEFAULT 0, 
                market_condition TEXT NOT NULL DEFAULT 'unknown',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);
        
        // Migración simple para columnas faltantes si el archivo ya existe
        try { this.db.exec(`ALTER TABLE trade_journal ADD COLUMN exit_reason TEXT`); } catch (e) {}
    }

    /**
     * @description Registra la entrada en una posición (Market Buy).
     */
    public recordEntry(entry: Omit<TradeJournalEntry, 'exitReason'|'exitPrice'|'exitTime'|'finalProfitPct'>): void {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO trade_journal (
                trade_id, pair, entry_reason, entry_price, entry_time, target_activated, target_trigger_price,
                trailing_armed, peak_profit_pct, trailing_exit_trigger_pct, fee_pct, slippage_pct, hold_duration_minutes, market_condition
            ) VALUES (@tradeId, @pair, @entryReason, @entryPrice, @entryTime, @targetActivated, @targetTriggerPrice,
                @trailingArmed, @peakProfitPct, @trailingExitTriggerPct, @feePct, @slippagePct, @holdDurationMinutes, @marketCondition)
        `);
        
        stmt.run({ 
            ...entry, 
            targetActivated: entry.targetActivated ? 1 : 0, 
            trailingArmed: entry.trailingArmed ? 1 : 0 
        });
        
        console.log(`[JOURNAL] Entry recorded for ${entry.pair} (ID: ${entry.tradeId})`);
    }

    /**
     * @description Registra la salida de una posición (Market Sell).
     */
    public recordExit(tradeId: string, exitData: Pick<TradeJournalEntry, 'exitReason'|'exitPrice'|'exitTime'|'finalProfitPct'|'peakProfitPct'|'holdDurationMinutes'>): void {
        const stmt = this.db.prepare(`
            UPDATE trade_journal SET 
                exit_reason=@exitReason, 
                exit_price=@exitPrice, 
                exit_time=@exitTime,
                final_profit_pct=@finalProfitPct, 
                peak_profit_pct=@peakProfitPct, 
                hold_duration_minutes=@holdDurationMinutes
            WHERE trade_id=@tradeId
        `);
        
        stmt.run({ ...exitData, tradeId });
        console.log(`[JOURNAL] Exit recorded: ${exitData.exitReason} for ${tradeId}. PnL: ${(exitData.finalProfitPct! * 100).toFixed(2)}%`);
    }

    public getStats(): any {
        const total = this.db.prepare('SELECT count(*) as count FROM trade_journal WHERE exit_price IS NOT NULL').get() as any;
        const profit = this.db.prepare('SELECT sum(final_profit_pct) as total_profit FROM trade_journal WHERE exit_price IS NOT NULL').get() as any;
        return {
            totalTrades: total.count,
            totalNetProfit: profit.total_profit || 0
        };
    }

    public close(): void {
        this.db.close();
    }
}
