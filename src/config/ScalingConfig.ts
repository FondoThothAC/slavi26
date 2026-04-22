/**
 * @description Gestión dinámica de asignación de capital y slots independientes.
 */
export const SCALING_CONFIG = {
    SLOT_THRESHOLDS: [
        { MIN_CAPITAL_BNB: 0.0100, slots: 1 },
        { MIN_CAPITAL_BNB: 0.0200, slots: 2 },
        { MIN_CAPITAL_BNB: 0.0500, slots: 5 },
        { MIN_CAPITAL_BNB: 0.1000, slots: 10 },
        { MIN_CAPITAL_BNB: 0.5000, slots: 50 },
        { MIN_CAPITAL_BNB: 1.0000, slots: 100 },
        { MIN_CAPITAL_BNB: 2.1000, slots: 200 }
    ],
    /** Tamaño del micro-slot (~$6 USD equiv). */
    ORDER_SIZE_BNB: 0.0105,
    /** Máximo de posiciones paralelas permitidas. */
    MAX_CONCURRENT_PAIRS: 200
};
