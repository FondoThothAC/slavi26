import { RATE_LIMIT_CONFIG } from '../config/RateLimitConfig';

/**
 * @description Singleton para gestionar el cupo de la API REST de Binance.
 * Previene el baneo (HTTP 429) monitoreando el peso consumido en tiempo real.
 */
export class RateLimiter {
    private static instance: RateLimiter;
    private currentWeight: number = 0;
    private lastResetTime: number = Date.now();

    private constructor() {}

    public static getInstance(): RateLimiter {
        if (!RateLimiter.instance) {
            RateLimiter.instance = new RateLimiter();
        }
        return RateLimiter.instance;
    }

    /**
     * @description Actualiza el peso actual basado en los headers de respuesta de Binance.
     * @param xMbxUsedWeight El valor del header 'x-mbx-used-weight-1m'
     */
    public updateFromHeaders(xMbxUsedWeight: string | number): void {
        this.currentWeight = typeof xMbxUsedWeight === 'string' ? parseInt(xMbxUsedWeight) : xMbxUsedWeight;
        this.lastResetTime = Date.now();
        
        if (this.currentWeight > RATE_LIMIT_CONFIG.MAX_WEIGHT_PER_MINUTE * RATE_LIMIT_CONFIG.SAFETY_THRESHOLD_PCT) {
            console.warn(`[RateLimit] Advertencia: Consumo elevado (${this.currentWeight}/${RATE_LIMIT_CONFIG.MAX_WEIGHT_PER_MINUTE})`);
        }
    }

    /**
     * @description Verifica si es seguro realizar una petición.
     */
    public async waitIfNecessary(estimatedWeight: number = 1): Promise<void> {
        // Reset rudimentario cada minuto si no ha habido updates de headers
        if (Date.now() - this.lastResetTime > 60000) {
            this.currentWeight = 0;
            this.lastResetTime = Date.now();
        }

        if (this.currentWeight + estimatedWeight >= RATE_LIMIT_CONFIG.MAX_WEIGHT_PER_MINUTE) {
            const waitTime = 60000 - (Date.now() - this.lastResetTime) + 1000;
            console.error(`[RateLimit] Límite alcanzado. Pausando por ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            this.currentWeight = 0;
            this.lastResetTime = Date.now();
        }
    }

    public getCurrentWeight(): number {
        return this.currentWeight;
    }
}
