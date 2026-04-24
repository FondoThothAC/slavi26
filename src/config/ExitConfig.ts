/**
 * @description Configuración de los parámetros de salida (Take Profit y Trailing).
 */
export const EXIT_CONFIG = {
    /** Target bruto inicial para activar el modo Riding (0.5%) */
    INITIAL_TARGET_PCT: 0.005,
    
    /** Cuánto debe caer desde el pico máximo para vender (0.2%) */
    TRAILING_PULLBACK_PCT: 0.002,

    /** 🛡️ PISO MÍNIMO GARANTIZADO: Jamás vender si la ganancia neta es menor a esto (0.2% neto) */
    MIN_NET_PROFIT_FLOOR_PCT: 0.002,

    /** Comisión redonda estimada (0.075% x 2 = 0.15%) */
    ROUND_TRIP_FEE_PCT: 0.0015,

    /** Tiempo de espera antes de reintentar una orden fallida */
    ORDER_RETRY_DELAY_MS: 2000
};
