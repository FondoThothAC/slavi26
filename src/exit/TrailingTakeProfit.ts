import { EXIT_CONFIG } from '../config';

export interface TTPState {
    isActive: boolean;
    peakProfitPct: number;
    targetActivated: boolean;
    targetActivationPrice: number | null;
}

/**
 * @description Motor puro para gestionar el Surfeo de ganancias independiente por Slot.
 */
export class TrailingTakeProfit {
    
    constructor(private readonly config: typeof EXIT_CONFIG) {}

    public initState(): TTPState {
        return { isActive: false, peakProfitPct: 0, targetActivated: false, targetActivationPrice: null };
    }

    public update(state: TTPState, currentProfitPct: number): TTPState {
        const newState = { ...state };
        if (!newState.targetActivated && currentProfitPct >= this.config.INITIAL_TARGET_PCT) {
            newState.targetActivated = true;
            newState.isActive = true;
            newState.peakProfitPct = currentProfitPct;
        }
        if (newState.isActive && currentProfitPct > newState.peakProfitPct) {
            newState.peakProfitPct = currentProfitPct;
        }
        return newState;
    }

    public shouldExit(state: TTPState, currentProfitPct: number): boolean {
        if (!state.isActive) return false;
        // Interpretamos 0.10 como 0.10% absoluto si viene de config.
        // Si el usuario puso 0.10 en config, restamos eso al pico.
        return (state.peakProfitPct - currentProfitPct) >= this.config.TRAILING_PULLBACK_PCT;
    }

    public getExitTriggerPrice(entryPrice: number, state: TTPState): number | null {
        if (!state.isActive) return null;
        return entryPrice * (1 + (state.peakProfitPct - this.config.TRAILING_PULLBACK_PCT));
    }

    public getProfitAtExit(state: TTPState): number {
        if (!state.isActive) return 0;
        return state.peakProfitPct - this.config.TRAILING_PULLBACK_PCT;
    }

    public describe(state: TTPState): string {
        if (!state.isActive) return `TTP[inactive]`;
        return `TTP[riding|peak=${(state.peakProfitPct*100).toFixed(2)}%|pullback=${(this.config.TRAILING_PULLBACK_PCT*100).toFixed(2)}%]`;
    }
}
