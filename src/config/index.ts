export * from './ExitConfig';
export * from './RiskConfig';
export * from './ScalingConfig';
export * from './SelectionConfig';
export * from './RateLimitConfig';

import { EXIT_CONFIG } from './ExitConfig';
import { RISK_CONFIG } from './RiskConfig';
import { SCALING_CONFIG } from './ScalingConfig';

export const CONFIG_SUMMARY = {
    strategy: "Refined Riding (Round-Robin Sequential Scalping)",
    version: "2.2.2",
    initialTargetPct: EXIT_CONFIG.INITIAL_TARGET_PCT,
    trailingPullbackPct: EXIT_CONFIG.TRAILING_PULLBACK_PCT,
    maxHoldMinutes: RISK_CONFIG.MAX_HOLD_MINUTES,
    maxConcurrentPairs: SCALING_CONFIG.MAX_CONCURRENT_PAIRS,
    orderSizeBNB: SCALING_CONFIG.ORDER_SIZE_BNB
};
