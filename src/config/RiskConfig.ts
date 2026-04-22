/**
 * @description Parámetros de seguridad y control de riesgo operativo.
 * NOTA: No hay hard stop-loss por precio. La única protección es el timeout.
 */
export const RISK_CONFIG = {
    /** Tiempo máximo (minutos) reteniendo un trade lateral (30 días = 43200) */
    MAX_HOLD_MINUTES: 43200, 
    /** Tolerancia máxima de diferencial (spread) para permitir entrada */
    MAX_SPREAD_PCT: 0.0025,
    /** Rango de volumen mínimo exigido (1 = mayor volumen) */
    MIN_24H_VOLUME_RANK: 10,
    /** Movimiento mínimo exigido para evitar mercados sin tendencia */
    MIN_MOMENTUM_THRESHOLD: 0.001,
    /** Ratio mínimo de expansión de volumen vs media móvil */
    VOLUME_VS_AVG_RATIO: 1.2,
    /** Tolerancia máxima de deslizamiento de precio en ejecución */
    MAX_SLIPPAGE_PCT: 0.003,
    /** Filtro de liquidez mínima (USD 24h) */
    MIN_24H_VOLUME_USD: 1000000,
    /** Máximo de posiciones por la misma moneda */
    MAX_POSITION_PER_COIN: 3
};
