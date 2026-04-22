/**
 * @description Estados posibles del ciclo de vida de una posición.
 */
export enum TradeState {
    IDLE = 'IDLE',
    SCANNING = 'SCANNING',
    ARMED = 'ARMED',
    ENTERED = 'ENTERED',
    TARGET_ACTIVATED = 'TARGET_ACTIVATED',
    RIDING = 'RIDING',
    EXITING = 'EXITING',
    EXITED = 'EXITED',
    COOLDOWN = 'COOLDOWN',
    STOPPED = 'STOPPED'
}

/**
 * @description Motivos de salida de una operación.
 */
export type ExitReason = 
    | 'TRAILING_EXIT' 
    | 'HARD_STOP_LOSS' 
    | 'MAX_HOLD_TIMEOUT' 
    | 'INSUFFICIENT_BALANCE' 
    | 'MANUAL' 
    | 'TARGET_ONLY'
    | 'BASE_HIT';

/**
 * @description Motivos de entrada de una operación.
 */
export type EntryReason = 
    | 'VOLUME_SPIKE' 
    | 'PRIORITY_PAIR' 
    | 'VOLUME_SPIKE_PRIORITY';

/**
 * @description Snapshot del estado actual de una posición.
 */
export interface PositionSnapshot {
    tradeId: string;
    pair: string;
    state: TradeState;
    entryPrice: number;
    currentPrice: number;
    peakProfitPct: number;
    currentProfitPct: number;
    holdDurationMinutes: number;
    entryReason: EntryReason;
    exitReason?: ExitReason;
    targetActivated: boolean;
    trailingArmed: boolean;
    openedAt: Date;
    closedAt?: Date;
}
