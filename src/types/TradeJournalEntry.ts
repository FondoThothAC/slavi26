import { EntryReason, ExitReason } from './TradeState';

/**
 * @description Estructura de registro histórico y telemetría para la base de datos.
 */
export interface TradeJournalEntry {
    tradeId: string;
    pair: string;
    entryReason: EntryReason;
    entryPrice: number;
    entryTime: string; // ISO8601
    exitReason?: ExitReason;
    exitPrice?: number;
    exitTime?: string; // ISO8601
    targetActivated: boolean;
    targetTriggerPrice?: number;
    trailingArmed: boolean;
    peakProfitPct: number;
    trailingExitTriggerPct: number;
    finalProfitPct?: number;
    feePct: number;
    slippagePct: number;
    holdDurationMinutes: number;
    marketCondition: 'trending' | 'ranging' | 'unknown';
}
