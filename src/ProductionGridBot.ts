import { BinanceExchange } from './exchanges/BinanceExchange';
import { ActiveScalperStrategy } from './strategies/StrategyEngine';
import { DashboardServer } from './DashboardServer';
import { AsyncTradeDB } from './AsyncTradeDB';
import { MarketScanner } from './MarketScanner';
import { TradeLogger } from './TradeLogger';
import { broadcastToDashboard } from './ws-server';
import { SCALING_CONFIG } from './config/ScalingConfig';
import { SELECTION_CONFIG } from './config/SelectionConfig';
const { PAIR_PRIORITY_LIST } = SELECTION_CONFIG;

export interface BotConfig {
    baseAsset: string;
    pairCount: number;
    targetProfit: number;
    commissionRate: number;
    orderSizeBNB: number;
    wsEnabled: boolean;
    trailingStop: {
        basePercent: number;
        volatilityMultiplier: number;
    };
    maxConcurrentPairs: number;
    scanIntervalMs: number;
}

interface ActiveBot {
    symbol: string;
    strategy: ActiveScalperStrategy;
    startTime: number;
    instanceId: number;
}

/**
 * ProductionGridBot: High-performance BNB Base Strategy Manager
 */
export class ProductionGridBot {
    private activeBots: ActiveBot[] = [];
    private dashboard: DashboardServer;
    private tradeLogger: TradeLogger;
    private scanner: MarketScanner;
    private intervals: NodeJS.Timeout[] = [];
    private isRunning = false;

    constructor(
        private exchange: BinanceExchange,
        private db: AsyncTradeDB,
        private config: BotConfig
    ) {
        this.dashboard = new DashboardServer(3334);
        this.tradeLogger = new TradeLogger('./logs');
        this.scanner = new MarketScanner(this.exchange);
    }

    /**
     * Initialize essential services and recover states
     */
    async initialize() {
        this.dashboard.log("🤖 SLAVI Hybrid Bot Initializing...");
        
        // Start Dashboard
        await this.dashboard.start(this.tradeLogger);
        console.log(`[Dashboard] 🚀 Dashboard Server initialized on port 3334`);
        this.dashboard.log(`🚀 [System] Dashboard Active at http://localhost:3334`);

        // Load History & Stats
        await this.updateDashboardStats();

        // Recovery logic
        await this.startupRecovery();

        // WebSocket Setup
        if (this.config.wsEnabled) {
            this.setupWebSocket();
        }

        // 🧠 Initial prune
        this.exchange.pruneCaches();
    }

    /**
     * Start the execution loops
     */
    async start() {
        if (this.isRunning) return;
        this.isRunning = true;

        this.dashboard.log("✅ Starting Bot Execution Loops...");
        
        // 1. Initial Scan and Boot
        this.runManagerLoop();

        // 2. Fast Strategy Loop (e.g. 5s)
        const fastLoop = setInterval(() => this.runFastIteration(), this.config.scanIntervalMs || 5000);
        this.intervals.push(fastLoop);

        // 3. Manager Loop (5 min) - Rotation & Recycling
        const managerLoop = setInterval(() => this.runManagerLoop(), 5 * 60 * 1000);
        this.intervals.push(managerLoop);

        // 4. Stats Loop (10s)
        const statsLoop = setInterval(() => this.updateDashboardStats(), 10000);
        this.intervals.push(statsLoop);

        // 5. Memory Management (1 hour)
        const pruneLoop = setInterval(() => this.exchange.pruneCaches(), 60 * 60 * 1000);
        this.intervals.push(pruneLoop);

        // 6. Treasury Monitor (15 min) - MXN to BNB Conversion
        const treasuryLoop = setInterval(() => this.checkTreasuryMXN(), 15 * 60 * 1000);
        this.intervals.push(treasuryLoop);
        this.checkTreasuryMXN(); // Initial check

        this.dashboard.log(`✨ [System] All background tasks ready.`);
    }

    /**
     * Clean Shutdown
     */
    async stop() {
        this.isRunning = false;
        this.intervals.forEach(clearInterval);
        this.intervals = [];
        this.dashboard.log("🛑 Bot Stopped Gracefully.");
        await this.dashboard.stop();
    }

    private setupWebSocket() {
        let tickerCount = 0;
        this.exchange.on('ticker', (update) => {
            tickerCount++;
            if (tickerCount % 20 === 0) {
                console.log(`📡 [WS TICKER] ${update.symbol} @ ${update.price}`);
            }
            this.dashboard.updatePrice(update.symbol, update.price);
        });

        // Trailing stops are now handled by ActiveScalperStrategy's TTP logic.
    }

    private async runFastIteration() {
        if (this.activeBots.length === 0) {
            console.log("💤 [Idle] No active bots. Waiting for scanner...");
            return;
        }

        // Summary log
        process.stdout.write(`🔄 [Eval] ${this.activeBots.length} pairs active... `);
        
        await Promise.allSettled(this.activeBots.map(async (bot) => {
            try {
                await this.runBotIteration(bot);
                
                // Backup ticker update if WS missed it
                const ticker = await this.exchange.getTicker(bot.symbol);
                if (ticker && ticker.last) {
                    this.dashboard.updatePrice(bot.symbol, ticker.last);
                }
            } catch (e) { /* ignore iteration errors */ }
        }));
        
        process.stdout.write("Done.\n");
    }

    private async runBotIteration(bot: ActiveBot) {
        try {
            if (bot.strategy.setHodlMode) {
                bot.strategy.setHodlMode(this.dashboard.isHodlModeActive());
            }
            
            const signals = await bot.strategy.analyze(this.exchange, bot.symbol);
            
            // Push full strategy state to Dashboard for each active bot
            const fullState = (bot.strategy as any).getState?.() || {};
            // If strategy has positions array, push each one
            if (fullState.positions && fullState.positions.length > 0) {
                for (const pos of fullState.positions) {
                    this.dashboard.updateStrategyState(pos.pair || bot.symbol, {
                        state: pos.state || 'ACTIVE',
                        status: pos.state || 'ACTIVE',
                        entryPrice: pos.entryPrice || 0,
                        currentPrice: pos.currentPrice || 0,
                        targetPrice: pos.entryPrice ? pos.entryPrice * (1 + this.config.targetProfit) : 0,
                        currentProfitPct: pos.currentProfitPct || 0,
                        peakProfitPct: pos.peakProfitPct || 0,
                        holdDurationMinutes: pos.holdDurationMinutes || 0,
                        targetActivated: pos.targetActivated || false,
                        trailingArmed: pos.trailingArmed || false
                    });
                }
            } else {
                // No active position for this symbol — show as scanning
                this.dashboard.updateStrategyState(bot.symbol, {
                    state: 'SCANNING',
                    status: 'SCANNING',
                    entryPrice: 0,
                    currentPrice: 0,
                    targetPrice: 0,
                    currentProfitPct: 0,
                    peakProfitPct: 0,
                    holdDurationMinutes: 0,
                    targetActivated: false,
                    trailingArmed: false
                });
            }

            // Log signal status occasionally if idle
            if (signals.length === 0 || signals.every(s => s.action === 'hold')) {
                const ticker = await this.exchange.getTicker(bot.symbol).catch(() => null);
                const balances = await this.exchange.getBalance().catch(() => []);
                const quoteAsset = bot.symbol.split('/')[0] || bot.symbol.replace(/BNB$/, '');
                const quoteBalance = balances.find((b: any) => b.asset === quoteAsset)?.free || 0;

                if (Math.random() < 0.15) {
                    const spreadPct = ticker?.bid && ticker?.ask
                        ? ((ticker.ask - ticker.bid) / ticker.bid) * 100
                        : 0;

                    if (Number(quoteBalance) > 0) {
                        // Already covered by Strategy telemetry for active positions
                    } else {
                        console.log(
                            `  🔭 [${bot.symbol}] Scanning | Entry Target: +${(this.config.targetProfit * 100).toFixed(2)}% | ` +
                            `Spread: ${spreadPct.toFixed(3)}%`
                        );
                    }
                }
            }

            for (const s of signals) {
                if (s.strength > 0) {
                    console.log(`🎯 [Signal] ${bot.symbol}: ${s.action.toUpperCase()} (${s.reason})`);
                    (this.dashboard as any).logStrategy(`🤖 [${bot.symbol}#${bot.instanceId}] Signal: ${s.action.toUpperCase()} - ${s.reason}`);
                }

                if (s.action === 'hold') continue;

                if (s.action === 'buy' || s.action === 'sell') {
                    if (s.action === 'buy') {
                        console.log(`[Order Calc] Symbol: ${s.symbol} | Executing BUY with Quote Amount: ${s.suggestedAmount?.toFixed(8)} BNB`);
                    }
                    this.dashboard.log(`💰 [${bot.symbol}#${bot.instanceId}] EXECUTING: ${s.action.toUpperCase()} - ${s.reason}`);
                    const order = await bot.strategy.execute(this.exchange, s);
                    
                    if (order) {
                        await this.db.insertTrade({
                            timestamp: new Date().toISOString(),
                            exchange: 'Binance',
                            symbol: s.symbol,
                            side: order.side.toUpperCase() as 'BUY' | 'SELL',
                            price: order.price || s.price,
                            amount: order.amount,
                            total: (order.price || s.price) * order.amount,
                            status: order.status,
                            orderId: order.id
                        });
                        
                        // Position tracking is handled by ActiveScalperStrategy internally.
                    }
                } else if ((s.action as any) === 'cancel_replace') {
                    const matchId = s.reason.match(/order ([a-zA-Z0-9_\-]+)/i) || s.reason.match(/\(([a-zA-Z0-9_\-]+)\)/);
                    const orderId = matchId ? matchId[1] : null;
                    if (orderId) {
                        try { await this.exchange.cancelOrder(orderId, s.symbol); } catch (e) { }
                    }
                    this.dashboard.log(`💰 [${bot.symbol}#${bot.instanceId}] REPLACING: ${s.reason}`);
                    await bot.strategy.execute(this.exchange, s);
                }
            }
        } catch (e: any) {
            console.error(`[Bot Error] ${bot.symbol}:`, e.message);
            // 🛡️ Pausa de seguridad para evitar bucles infinitos agresivos
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    private async runManagerLoop() {
        console.log("\n🔭 [Scanner] Scanning Market for top BNB pairs...");
        this.dashboard.log("🔭 Scanning Market for Opportunities (Top Volume)...");
        
        // --- 1. Build the ordered pair candidate list ---
        // Get live top-volume pairs from the exchange
        const livePairs = await this.scanner.getTopTrending(this.config.pairCount || 10);
        const liveSymbols = livePairs.map(p => p.symbol);

        // Merge: priority list first (normalized), then any live pairs not already in priority list
        const normalizedPriority = PAIR_PRIORITY_LIST.map(p => p.includes('/') ? p : `${p}/BNB`);
        const mergedSymbols = [
            ...normalizedPriority,
            ...liveSymbols.filter(s => !normalizedPriority.includes(s))
        ];

        // Connect WebSocket only to the candidates we're interested in
        (this.exchange as any).connectWebSocket(mergedSymbols.slice(0, 12));

        // Prune active bots that are no longer in the candidate list
        this.activeBots = this.activeBots.filter(bot => mergedSymbols.includes(bot.symbol));

        // --- 2. Capital-Tier Slot Calculation ---
        const balances = await this.exchange.getBalance();
        const bnbBal = balances.find(b => b.asset === 'BNB');
        const freeBNB = bnbBal ? bnbBal.free : 0;

        const targetSlots = this.calculateTargetSlots(freeBNB);
        const currentSlots = this.activeBots.length;
        const slotsToFill = Math.max(0, targetSlots - currentSlots);

        console.log(`💰 [Capital] Free BNB: ${freeBNB.toFixed(6)} | Tier Slots: ${targetSlots} | Active: ${currentSlots} | To Spawn: ${slotsToFill}`);

        if (targetSlots === 0) {
            console.log(`💤 [Idle] No active bots. Waiting for more capital (need ${SCALING_CONFIG.SLOT_THRESHOLDS[0].MIN_CAPITAL_BNB} BNB min)`);
        }

        // --- 3. Spawn new bots from priority list to fill available slots ---
        let spawned = 0;
        for (const symbol of mergedSymbols) {
            if (spawned >= slotsToFill) break;
            if (this.activeBots.find(b => b.symbol === symbol)) continue; // Already active

            console.log(`✅ [Spawn] Activating bot for ${symbol}...`);
            this.activeBots.push({
                symbol,
                strategy: new ActiveScalperStrategy(
                    this.config.orderSizeBNB,
                    `Binance_${symbol}_1`
                ),
                startTime: Date.now(),
                instanceId: 1
            });
            spawned++;
        }

        this.dashboard.updateManagerStatus(`Running (${this.activeBots.length} bots | ${targetSlots} slots | ${freeBNB.toFixed(4)} BNB)`);
        
        // --- 4. Recycle off-strategy assets back to BNB ---
        await this.autoLiquidateAssets(mergedSymbols.slice(0, 12));
    }

    /**
     * Returns the number of trade slots allowed at the given capital level.
     * Uses the tier table from SCALING_CONFIG.
     */
    private calculateTargetSlots(freeBNB: number): number {
        let slots = 0;
        for (const tier of SCALING_CONFIG.SLOT_THRESHOLDS) {
            if (freeBNB >= tier.MIN_CAPITAL_BNB) slots = tier.slots;
        }
        return Math.min(slots, this.config.maxConcurrentPairs);
    }

    private async autoLiquidateAssets(validSymbols: string[]) {
        // 🚫 DESACTIVADO EN v2.2: El reciclaje automático de assets destruye la estrategia DCA.
        // En Refined Riding, las posiciones se mantienen congeladas hasta que alcanzan el target (+0.3%) 
        // o se activa el Trailing Take-Profit. ¡Nunca se venden a mercado sin una señal de ganancia!
        return;
    }

    private async updateDashboardStats() {
        try {
            const balances = await this.exchange.getBalance();
            this.dashboard.updateAllBalances('Binance', balances, true);
            
            const bnb = balances.find(b => b.asset === 'BNB');
            if (bnb) broadcastToDashboard({ capital: bnb.free.toFixed(6) });
            
            const prices = new Map<string, number>();
            try {
                // Fetch key prices for accurate portfolio calculation
                const pairs = ['BNBUSDT', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOTUSDT', 'ADAUSDT'];
                for (const pair of pairs) {
                    try {
                        const ticker = await this.exchange.getTicker(pair);
                        prices.set(pair, ticker.last);
                        prices.set(pair.replace('USDT', ''), ticker.last);
                    } catch (e) {}
                }
            } catch (err) {}

            this.dashboard.recalculateTotalPortfolio(prices);

            // --- SYNC REAL TRADES FROM DB ---
            const recentTrades = await this.db.getRecentTrades(20);
            this.dashboard.updateRecentTrades(recentTrades);

            // --- SYNC PNL STATS FROM DB ---
            const stats = await this.db.getStats();
            this.dashboard.updateTradeStats(stats as any);

            // Full sync to feed advanced components
            broadcastToDashboard({ stats: (this.dashboard as any).stats });
        } catch (error) {
            console.error('[Bot] Error updating dashboard stats:', error);
        }
    }

    private async startupRecovery() {
        console.log("🧹 [Recovery] Running Startup Position Recovery...");
        try {
            const balances = await this.exchange.getBalance();
            const bnbPrice = (await this.exchange.getTicker('BNBUSDT').catch(() => ({ last: 600 }))).last;

            for (const bal of balances) {
                if (bal.asset === 'BNB' || bal.asset === 'USDT' || bal.asset === 'MXN') continue;
                if (bal.free <= 0) continue;

                // Value check: only recover if worth more than ~$1 USD
                const symbol = `${bal.asset}/BNB`;
                const ticker = await this.exchange.getTicker(symbol).catch(() => null);
                if (!ticker) continue;

                const valueBNB = bal.free * ticker.last;
                const valueUSD = valueBNB * bnbPrice;

                if (valueUSD > 1.0) {
                    console.log(`🧹 [Recovery] Found ${bal.free} ${bal.asset} (~$${valueUSD.toFixed(2)}). Recovering...`);
                    
                    // 1. Ensure a bot exists for this pair
                    let bot = this.activeBots.find(b => b.symbol === symbol);
                    if (!bot) {
                        bot = {
                            symbol,
                            strategy: new ActiveScalperStrategy(this.config.orderSizeBNB, `Binance_${symbol}_1`),
                            startTime: Date.now(),
                            instanceId: 1
                        };
                        this.activeBots.push(bot);
                    }

                    // 2. Adopt position in the strategy
                    if (bot.strategy && (bot.strategy as any).adoptPosition) {
                        (bot.strategy as any).adoptPosition(symbol, ticker.last);
                    }
                }
            }
            this.dashboard.log(`✅ [Recovery] Startup scan complete. Active slots: ${this.activeBots.length}`);
        } catch (e: any) {
            console.error(`[Recovery Error]`, e.message);
        }
    }

    /**
     * Treasury Monitor: Automatically converts MXN deposits to BNB
     */
    private async checkTreasuryMXN() {
        const thresholdMXN = 200;
        try {
            const balances = await this.exchange.getBalance();
            const mxnBal = balances.find(b => b.asset === 'MXN');
            const freeMXN = mxnBal ? mxnBal.free : 0;

            if (freeMXN >= thresholdMXN) {
                console.log(`[Tesorería] 💸 Detected ${freeMXN.toFixed(2)} MXN. Converting to BNB...`);
                this.dashboard.log(`🏦 [Treasury] Detected ${freeMXN.toFixed(2)} MXN. Inverting into BNB...`);

                try {
                    const order = await this.exchange.createOrder({
                        symbol: 'BNBMXN',
                        side: 'buy',
                        type: 'market',
                        amount: freeMXN
                    });
                    console.log(`[Tesorería] ✅ Conversion successful. Order: ${order.id}`);
                    this.dashboard.log(`✅ [Treasury] BNBMXN order ${order.id} executed.`);
                    
                    await this.db.insertTrade({
                        timestamp: new Date().toISOString(),
                        exchange: 'Binance',
                        symbol: 'BNBMXN',
                        side: 'BUY',
                        price: order.price,
                        amount: order.amount,
                        total: order.price * order.amount,
                        status: order.status,
                        orderId: order.id
                    });
                } catch (err: any) {
                    if (err.message.includes('Invalid symbol') || err.message.includes('not found')) {
                        console.log(`[Tesorería] ⚠️ BNBMXN not available. Using USDT bridge...`);
                        this.dashboard.log(`⚠️ BNBMXN not found. Using USDT bridge (MXN->USDT->BNB)...`);
                        
                        // MXN -> USDT
                        const order1 = await this.exchange.createOrder({
                            symbol: 'USDTMXN',
                            side: 'buy',
                            type: 'market',
                            amount: freeMXN
                        });
                        console.log(`[Tesorería] Step 1: MXN -> USDT successful. Order: ${order1.id}`);
                        
                        await this.db.insertTrade({
                            timestamp: new Date().toISOString(),
                            exchange: 'Binance',
                            symbol: 'USDTMXN',
                            side: 'BUY',
                            price: order1.price,
                            amount: order1.amount,
                            total: order1.price * order1.amount,
                            status: order1.status,
                            orderId: order1.id
                        });

                        await new Promise(r => setTimeout(r, 2000)); // Wait for settlement

                        // USDT -> BNB
                        const balances2 = await this.exchange.getBalance();
                        const usdt = balances2.find(b => b.asset === 'USDT');
                        if (usdt && usdt.free > 5) {
                            const order2 = await this.exchange.createOrder({
                                symbol: 'BNBUSDT',
                                side: 'buy',
                                type: 'market',
                                amount: usdt.free
                            });
                            console.log(`[Tesorería] Step 2: USDT -> BNB successful. Order: ${order2.id}`);
                            this.dashboard.log(`✅ [Treasury] Bridge conversion completed successfully.`);

                            await this.db.insertTrade({
                                timestamp: new Date().toISOString(),
                                exchange: 'Binance',
                                symbol: 'BNBUSDT',
                                side: 'BUY',
                                price: order2.price,
                                amount: order2.amount,
                                total: order2.price * order2.amount,
                                status: order2.status,
                                orderId: order2.id
                            });
                        }
                    } else {
                        throw err;
                    }
                }
                
                // Force an immediate stats update to show the new BNB balance
                await this.updateDashboardStats();
            }
        } catch (e: any) {
            console.error(`[Tesorería Error]`, e.message);
            this.dashboard.log(`❌ [Treasury Error] Auto-investment failed: ${e.message}`);
        }
    }
}
