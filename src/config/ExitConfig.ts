/**
 * @description Configuración de la lógica Trailing Take-Profit (TTP).
 * El sistema espera alcanzar INITIAL_TARGET_PCT para asegurar ganancia base,
 * luego persigue el precio máximo y vende si retrocede TRAILING_PULLBACK_PCT.
 */
export const EXIT_CONFIG = {
    INITIAL_TARGET_PCT: 0.003, // 0.3%
    TRAILING_PULLBACK_PCT: 0.001  // 0.1% pullback from peak
};
