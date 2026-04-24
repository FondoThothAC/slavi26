import { PositionSnapshot, VolumeStarter } from '../types';
import { RISK_CONFIG } from '../config/RiskConfig';

/**
 * @description Evaluador puro de riesgos y condiciones de protección.
 * En la estrategia Refined Riding v2.2, NO se usa hard stop-loss por precio.
 * Se usa timeout para liberar capital atrapado y mantener la rotación.
 */
export class RiskGuard {

    /**
     * @description Verifica si la posición ha estado abierta por más tiempo del permitido.
     * @param openedAt Fecha de apertura
     * @param config Configuración de riesgos
     * @returns boolean
     */
    public static isMaxHoldExceeded(openedAt: any, config: typeof RISK_CONFIG): boolean {
        const date = openedAt instanceof Date ? openedAt : new Date(openedAt);
        return (Date.now() - date.getTime()) >= config.MAX_HOLD_MINUTES * 60000;
    }

    public static isSpreadAcceptable(spreadPct: number, config: typeof RISK_CONFIG): boolean {
        return spreadPct <= config.MAX_SPREAD_PCT;
    }

    public static isVolumeRankSufficient(rank: number, config: typeof RISK_CONFIG): boolean {
        return rank <= config.MIN_24H_VOLUME_RANK;
    }

    public static isMomentumSufficient(momentumPct: number, config: typeof RISK_CONFIG): boolean {
        return Math.abs(momentumPct) >= config.MIN_MOMENTUM_THRESHOLD;
    }

    public static isVolumeExpanding(volumeVsAvgRatio: number, config: typeof RISK_CONFIG): boolean {
        return volumeVsAvgRatio >= config.VOLUME_VS_AVG_RATIO;
    }

    public static isSlippageAcceptable(expectedPrice: number, executedPrice: number, config: typeof RISK_CONFIG): boolean {
        const slippage = Math.abs((executedPrice - expectedPrice) / expectedPrice);
        return slippage <= config.MAX_SLIPPAGE_PCT;
    }

    /**
     * @description Valida si se puede entrar en un nuevo par.
     */
    public static validateEntry(starter: VolumeStarter, config: typeof RISK_CONFIG): { allowed: boolean; reasons: string[] } {
        const reasons: string[] = [];
        if (!this.isSpreadAcceptable(starter.spreadPct, config)) reasons.push('Spread excedido');
        if (!this.isVolumeRankSufficient(starter.volumeRank, config)) reasons.push('Volumen insuficiente (Rank)');
        if (!this.isVolumeExpanding(starter.volumeVsAvgRatio, config)) reasons.push('Expansión de volumen insuficiente');
        
        return { allowed: reasons.length === 0, reasons };
    }

    /**
     * @description Evalúa si la posición debe cerrarse por tiempo.
     */
    public static evaluateOpenPosition(position: PositionSnapshot, config: typeof RISK_CONFIG): { action: 'HOLD' | 'TIMEOUT'; reason: string } {
        if (this.isMaxHoldExceeded(position.openedAt, config)) {
            return { action: 'TIMEOUT', reason: `Timeout superado: >${config.MAX_HOLD_MINUTES}m. Liberando capital.` };
        }
        return { action: 'HOLD', reason: 'Dentro del tiempo límite' };
    }
}
