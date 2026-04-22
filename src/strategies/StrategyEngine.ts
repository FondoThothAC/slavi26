import * as fs from 'fs';
import * as path from 'path';
import { SCALING_CONFIG } from '../config/ScalingConfig';
import { EXIT_CONFIG } from '../config/ExitConfig';
import { RISK_CONFIG } from '../config/RiskConfig';
import { RATE_LIMIT_CONFIG } from '../config/RateLimitConfig';
import { Exchange, Order, OrderRequest, Portfolio } from '../exchanges/Exchange';
import { RiskGuard } from '../risk/RiskGuard';
import { TrailingTakeProfit, TTPState } from '../exit/TrailingTakeProfit';
import { TradeJournal } from '../telemetry/TradeJournal';
import { TradeState, EntryReason, ExitReason, PositionSnapshot, VolumeStarter } from '../types';
import { WebSocketService } from '../services/WebSocketService';
import { RateLimiter } from '../utils/RateLimiter';
import { BinanceWebSocketManager } from '../utils/BinanceWebSocketManager';


declare var console: any;


/**
 * Strategy Engine - Core trading logic.
 */
export interface Strategy {
    name: string;
    description: string;
    type: 'arbitrage' | 'grid' | 'dca' | 'copy' | 'momentum' | 'market_making';
    isActive: boolean;
    analyze: (exchange: Exchange, symbol: string) => Promise<Signal[]>;
    execute: (exchange: Exchange, signal: Signal) => Promise<Order | null>;

    // Risk management
    getMaxPositionSize?: (portfolio: any) => number;
    getStopLoss?: (entryPrice: number) => number;
    getTakeProfit?: (entryPrice: number) => number;

    getState?: () => any;
    updateConfig?: (config: any) => void;
    setHodlMode?: (active: boolean) => void;
}

export interface Signal {
    symbol: string;
    action: 'buy' | 'sell' | 'hold' | 'arbitrage_buy_bitso' | 'arbitrage_buy_binance' | 'cancel_replace';
    strength: number;  // 0-100
    reason: string;
    price: number;
    suggestedAmount?: number;
    timestamp: Date;
}

/**
 * Arbitrage Strategy - Cross-exchange price differences.
 */
export class ArbitrageStrategy implements Strategy {
    name = 'Cross-Exchange Arbitrage';
    description = 'Exploit price differences between Bitso and Binance';
    type: 'arbitrage' = 'arbitrage';
    isActive = true;

    private minSpreadPercent = 0.5; // Minimum 0.5% spread to act

    constructor(
        private exchangeA: Exchange,
        private exchangeB: Exchange
    ) { }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        const [tickerA, tickerB] = await Promise.all([
            this.exchangeA.getTicker(symbol),
            this.exchangeB.getTicker(symbol),
        ]);

        const spread = ((tickerB.ask - tickerA.bid) / tickerA.bid) * 100;
        const signals: Signal[] = [];

        if (spread > this.minSpreadPercent) {
            signals.push({
                symbol,
                action: 'buy',
                strength: Math.min(spread * 20, 100),
                reason: `Arbitrage: Buy on ${this.exchangeA.name} at ${tickerA.ask}, sell on ${this.exchangeB.name} at ${tickerB.bid}.Spread: ${spread.toFixed(2)}% `,
                price: tickerA.ask,
                timestamp: new Date(),
            });
        }

        return signals;
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        if (signal.action === 'hold') return null;

        const order: OrderRequest = {
            symbol: signal.symbol,
            side: signal.action === 'buy' || signal.action === 'arbitrage_buy_bitso' || signal.action === 'arbitrage_buy_binance' ? 'buy' : 'sell',
            type: 'market',
            amount: signal.suggestedAmount || 0,
        };

        return exchange.createOrder(order);
    }

    getMaxPositionSize(portfolio: Portfolio): number {
        return portfolio.totalValue * 0.1; // 10% max per trade
    }

    getStopLoss(entryPrice: number): number {
        return entryPrice * 0.98; // 2% stop loss
    }

    getTakeProfit(entryPrice: number): number {
        return entryPrice * 1.01; // 1% take profit (quick arbitrage)
    }
}

/**
 * Cross-Exchange Loop Strategy (USD Base).
 * Avoids MXN volatility and high fees.
 * Base Loop: USDT (ExA) -> Crypto -> Transfer -> Crypto (ExB) -> USDT (ExB) -> Transfer -> USDT (ExA)
 */
export class CrossExchangeLoopStrategy implements Strategy {
    name = 'USD Loop Arbitrage (Ciclo Dólar)';
    description = 'Buy Bitso (USD) -> Transfer -> Sell Binance (USDT) -> Buy Binance -> Transfer -> Sell Bitso';
    type: 'arbitrage' = 'arbitrage';
    isActive = true;

    // Fees (approximate, based on standard tiers)
    private readonly FEES = {
        BITSO: 0.005,   // 0.50% Taker (MXN markets are higher, USD pairs vary)
        BINANCE: 0.001, // 0.10% Standard
        TRANSFER_XRP: 0.1, // Fixed XRP (Low fee on Ripple network)
        TRANSFER_USDT: 1.0 // TRC20/Polygon estimation (ERC20 is much higher)
    };

    constructor(
        private exBitso: Exchange,
        private exBinance: Exchange,
        private symbolTransfer: string = 'XRP', // Low fee transfer coin
        private amountUSD: number,
        private minProfitPercent: number = 1.0
    ) { }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        // 1. Get Prices
        // Bitso: USD Pairs (e.g. xrp_usd) - Bitso often lists as 'usd' (stablecoins)
        const bitsoTicker = await this.exBitso.getTicker(`${this.symbolTransfer}/USD`);

        // Binance: USDT Pairs (e.g. XRP/USDT)
        const binanceTicker = await this.exBinance.getTicker(`${this.symbolTransfer}/USDT`);

        // 2. Simulate Direction A: Bitso -> Binance
        // Buy on Bitso (Ask), Transfer, Sell on Binance (Bid)
        const profitA = this.calculateDirection(
            this.amountUSD,
            bitsoTicker.ask,
            binanceTicker.bid,
            this.FEES.BITSO,
            this.FEES.BINANCE
        );

        // 3. Simulate Direction B: Binance -> Bitso
        // Buy on Binance (Ask), Transfer, Sell on Bitso (Bid)
        const profitB = this.calculateDirection(
            this.amountUSD,
            binanceTicker.ask,
            bitsoTicker.bid,
            this.FEES.BINANCE,
            this.FEES.BITSO
        );

        const signals: Signal[] = [];

        // Check Direction A
        if (profitA.percent > this.minProfitPercent) {
            signals.push({
                symbol: this.symbolTransfer,
                action: 'arbitrage_buy_bitso',
                strength: 100,
                reason: `Bitso->Binance Opp! Start: $${this.amountUSD}, End: $${profitA.endAmount.toFixed(2)}. Profit: ${profitA.percent.toFixed(2)}%`,
                price: bitsoTicker.ask,
                timestamp: new Date()
            });
        }

        // Check Direction B
        if (profitB.percent > this.minProfitPercent) {
            signals.push({
                symbol: this.symbolTransfer,
                action: 'arbitrage_buy_binance',
                strength: 100,
                reason: `Binance->Bitso Opp! Start: $${this.amountUSD}, End: $${profitB.endAmount.toFixed(2)}. Profit: ${profitB.percent.toFixed(2)}%`,
                price: binanceTicker.ask,
                timestamp: new Date()
            });
        }

        return signals;
    }

    private calculateDirection(
        startAmount: number,
        buyPrice: number,
        sellPrice: number,
        buyFee: number,
        sellFee: number
    ): { endAmount: number, percent: number } {
        // 1. Buy
        const cryptoAmount = (startAmount / buyPrice) * (1 - buyFee);

        // 2. Transfer (Fixed fee subtraction)
        const cryptoArrived = cryptoAmount - this.FEES.TRANSFER_XRP;

        // 3. Sell
        const endAmount = (cryptoArrived * sellPrice) * (1 - sellFee);

        // Note: This simulation assumes we hold the endAmount on the destination exchange
        // (Spatial Arbitrage). For a full loop back to origin, we'd deduct another transfer fee.
        // Assuming spatial arbitrage (rebalancing) is acceptable for now.

        const profit = endAmount - startAmount;
        const percent = (profit / startAmount) * 100;

        return { endAmount, percent };
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        console.log('EXECUTING ARBITRAGE (USD): ', signal.reason);
        // Execution logic would verify balances and place orders
        return null;
    }

    getMaxPositionSize(portfolio: Portfolio): number { return this.amountUSD; }
    getStopLoss(entry: number): number { return 0; }
    getTakeProfit(entry: number): number { return 0; }
}

/**
 * Triangular Arbitrage Strategy (Intra-Exchange).
 * "Complete Loop" within a single exchange.
 * Checks both directions:
 * 1. Clockwise: Base -> A -> B -> Base
 * 2. Counter-Clockwise: Base -> B -> A -> Base
 */
export class TriangularArbitrageStrategy implements Strategy {
    name = 'Triangular Arbitrage (Triángulo Bidireccional)';
    description = 'Execute a 3-step loop: USD -> Coin A -> Coin B -> USD (or reverse)';
    type: 'arbitrage' = 'arbitrage';
    isActive = true;

    constructor(
        private exchange: Exchange,
        private baseSymbol: string = 'USDT', // Start/End coin
        private intermediateA: string = 'XRP',
        private intermediateB: string = 'BTC',
        private amount: number,
        private minProfitPercent: number = 0.5
    ) { }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        // Pairs needed: 
        // 1. A/Base (e.g. XRP/USDT)
        // 2. A/B (e.g. XRP/BTC)
        // 3. B/Base (e.g. BTC/USDT)

        const [pairA_Base, pairA_B, pairB_Base] = await Promise.all([
            this.exchange.getTicker(`${this.intermediateA}/${this.baseSymbol}`), // XRP/USDT
            this.exchange.getTicker(`${this.intermediateA}/${this.intermediateB}`), // XRP/BTC
            this.exchange.getTicker(`${this.intermediateB}/${this.baseSymbol}`)  // BTC/USDT
        ]);

        // --- Path 1: Clockwise (Base -> A -> B -> Base) ---
        // 1. Buy A with Base (Ask)
        const p1_AmtA = (this.amount / pairA_Base.ask) * 0.999;
        // 2. Sell A for B (Bid) [Assuming pair is A/B]
        const p1_AmtB = (p1_AmtA * pairA_B.bid) * 0.999;
        // 3. Sell B for Base (Bid) [Assuming pair is B/Base]
        const p1_Final = (p1_AmtB * pairB_Base.bid) * 0.999;
        const p1_Profit = ((p1_Final - this.amount) / this.amount) * 100;

        // --- Path 2: Counter-Clockwise (Base -> B -> A -> Base) ---
        // 1. Buy B with Base (Ask)
        const p2_AmtB = (this.amount / pairB_Base.ask) * 0.999;
        // 2. Buy A with B (Ask of A/B pair) -> Buying A means paying B
        // Quantity of A = Quantity of B / Price(A/B)
        const p2_AmtA = (p2_AmtB / pairA_B.ask) * 0.999;
        // 3. Sell A for Base (Bid)
        const p2_Final = (p2_AmtA * pairA_Base.bid) * 0.999;
        const p2_Profit = ((p2_Final - this.amount) / this.amount) * 100;

        const signals: Signal[] = [];

        // Select Best Path
        if (p1_Profit > this.minProfitPercent && p1_Profit > p2_Profit) {
            signals.push({
                symbol: 'TRIANGLE_CW',
                action: 'buy', // Triggers the chain
                strength: 100,
                reason: `Clockwise Win! ${this.baseSymbol}->${this.intermediateA}->${this.intermediateB}->${this.baseSymbol}. Profit: ${p1_Profit.toFixed(2)}%`,
                price: 0,
                timestamp: new Date()
            });
        } else if (p2_Profit > this.minProfitPercent && p2_Profit > p1_Profit) {
            signals.push({
                symbol: 'TRIANGLE_CCW',
                action: 'buy',
                strength: 100,
                reason: `Counter-Clockwise Win! ${this.baseSymbol}->${this.intermediateB}->${this.intermediateA}->${this.baseSymbol}. Profit: ${p2_Profit.toFixed(2)}%`,
                price: 0,
                timestamp: new Date()
            });
        }

        return signals;
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        console.log('EXECUTING TRIANGULAR ARBITRAGE: ', signal.reason);
        // Real implementation would parse 'TRIANGLE_CW' vs 'TRIANGLE_CCW' and execute the 3 specific orders
        return null;
    }

    getMaxPositionSize(portfolio: Portfolio): number { return this.amount; }
    getStopLoss(entry: number): number { return 0; }
    getTakeProfit(entry: number): number { return 0; }
}

/**
 * DCA Strategy - Dollar Cost Averaging.
 */
export class DCAStrategy implements Strategy {
    name = 'Dollar Cost Averaging';
    description = 'Regular purchases regardless of price';
    type: 'dca' = 'dca';
    isActive = true;

    constructor(
        private amountPerPurchase: number,
        private intervalHours: number = 24
    ) { }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        // DCA always buys at scheduled times
        return [{
            symbol,
            action: 'buy',
            strength: 50,
            reason: `DCA scheduled purchase of $${this.amountPerPurchase}`,
            price: 0, // Market price
            suggestedAmount: this.amountPerPurchase,
            timestamp: new Date(),
        }];
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        const order: OrderRequest = {
            symbol: signal.symbol,
            side: 'buy',
            type: 'market',
            amount: signal.suggestedAmount || this.amountPerPurchase,
        };

        return exchange.createOrder(order);
    }

    getMaxPositionSize(portfolio: Portfolio): number {
        return this.amountPerPurchase;
    }

    getStopLoss(entryPrice: number): number {
        return 0; // DCA doesn't use stop loss
    }

    getTakeProfit(entryPrice: number): number {
        return 0; // DCA is long-term
    }
}

/**
 * Grid Strategy - Buy low, sell high in a range.
 */
/**
 * Micro-Grid / Scalping Strategy.
 * "Mini packages" / "Hundreds of times a day".
 * Places tighter grids with smaller profit targets for high frequency.
 */
export class ScalpingGridStrategy implements Strategy {
    name = 'High-Frequency Scalping Grid';
    description = 'Place tight buy/sell orders for micro-profits';
    type: 'grid' = 'grid';
    isActive = true;

    constructor(
        private centerPrice: number | null, // If null, use current market price
        private gridRangePercent: number = 0.02, // +/- 2% range
        private gridLevels: number = 20, // High density
        private amountPerGrid: number
    ) { }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        const ticker = await exchange.getTicker(symbol);
        const center = this.centerPrice || ticker.last;

        const lowerBound = center * (1 - this.gridRangePercent);
        const upperBound = center * (1 + this.gridRangePercent);
        const stepSize = (upperBound - lowerBound) / this.gridLevels;

        const signals: Signal[] = [];

        // Logic: If price hits a grid line, trigger action
        // For simulation, we generate orders for the whole grid
        for (let i = 0; i <= this.gridLevels; i++) {
            const levelPrice = lowerBound + (stepSize * i);

            // If current price is close to a level, trigger
            // In real grid bot, orders are always placed as Limit orders waiting to be filled
            if (Math.abs(ticker.last - levelPrice) < (stepSize * 0.1)) {
                // Nothing to do in 'analyze' for active grid, it's about order placement.
                // But for signal generation:
                const action = levelPrice < center ? 'buy' : 'sell';
                signals.push({
                    symbol,
                    action: action as 'buy' | 'sell',
                    strength: 60,
                    reason: `Scalping Grid Level ${i} @ ${levelPrice.toFixed(2)}`,
                    price: levelPrice,
                    suggestedAmount: this.amountPerGrid,
                    timestamp: new Date()
                });
            }
        }

        return signals;
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        // Place Limit Order
        return exchange.createOrder({
            symbol: signal.symbol,
            side: signal.action as 'buy' | 'sell',
            type: 'limit',
            price: signal.price,
            amount: signal.suggestedAmount || this.amountPerGrid
        });
    }

    getMaxPositionSize(portfolio: Portfolio): number {
        return this.amountPerGrid * this.gridLevels;
    }

    getStopLoss(entry: number): number { return 0; } // Grids usually hold through validity
    getTakeProfit(entry: number): number { return 0; }

    updateConfig(rangePercent: number) {
        this.gridRangePercent = rangePercent;
    }
}

/**
 * Compound Booster Strategy.
 * Active trading: Buy -> Sell +1% -> Repeat.
 * Splits capital into multiple "active trades" as it grows.
 */
export class CompoundBoosterStrategy implements Strategy {
    name = 'Compound Booster (Interés Compuesto)';
    description = 'Active Buy -> Sell (+1%) -> Repeat. Splits orders as capital grows.';
    type: 'dca' = 'dca'; // Hybrid DCA/Grid
    isActive = true;

    // private baseAmountUSD: number; // Duplicate removed
    private profitTargetPercent: number;
    private feePercent: number;
    // Time enforcement
    private lastBuyTime: number = 0;
    private timeBetweenBuys = 60 * 1000; // 1 min throttle
    private maxOrderAge = 5 * 60 * 1000; // 5 minutes for stale orders

    // Memory of last entry price for better exit targets
    private lastBuyPrice: number = 0;
    private exchangeSymbol: string;
    private stateFile: string; // Moved stateFile here to match the instruction's implied structure

    constructor(
        private baseAmountUSD: number = 10,
        exchangeSymbol: string = 'DEFAULT',
        profitTargetPercent: number = 0.01,
        feePercent: number = 0.0065 // Default to Bitso fee if not provided
    ) {
        this.exchangeSymbol = exchangeSymbol;
        this.profitTargetPercent = profitTargetPercent;
        this.feePercent = feePercent;

        // Create unique state file per exchange+symbol (e.g., compound_booster_state_Bitso_XRP_USD.json)
        const safeSymbol = exchangeSymbol.replace(/[^a-zA-Z0-9]/g, '_');
        this.stateFile = path.join(process.cwd(), `compound_booster_state_${safeSymbol}.json`);
        this.loadState();
        console.log(`[${exchangeSymbol}] Strategy Config: Target +${(profitTargetPercent * 100).toFixed(2)}%, Fee ${(feePercent * 100).toFixed(2)}%`);
    }

    private loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                if (data.lastBuyPrice) this.lastBuyPrice = data.lastBuyPrice;
                if (data.lastBuyTime) this.lastBuyTime = data.lastBuyTime;
                // console.log(`[CompoundBooster] State loaded: BuyPrice=${this.lastBuyPrice}`);
            }
        } catch (e) {
            console.error('[CompoundBooster] Failed to load state', e);
        }
    }

    private saveState() {
        try {
            const data = {
                lastBuyPrice: this.lastBuyPrice,
                lastBuyTime: this.lastBuyTime,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(this.stateFile, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[CompoundBooster] Failed to save state', e);
        }
    }

    public getState() {
        return {
            lastBuyPrice: this.lastBuyPrice,
            lastBuyTime: this.lastBuyTime,
            targetPrice: this.lastBuyPrice * (1 + this.profitTargetPercent)
        };
    }

    updateConfig(config: any) {
        if (config.baseAmount) this.baseAmountUSD = config.baseAmount;
    }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        const quote = symbol.split('/')[1]; // e.g. USD
        const base = symbol.split('/')[0];  // e.g. XRP

        // 1. Get Market Data
        const ticker = await exchange.getTicker(symbol);
        const balances = await exchange.getBalance();
        const quoteBalance = balances.find((b: any) => b.asset === quote)?.free || 0;
        const baseBalance = balances.find((b: any) => b.asset === base)?.free || 0;

        console.log(`[CompoundBooster] Analyzing ${symbol}. USD: ${quoteBalance.toFixed(2)}, ${base}: ${baseBalance.toFixed(4)}. LastBuyPrice: ${this.lastBuyPrice}`);

        const openOrders = await exchange.getOpenOrders(symbol);

        const signals: Signal[] = [];

        // 1. Smart Reprice (Stale Order Check)
        const now = new Date().getTime();
        for (const order of openOrders) {
            // Check only SELLS that are pending
            // Bitso timestamp is epoch ms
            if (order.side === 'sell' && (now - new Date(order.createdAt).getTime()) > (5 * 60 * 1000)) {
                // Stale > 5 mins
                // Estimate Entry Price (conservative)
                const estimatedEntry = order.price / (1 + this.profitTargetPercent);
                const breakEvenPrice = estimatedEntry * (1 + (2 * this.feePercent));

                // If Current Ask is > Break Even, we can exit safely
                if (ticker.ask > breakEvenPrice) {
                    // Only reprice if current ask is LOWER than our stale order (otherwise why change?)
                    if (ticker.ask < order.price) {
                        signals.push({
                            symbol,
                            action: 'cancel_replace',
                            strength: 100,
                            reason: `SmartReprice: ${order.id}`, // Pass active order ID in reason
                            price: ticker.ask,
                            suggestedAmount: order.amount,
                            timestamp: new Date()
                        });
                    }
                }
            }
            // Additional stale order check for any side
            const orderAge = now - new Date(order.createdAt).getTime();
            if (orderAge > this.maxOrderAge) {
                // Assuming 'dashboard' is available in the scope, otherwise replace with console.log
                const dashboard = { log: console.log }; // Placeholder if not defined
                dashboard.log(`🔄 [${exchange.name}-${symbol}] Smart Reprice: Cancelling stale order ${order.id}...`);
                try {
                    // Now passing symbol to support Binance
                    await exchange.cancelOrder(order.id, symbol);
                } catch (e: any) {
                    dashboard.log(`❌ [${exchange.name}-${symbol}] Cancel failed: ${e.message}`);
                }

                // We do NOT place new order here. We let the next loop handle it naturally.
                // Ideally we should "release" the locked balance expectation immediately but 
                // the loop will see it as "no open orders" next tick.

                // We can return here to avoid duplicate signals in same tick
                return [];
            }
        }

        // 2. Logic: Sell Inventory First
        // If we have base currency (XRP) and NO active sell orders for it, we must sell actively
        // But active orders check takes care of "pending sells".
        // We assume "free" balance is uncommitted.
        const baseValueUSD = baseBalance * ticker.bid;

        if (baseValueUSD > 1) { // Minimum dust info
            // Use lastBuyPrice if available, otherwise fallback to ticker.ask
            // But if lastBuyPrice is 0 (lost state?), we might sell at loss.
            // Safety: If lastBuyPrice > 0, Target = lastBuyPrice * 1.01
            //         If lastBuyPrice == 0, Target = ticker.ask * 1.01 (Optimistic scalp)
            let targetPrice = ticker.ask * (1 + this.profitTargetPercent);

            if (this.lastBuyPrice > 0) {
                targetPrice = Math.max(targetPrice, this.lastBuyPrice * (1 + this.profitTargetPercent));
            }

            signals.push({
                symbol,
                action: 'sell',
                strength: 100,
                reason: `Selling Inventory: ${baseBalance.toFixed(4)} ${base} @ Target +1%`,
                price: targetPrice,
                suggestedAmount: baseBalance,
                timestamp: new Date()
            });
        }

        // 3. Logic: Buy if we have Fiat and time passed
        // Compound Logic:
        // Total Capital = Quote + BaseValue
        // If Quote > $20, we can open 2 parallel trades (if not already opened)
        // Check how many buys are active? openOrders side='buy'

        const activeBuys = openOrders.filter(o => o.side === 'buy').length;
        // const now = new Date().getTime(); // Already defined above

        // If we have enough USD for a trade
        if (quoteBalance > this.baseAmountUSD) {
            // Logic: If we have NO inventory and NO open orders, and we have USD, we SHOULD buy.
            // Check throttling (Time between buys)
            const timeSinceLastBuy = now - this.lastBuyTime;
            const canBuy = timeSinceLastBuy > this.timeBetweenBuys || activeBuys === 0;

            if (canBuy) {
                signals.push({
                    symbol,
                    action: 'buy',
                    strength: 90,
                    reason: `Compound Entry: Loop Active. $${this.baseAmountUSD} USD available.`,
                    price: ticker.bid,
                    suggestedAmount: this.baseAmountUSD, // Total USD/BNB to spend
                    timestamp: new Date()
                });
            }
        }

        return signals;
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        if (signal.action === 'buy') {
            this.lastBuyTime = new Date().getTime();
            this.lastBuyPrice = signal.price; // Approximate execution price
            this.saveState();
        }

        // For buys, we try to be aggressive (market or near limit)
        // For sells, we strictly use LIMIT at target
        // const type = signal.action === 'sell' ? 'limit' : 'limit';
        // ActiveScalper logic prefers Market for emergency, Limit for Profit.
        // CompoundBooster prefers Limit.
        const type = 'limit';

        return exchange.createOrder({
            symbol: signal.symbol,
            side: signal.action as 'buy' | 'sell',
            type: type,
            price: signal.price,
            amount: signal.suggestedAmount || 0
        });
    }

    getMaxPositionSize(portfolio: Portfolio): number { return this.baseAmountUSD; }
    getStopLoss(entry: number): number { return 0; }
    getTakeProfit(entry: number): number { return entry * (1 + this.profitTargetPercent); }
}

/**
 * @module StrategyEngine
 * @description Orquestador de la estrategia "Round-Robin Sequential Scalping".
 * Matriz DCA de slots independientes con Trailing Take-Profit y Timeouts.
 * 
 * @architecture
 *   Prices: WebSocket Streams (0 rate limit)
 *   Orders: REST API (1200 req/min with batching)
 *   Balance: REST + Cache (60s TTL)
 * 
 * @version 2.2.0
 */
export class ActiveScalperStrategy implements Strategy {
    name = 'SLAVI v2.2.0 (2026-04-22) - Multi-Slot RR';
    description = 'No price-based hard stop-loss; timeout frees frozen capital. Parallel slots on BNB pairs.';
    type: 'dca' = 'dca';
    isActive = true;

    private stateFile: string;
    private journal: TradeJournal;
    private ttp: TrailingTakeProfit;
    private wsService: WebSocketService;
    private rateLimiter: RateLimiter;
    
    // Multi-slot state
    private activePositions: Map<string, PositionSnapshot & { ttpState: TTPState }> = new Map();
    private pairRotationIndex: number = 0;

    constructor(
        private quoteAmount: number = SCALING_CONFIG.ORDER_SIZE_BNB,
        private exchangeSymbol: string,
    ) {
        const safeSymbol = exchangeSymbol.replace(/[^a-zA-Z0-9]/g, '_');
        this.stateFile = path.join(process.cwd(), `scalper_state_multi_${safeSymbol}.json`);
        
        this.ttp = new TrailingTakeProfit(EXIT_CONFIG);
        this.journal = new TradeJournal();
        this.wsService = BinanceWebSocketManager.getInstance();
        this.rateLimiter = RateLimiter.getInstance();
        
        this.loadState();
        
        console.log(`[Strategy] Initialized ${this.name} for ${exchangeSymbol}`);
        console.log(`[Strategy] Architecture: WebSocket (Prices) + REST (Orders)`);
    }

    private loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                if (data.activePositions) {
                    this.activePositions = new Map(Object.entries(data.activePositions));
                }
                this.pairRotationIndex = data.pairRotationIndex || 0;
            }
        } catch (e) { }
    }

    private saveState() {
        try {
            const activeObj = Object.fromEntries(this.activePositions);
            fs.writeFileSync(this.stateFile, JSON.stringify({
                activePositions: activeObj,
                pairRotationIndex: this.pairRotationIndex,
                updatedAt: new Date().toISOString()
            }, null, 2));
        } catch (e) { }
    }

    public getState() {
        return {
            activeCount: this.activePositions.size,
            pairRotationIndex: this.pairRotationIndex,
            positions: Array.from(this.activePositions.values())
        };
    }

    public setHodlMode(active: boolean) {
        // En v2.2 el timeout es mandatorio para rotación de capital.
        // Este método se mantiene por compatibilidad con el Dashboard.
    }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        const now = Date.now();
        const signals: Signal[] = [];

        // 1. Suscribirse a este par en el WebSocket si no lo está
        this.wsService.subscribe([symbol.replace('/', '')]);

        // 2. ¿Tenemos ya una posición abierta para este símbolo?
        const existingPosition = Array.from(this.activePositions.values()).find(p => p.pair === symbol);

        if (existingPosition) {
            // --- GESTIÓN DE POSICIÓN ACTIVA ---
            const currentPrice = this.wsService.getPrice(symbol);
            if (!currentPrice) return []; // Esperar a que el WS nos dé precio

            const grossPnlPct = (currentPrice - existingPosition.entryPrice) / existingPosition.entryPrice;
            const ROUND_TRIP_FEE_PCT = 0.0015; // 0.15% (0.075% buy + 0.075% sell with BNB)
            const netPnlPct = grossPnlPct - ROUND_TRIP_FEE_PCT;

            // Actualizar snapshot para evaluación
            existingPosition.currentPrice = currentPrice;
            existingPosition.currentProfitPct = netPnlPct;
            
            const openedAt = existingPosition.openedAt instanceof Date 
                ? existingPosition.openedAt 
                : new Date(existingPosition.openedAt);
            existingPosition.holdDurationMinutes = (now - openedAt.getTime()) / 60000;

            // Update TTP
            existingPosition.ttpState = this.ttp.update(existingPosition.ttpState, netPnlPct);
            existingPosition.peakProfitPct = existingPosition.ttpState.peakProfitPct;
            existingPosition.targetActivated = existingPosition.ttpState.targetActivated;
            existingPosition.trailingArmed = existingPosition.ttpState.isActive;

            this.saveState();

            // A. RiskGuard: Timeout Check
            const riskDecision = RiskGuard.evaluateOpenPosition(existingPosition, RISK_CONFIG);
            if (riskDecision.action === 'TIMEOUT') {
                signals.push({
                    symbol,
                    action: 'sell',
                    strength: 100,
                    reason: `⚠️ [MAX_HOLD_TIMEOUT] ${riskDecision.reason}`,
                    price: currentPrice,
                    timestamp: new Date()
                });
                return signals;
            }

            // B. TTP Check
            if (this.ttp.shouldExit(existingPosition.ttpState, netPnlPct)) {
                signals.push({
                    symbol,
                    action: 'sell',
                    strength: 100,
                    reason: `🎯 [TRAILING_EXIT] ${this.ttp.describe(existingPosition.ttpState)}`,
                    price: currentPrice,
                    timestamp: new Date()
                });
            } else {
                // Telemetry heartbeat
                const targetNetPct = EXIT_CONFIG.INITIAL_TARGET_PCT - ROUND_TRIP_FEE_PCT;
                if (!existingPosition.targetActivated) {
                    if (Math.random() < 0.1) {
                        console.log(`  🔎 [${symbol}] Holding | Net Target: +${(targetNetPct * 100).toFixed(2)}% | Current: ${(netPnlPct * 100).toFixed(2)}% (Profit after 0.15% Fees)`);
                    }
                } else {
                    if (Math.random() < 0.1) {
                        console.log(`  🚀 [${symbol}] Riding (Net P/L: ${(netPnlPct * 100).toFixed(2)}% | Peak: ${(existingPosition.peakProfitPct * 100).toFixed(2)}%)`);
                    }
                }

                signals.push({
                    symbol,
                    action: 'hold',
                    strength: 10,
                    reason: this.ttp.describe(existingPosition.ttpState),
                    price: currentPrice,
                    timestamp: new Date()
                });
            }

        } else {
            // --- EVALUAR NUEVA ENTRADA (ROUND-ROBIN) ---
            
            // ¿Hay slots libres?
            if (this.activePositions.size >= SCALING_CONFIG.MAX_CONCURRENT_PAIRS) {
                return [];
            }

            // Solo abrir si es el par que toca en la rotación o si el scanner lo sugiere
            // Para simplificar, si el loop principal nos pasa un símbolo, lo evaluamos.
            // La rotación real se maneja en el Index o en un loop superior, 
            // pero aquí validamos capital libre.

            const ticker = await exchange.getTicker(symbol); // Polling inicial para entrada (REST OK)
            const balances = await exchange.getBalance();
            const quoteAsset = symbol.split('/')[1];
            const quoteBal = balances.find((b: any) => b.asset === quoteAsset)?.free || 0;

            if (quoteBal >= this.quoteAmount) {
                const dummyStarter: VolumeStarter = {
                    pair: symbol,
                    volume24h: 0, volumeRank: 1, volumeVsAvgRatio: 1.5,
                    spreadPct: (ticker.ask - ticker.bid) / ticker.bid,
                    isPriorityPair: true, momentumPct: 0.01, timestamp: new Date()
                };

                const entryValidation = RiskGuard.validateEntry(dummyStarter, RISK_CONFIG);

                if (entryValidation.allowed) {
                    signals.push({
                        symbol,
                        action: 'buy',
                        strength: 90,
                        reason: `🌊 [DCA_ENTRY] Slot ${this.activePositions.size + 1}/${SCALING_CONFIG.MAX_CONCURRENT_PAIRS}`,
                        price: ticker.ask,
                        suggestedAmount: this.quoteAmount,
                        timestamp: new Date()
                    });
                }
            }
        }

        return signals;
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        const now = Date.now();

        if (signal.action === 'buy') {
            const tradeId = `TRD_${now}_${signal.symbol.replace('/', '')}`;
            
            // 1. Ejecutar orden con RateLimiter
            await this.rateLimiter.waitIfNecessary(RATE_LIMIT_CONFIG.WEIGHTS.CREATE_ORDER);
            const order = await exchange.createOrder({
                symbol: signal.symbol,
                side: 'buy',
                type: 'market',
                amount: signal.suggestedAmount || this.quoteAmount,
                price: signal.price
            });

            if (order) {
                const snapshot: PositionSnapshot & { ttpState: TTPState } = {
                    tradeId,
                    pair: signal.symbol,
                    state: TradeState.ENTERED,
                    entryPrice: order.price || signal.price,
                    currentPrice: order.price || signal.price,
                    peakProfitPct: 0,
                    currentProfitPct: 0,
                    holdDurationMinutes: 0,
                    entryReason: 'ROUND_ROBIN_ENTRY',
                    openedAt: new Date(now),
                    targetActivated: false,
                    trailingArmed: false,
                    ttpState: this.ttp.initState()
                };

                this.activePositions.set(tradeId, snapshot);
                this.saveState();

                // Journal Entry
                this.journal.recordEntry({
                    tradeId,
                    pair: signal.symbol,
                    entryReason: 'ROUND_ROBIN_ENTRY',
                    entryPrice: snapshot.entryPrice,
                    entryTime: snapshot.openedAt.toISOString(),
                    targetActivated: false,
                    trailingArmed: false,
                    peakProfitPct: 0,
                    trailingExitTriggerPct: EXIT_CONFIG.TRAILING_PULLBACK_PCT,
                    feePct: 0.0015,
                    slippagePct: 0,
                    holdDurationMinutes: 0,
                    marketCondition: 'unknown'
                });
            }
            return order;

        } else if (signal.action === 'sell') {
            const pos = Array.from(this.activePositions.values()).find(p => p.pair === signal.symbol);
            if (!pos) return null;

            // En v2.2 obtenemos el balance real para evitar error de cantidad 0
            const balances = await exchange.getBalance();
            const asset = signal.symbol.split('/')[0];
            const balance = balances.find((b: any) => b.asset === asset);
            const qty = balance?.free || 0;

            if (qty <= 0) {
                console.error(`[Strategy] ❌ No hay saldo de ${asset} para vender.`);
                // Si no hay saldo, limpiamos la posición para no quedar en bucle
                this.activePositions.delete(pos.tradeId);
                this.saveState();
                return null;
            }

            // 1. Ejecutar orden con RateLimiter
            await this.rateLimiter.waitIfNecessary(RATE_LIMIT_CONFIG.WEIGHTS.CREATE_ORDER);
            const order = await exchange.createOrder({
                symbol: signal.symbol,
                side: 'sell',
                type: 'market',
                amount: qty, 
                price: signal.price
            });

            if (order) {
                const exitReason: ExitReason = signal.reason.includes('TIMEOUT') ? 'MAX_HOLD_TIMEOUT' : 
                                             signal.reason.includes('TRAILING') ? 'TRAILING_EXIT' : 'MANUAL';

                this.journal.recordExit(pos.tradeId, {
                    exitReason,
                    exitPrice: order.price || signal.price,
                    exitTime: new Date(now).toISOString(),
                    finalProfitPct: pos.currentProfitPct,
                    peakProfitPct: pos.peakProfitPct,
                    holdDurationMinutes: pos.holdDurationMinutes
                });

                this.activePositions.delete(pos.tradeId);
                this.saveState();
            }
            return order;
        }

        return null;
    }

    getMaxPositionSize(portfolio: Portfolio): number { return this.quoteAmount; }

    /**
     * Adopts an existing position (e.g., from startup recovery or manual trade)
     */
    public adoptPosition(pair: string, currentPrice: number) {
        // Check if already tracking this pair
        const existing = Array.from(this.activePositions.values()).find(p => p.pair === pair);
        if (existing) return;

        const tradeId = `RECOVERY_${Date.now()}_${pair.replace('/', '')}`;
        const snapshot: any = {
            tradeId,
            pair,
            state: 'ENTERED',
            entryPrice: currentPrice, // We don't know the real entry, so we use current market price
            currentPrice: currentPrice,
            peakProfitPct: 0,
            currentProfitPct: 0,
            holdDurationMinutes: 0,
            entryReason: 'VOLUME_SPIKE_PRIORITY', // Use a standard reason for UI compatibility
            openedAt: new Date(),
            targetActivated: false,
            trailingArmed: false,
            ttpState: (this as any).ttp.initState()
        };

        this.activePositions.set(tradeId, snapshot);
        this.saveState();
        console.log(`[Strategy] ♻️ Adopted position for ${pair} at ${currentPrice}`);
    }
}
