/**
 * @description Parámetros oficiales de Binance y control de flujo para el bot.
 * @see https://binance-docs.github.io/apidocs/spot/en/#limits
 */
export const RATE_LIMIT_CONFIG = {
    /** Límite global por IP (Spot) */
    MAX_WEIGHT_PER_MINUTE: 1200,
    /** Margen de seguridad antes de pausar ejecuciones (80% del límite) */
    SAFETY_THRESHOLD_PCT: 0.80,
    /** Pesos por endpoint común */
    WEIGHTS: {
        MARKET_DATA: 1,      // Ticker, Orderbook, etc. (Si no es WS)
        ACCOUNT_INFO: 10,     // Consulta de balances
        CREATE_ORDER: 1,      // Colocación de órdenes
        CANCEL_ORDER: 1,      // Cancelación
        TRADE_HISTORY: 5      // Consulta de trades cerrados
    },
    /** Configuración de Backoff */
    RETRY_DELAY_MS: 2000,
    MAX_RETRIES: 3,
    /** WebSocket limits */
    MAX_STREAMS_PER_CONNECTION: 300
};
