import dotenv from 'dotenv';

dotenv.config();

export const config = {
    bitso: {
        key: process.env.BITSO_API_KEY || '',
        secret: process.env.BITSO_API_SECRET || '',
        baseUrl: process.env.BITSO_BASE_URL || 'https://api.bitso.com/v3'
    },
    binance: {
        key: process.env.BINANCE_API_KEY || '',
        secret: process.env.BINANCE_API_SECRET || ''
    }
};

if (!config.bitso.key || !config.bitso.secret) {
    console.warn("WARNING: Bitso API Key or Secret is missing in .env file");
}

/**
 * Capital-tier thresholds for dynamic slot scaling.
 * Each tier defines the minimum Free BNB required to open N simultaneous pairs.
 * Thresholds are ordered from lowest to highest.
 */
export const SCALING_CONFIG = {
    slotThresholds: [
        { minCapital: 0.0100, slots: 1 },
        { minCapital: 0.0264, slots: 2 },
        { minCapital: 0.0528, slots: 4 },
        { minCapital: 0.1056, slots: 6 },
        { minCapital: 0.2112, slots: 8 },
        { minCapital: 0.5000, slots: 10 },
    ],
    // 0.10 percentage points below peak gain — fixed trailing stop callback
    // e.g. peak gain = +0.60% → sell trigger at +0.50%
    trailingCallbackPct: 0.10,
};

/**
 * Priority order for pair selection.
 * The bot will always try to fill slots starting from the top of this list.
 * If a pair is not in the live top-volume list, the scanner fills remaining slots.
 */
export const PAIR_PRIORITY_LIST: string[] = [
    'ADA/BNB',
    'DOT/BNB',
    'SOL/BNB',
    'XRP/BNB',
    'TRX/BNB',
    'DOGE/BNB',
    'LTC/BNB',
    'LINK/BNB',
    'MATIC/BNB',
    'FIL/BNB',
];
