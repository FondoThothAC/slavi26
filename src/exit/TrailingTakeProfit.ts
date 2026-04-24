import { EXIT_CONFIG } from '../config/ExitConfig';

export interface TTPState {
    isActive: boolean;
    targetActivated: boolean;
    peakProfitPct: number;
}

/**
 * @description Motor puro para gestionar el Surfeo de ganancias independiente por Slot.
 * Implementa un "Escudo" de ganancia neta mínima para evitar ventas por ruido de mercado.
 */
export class TrailingTakeProfit {
    constructor(private config: typeof EXIT_CONFIG) {}

    public initState(): TTPState {
        return {
            isActive: false,
            targetActivated: false,
            peakProfitPct: -999
        };
    }

    public update(state: TTPState, currentNetProfitPct: number): TTPState {
        const newState = { ...state };

        // 1. ¿Superamos el Target Inicial? (Calculamos el neto restando comisiones redondas)
        const netTarget = this.config.INITIAL_TARGET_PCT - this.config.ROUND_TRIP_FEE_PCT; 
        if (!newState.targetActivated && currentNetProfitPct >= netTarget) {
            newState.targetActivated = true;
            newState.isActive = true; // Armamos el gatillo
            newState.peakProfitPct = currentNetProfitPct;
        }

        // 2. Si ya estamos "Riding", actualizar el pico máximo
        if (newState.isActive) {
            if (currentNetProfitPct > newState.peakProfitPct) {
                newState.peakProfitPct = currentNetProfitPct;
            }
        }

        return newState;
    }

    public shouldExit(state: TTPState, currentNetProfitPct: number): boolean {
        // Si no está armado el trailing, no vender
        if (!state.isActive) return false;

        // ¿El precio cayó más de lo permitido desde el pico?
        const isPullbackHit = currentNetProfitPct <= (state.peakProfitPct - this.config.TRAILING_PULLBACK_PCT);
        
        // 🛡️ EL ESCUDO: ¿La ganancia sigue siendo mayor al piso mínimo garantizado?
        const isAboveFloor = currentNetProfitPct >= this.config.MIN_NET_PROFIT_FLOOR_PCT;

        // Vender SOLAMENTE si ocurrió el pullback Y todavía estamos por encima del piso seguro
        return isPullbackHit && isAboveFloor;
    }

    public describe(state: TTPState): string {
        if (state.isActive) {
            return `TTP[riding|peak=${(state.peakProfitPct * 100).toFixed(2)}%|pullback=${(this.config.TRAILING_PULLBACK_PCT * 100).toFixed(2)}%]`;
        }
        return `TTP[inactive]`;
    }

    public getProfitAtExit(state: TTPState): number {
        if (!state.isActive) return 0;
        return state.peakProfitPct - this.config.TRAILING_PULLBACK_PCT;
    }
}
