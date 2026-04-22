import { BitsoClient } from '../api';

export interface StrategyConfig {
    book: string;
    amount: string; // Base amount to trade
    spread?: number; // For Maker strategies
    gridLevels?: number; // For Elevador Chino
}

export abstract class TradingStrategy {
    protected client: BitsoClient;
    protected config: StrategyConfig;

    constructor(client: BitsoClient, config: StrategyConfig) {
        this.client = client;
        this.config = config;
    }

    abstract run(): Promise<void>;
}
