import * as fs from 'fs';
import * as path from 'path';
import { SCALING_CONFIG } from '../config';
import { Exchange, Order, OrderRequest, Portfolio } from '../exchanges/Exchange';


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
 * Active Scalper Strategy.
 * - Buys trending coins.
 * - Sells at +1.5% profit.
 * - Timeout: If > 45 mins, sells at market (Unstuck).
 * - Stop Loss: -2%.
 */
export class ActiveScalperStrategy implements Strategy {
    name = 'Active Scalper (High Turnover)';
    description = 'Scalps trending coins with Timeout and Stop Loss protection.';
    type: 'dca' = 'dca'; // Fits DCA/Active profile
    isActive = true;
    private hodlModeActive: boolean = false;
    private stateFile: string;
    private highWaterMark: number = 0;
    private highWaterMarkGain: number = 0; // Tracks peak PNL %

    private lastBuyTime: number = 0;
    private lastBuyPrice: number = 0;
    constructor(
        private quoteAmount: number = 0.0105, // Amount in quote asset (e.g. 0.0105 BNB or 10 USDT)
        private exchangeSymbol: string, // e.g. Binance_SOL/BNB
        private profitTargetPercent: number = 0.003, // 0.3%
        private stopLossPercent: number = 0, // Disabled
        private timeoutMinutes: number = 480, // 8hrs
        private feePercent: number = 0.00075 // BNB fee 0.075%
    ) {
        const safeSymbol = exchangeSymbol.replace(/[^a-zA-Z0-9]/g, '_');
        this.stateFile = path.join(process.cwd(), `scalper_state_${safeSymbol}.json`);
        this.loadState();
    }

    private loadState() {
        try {
            if (fs.existsSync(this.stateFile)) {
                const data = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                this.lastBuyPrice = data.lastBuyPrice || 0;
                this.lastBuyTime = data.lastBuyTime || 0;
                this.highWaterMarkGain = data.highWaterMarkGain || 0;
            }
        } catch (e) { }
    }

    private saveState() {
        try {
            fs.writeFileSync(this.stateFile, JSON.stringify({
                lastBuyPrice: this.lastBuyPrice,
                lastBuyTime: this.lastBuyTime,
                highWaterMarkGain: this.highWaterMarkGain,
                updatedAt: new Date().toISOString()
            }, null, 2));
        } catch (e) { }
    }

    public getState() {
        return {
            lastBuyPrice: this.lastBuyPrice,
            lastBuyTime: this.lastBuyTime,
            target: this.lastBuyPrice * (1 + this.profitTargetPercent)
        };
    }

    public setHodlMode(active: boolean) {
        this.hodlModeActive = active;
    }

    /**
     * Calculates the Target Price and Break-Even to ensure REAL profits after fees.
     * Based on user formula: (costo_compra_con_fee * (1 + profit_rate)) / (1 - fee_rate)
     */
    private calculateTargetPrice(purchasePrice: number, netProfitPct: number): { target: number, breakEven: number } {
        const feeRate = this.feePercent;
        const profitRate = netProfitPct;

        // Costo total real de la compra (Precio + Comisión de compra)
        const costoCompraConFee = purchasePrice * (1 + feeRate);

        // Break-Even (Price where net profit is 0%)
        const breakEven = costoCompraConFee / (1 - feeRate);

        // Target Price for desired net profit
        const target = (costoCompraConFee * (1 + profitRate)) / (1 - feeRate);

        return { target, breakEven };
    }

    async analyze(exchange: Exchange, symbol: string): Promise<Signal[]> {
        const quote = symbol.split('/')[1]; // USDT
        const base = symbol.split('/')[0];  // SOL

        // Parallelize data fetching
        const tStart = Date.now();
        const [ticker, balances, openOrders] = await Promise.all([
            exchange.getTicker(symbol),
            exchange.getBalance(),
            exchange.getOpenOrders(symbol)
        ]);
        const tEnd = Date.now();

        if ((tEnd - tStart) > 2000) {
            console.log(`[Perf] ${symbol} Analysis Data Fetch took ${tEnd - tStart}ms`);
        }

        const quoteBal = balances.find((b: any) => b.asset === quote)?.free || 0;
        const baseBal = balances.find((b: any) => b.asset === base)?.free || 0;
        // const openOrders = await exchange.getOpenOrders(symbol); // Already fetched

        const signals: Signal[] = [];
        const now = Date.now();

        // 1. Check Inventory & Stale Orders (TIMEOUT LOGIC)
        const baseValueQuote = baseBal * ticker.bid;
        const minInventoryValue = quote === 'BNB' ? 0.002 : 1; // Lowered to 0.002 BNB (~$1.2) to avoid forgetting positions on small drops
        const hasInventory = baseValueQuote > minInventoryValue; 

        if (hasInventory) {
            const currencyMark = quote === 'BNB' ? '' : '$';
            const currencySuffix = quote === 'BNB' ? ' BNB' : '';

            // FIX: Orphaned Inventory (Restarted Bot or External Buy)
            // If we have inventory but lastBuyTime is 0, we treat it as "Just Bought" to start the timeout clock.
            // MOVED: Must happen before target/break-even calculation to avoid Infinity%
            if (this.lastBuyTime === 0) {
                this.lastBuyTime = now;
                // Ideally we'd know the price, but we don't. Assume current price is entry.
                if (this.lastBuyPrice === 0) this.lastBuyPrice = ticker.last;
                console.log(`[Strategy] Adopted orphaned inventory for ${symbol}. Starting timer...`);
            }

            // OPTIONAL: Break-Even / Target Analysis
            const { target, breakEven } = this.calculateTargetPrice(this.lastBuyPrice, this.profitTargetPercent);

            /* STOP LOSS REMOVED - "Quitar la venta de panico"
            if (!this.hodlModeActive && this.lastBuyPrice > 0 && ticker.bid < this.lastBuyPrice * (1 - this.stopLossPercent)) {
                ...
            }
            */

            // Inventory is handled above

            // Check if we hit Timeout (45 mins)
            // If we have open sell orders, check their age
            // If we have inventory but NO orders, check lastBuyTime
            let timeHeld = 0;
            if (this.lastBuyTime > 0) {
                timeHeld = now - this.lastBuyTime;
            }

            const isTimeout = timeHeld > (this.timeoutMinutes * 60 * 1000);
            const targetPrice = target; // Reuse target calculated above

            // Bypass Timeout sells if it would result in a LOSS or if HODL Mode is ON
            const isAtLoss = ticker.bid < breakEven;

            if (isTimeout && !this.hodlModeActive && !isAtLoss) {
                // Cancel any open sells first? 
                if (openOrders.length > 0) {
                    for (const o of openOrders) {
                        signals.push({
                            symbol,
                            action: 'cancel_replace',
                            strength: 100,
                            reason: `TIMEOUT (${Math.floor(timeHeld / 60000)}m): Cancelling order ${o.id} to Sell at Market`,
                            price: ticker.bid,
                            suggestedAmount: baseBal,
                            timestamp: new Date()
                        });
                    }
                } else {
                    // No open orders, just inventory held too long
                    signals.push({
                        symbol,
                        action: 'sell',
                        strength: 100,
                        reason: `TIMEOUT (${Math.floor(timeHeld / 60000)}m): Unstucking capital. Selling at Market.`,
                        price: ticker.bid,
                        suggestedAmount: baseBal,
                        timestamp: new Date()
                    });
                }
                return signals;
            }

            // === INTEGRATED TRAILING STOP ===
            const pnlPct = this.lastBuyPrice > 0 ? ((ticker.bid - breakEven) / breakEven * 100) : 0;

            if (ticker.bid >= targetPrice) {
                // Tracking is handled by highWaterMarkGain
                const currentGain = pnlPct;
                const ridingTrigger = (this.profitTargetPercent * 100) * 1.20; // 20% excess over target
                
                // Start or update highWaterMark when above trigger
                if (currentGain > ridingTrigger) {
                    this.highWaterMarkGain = Math.max(this.highWaterMarkGain, currentGain);
                    this.saveState();
                }

                // SELL Condition: Fixed 0.10 pp pullback from peak gain
                // e.g. peak = +0.60% → sell if gain falls below 0.60 - 0.10 = 0.50%
                const sellTriggerGain = this.highWaterMarkGain - SCALING_CONFIG.trailingCallbackPct;
                if (this.highWaterMarkGain > ridingTrigger && currentGain < sellTriggerGain) {
                    signals.push({
                        symbol,
                        action: 'sell',
                        strength: 100,
                        reason: `🎯 RIDING EXIT: Peak +${this.highWaterMarkGain.toFixed(3)}% | Now +${currentGain.toFixed(3)}% | Trigger ${sellTriggerGain.toFixed(3)}% (−${SCALING_CONFIG.trailingCallbackPct}pp callback)`,
                        price: ticker.bid,
                        suggestedAmount: baseBal,
                        timestamp: new Date()
                    });
                } else {
                    signals.push({
                        symbol,
                        action: 'hold',
                        strength: 5,
                        reason: `🚀 RIDING${currentGain > ridingTrigger ? ' (Hyper)' : ''}! P/L: +${pnlPct.toFixed(2)}% | Peak: ${this.highWaterMarkGain.toFixed(3)}% | Sell < ${sellTriggerGain.toFixed(3)}%`,
                        price: ticker.bid,
                        timestamp: new Date()
                    });
                }
            } else {
                // Not yet at minimum profit
                signals.push({
                    symbol,
                    action: 'hold',
                    strength: 5,
                    reason: `Holding. P/L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% | Need: +${(this.profitTargetPercent * 100).toFixed(1)}% (${currencyMark}${targetPrice.toFixed(quote === 'BNB' ? 6 : 2)}${currencySuffix})`,
                    price: ticker.bid,
                    timestamp: new Date()
                });
            }

        } else {
            // No Inventory -> Look to BUY
            // Only buy if we have allocated funds
            // (Assuming bot loop checks global allocation, but here we enforce baseAmount)
            // Fix: If we took a tiny loss (e.g. timeout dropped us from $10.00 to $9.98), we should trade with $9.98.
            // Minimum Binance order is $5. We set our absolute floor to $5.50 to be safe.
            // Minimum Binance order: ~10 USDT or 0.01 BNB (Lowered to 0.001 for flexibility)
            const MIN_NOTIONAL = quote === 'BNB' ? 0.001 : 1.0; // Slightly above min for safety
            const availableToSpend = Math.min(quoteBal, this.quoteAmount);

            if (availableToSpend >= MIN_NOTIONAL) {
                // Simple entry: If we are here, the scanner already said it's a good coin.
                // Just buy at market (or generous limit) to get in.
                // Only if no open buy orders
                const buys = openOrders.filter(o => o.side === 'buy');

                if (buys.length === 0) {
                    signals.push({
                        symbol,
                        action: 'buy',
                        strength: 80,
                        reason: `Scalp Entry: Trending Coin.`,
                        price: ticker.ask * 1.001,
                        suggestedAmount: availableToSpend, // Spend BNB amount directly
                        timestamp: new Date()
                    });
                } else {
                    // Check if Buy is stale (5 mins)
                    for (const o of buys) {
                        if ((now - new Date(o.createdAt).getTime()) > 5 * 60 * 1000) {
                            signals.push({
                                symbol,
                                action: 'cancel_replace',
                                strength: 100,
                                reason: `Stale Buy (${o.id}): Repricing...`,
                                price: ticker.ask, // New price
                                suggestedAmount: availableToSpend / ticker.ask,
                                timestamp: new Date()
                            });
                        }
                    }
                }
            } else {
                // Muted: console.log(`[Strategy] Insufficient Balance for ${symbol}: ${quoteBal.toFixed(2)} ${quote}`);
                signals.push({
                    symbol,
                    action: 'hold',
                    strength: 5,
                    reason: `Insufficient Allocation: ${availableToSpend.toFixed(4)} ${quote} < ${MIN_NOTIONAL} (Min). Total Free: ${quoteBal.toFixed(4)}`,
                    price: ticker.last,
                    suggestedAmount: 0,
                    timestamp: new Date()
                });
            }
        }

        return signals;
    }

    async execute(exchange: Exchange, signal: Signal): Promise<Order | null> {
        if (signal.action === 'buy') {
            this.lastBuyTime = Date.now();
            this.lastBuyPrice = signal.price;
            this.saveState();
        }

        // Logic check: If reason contains 'TIMEOUT' or 'STOP LOSS', use MARKET order
        const isEmergency = signal.reason.includes('TIMEOUT') || signal.reason.includes('STOP LOSS') || signal.reason.includes('Stale Buy');
        const type = isEmergency ? 'market' : 'limit';

        // If it's a Limit Buy, be aggressive? Or just Market.
        // For Scalping, Market is preferred for Entry to ensure we catch the move.
        // Let's use Market for Buy and Limit for Target Sell.
        // Unless it's a Stale Reprice, then Market.

        // Final decision:
        // Buy: Market (Speed)
        // Sell (Target): Limit
        // Sell (Timeout/Stop): Market

        // SAFETY GUARD: Binance rejects orders below minimum notional
        // For BUY, suggestedAmount is already in Quote asset (BNB).
        // For SELL, suggestedAmount is in Base asset (e.g. DOT), so we multiply by price.
        const orderNotional = signal.action === 'buy' ? (signal.suggestedAmount || 0) : (signal.suggestedAmount || 0) * signal.price;
        const quoteAsset = signal.symbol.split('/')[1];
        const MIN_NOTIONAL_EXEC = quoteAsset === 'BNB' ? 0.010 : 5.0; // Subido a 0.010 para ADA/BNB y pares Top
        if (orderNotional < MIN_NOTIONAL_EXEC) {
            console.log(`[Strategy] Skipping ${signal.action.toUpperCase()} ${signal.symbol}: Notional ${orderNotional.toFixed(4)} ${quoteAsset} < ${MIN_NOTIONAL_EXEC} (dust)`);
            // Reset state if it was a stale inventory entry
            if (signal.action === 'sell') {
                this.lastBuyPrice = 0;
                this.lastBuyTime = 0;
                this.highWaterMarkGain = 0;
                this.saveState();
            }
            return null;
        }

        // LIVE BALANCE CHECK (before BUY): Prevents race condition where 2 bots
        // both analyzed the same BNB balance and try to spend it simultaneously.
        if (signal.action === 'buy') {
            try {
                const liveBalances = await exchange.getBalance();
                const quoteAssetName = signal.symbol.split('/')[1];
                const liveBal = liveBalances.find((b: any) => b.asset === quoteAssetName);
                const liveQuoteFree = liveBal ? liveBal.free : 0;
                if (liveQuoteFree < this.quoteAmount) {
                    console.log(`[Strategy] ⏸ Skipping BUY ${signal.symbol}: Live balance ${liveQuoteFree.toFixed(6)} ${quoteAssetName} < ${this.quoteAmount} needed. Waiting for funds.`);
                    return null;
                }
            } catch (e) {
                // If balance check fails, proceed anyway (conservative)
            }
        }

        return exchange.createOrder({
            symbol: signal.symbol,
            side: signal.action as 'buy' | 'sell',
            type: 'market',
            amount: signal.suggestedAmount || 0,
            price: signal.price  // Needed for quoteOrderQty calculation on market buys
        });
    }

    getMaxPositionSize(portfolio: Portfolio): number { return this.quoteAmount; }
    getStopLoss(entry: number): number { return entry * (1 - this.stopLossPercent); }
    getTakeProfit(entry: number): number { return entry * (1 + this.profitTargetPercent); }
}
