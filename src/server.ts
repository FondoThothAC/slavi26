
import express from 'express';
import path from 'path';
import { BitsoClient } from './api';
import { AgentController } from './AgentController';
import { BinanceExchange } from './exchanges/BinanceExchange';
import { config } from './config';

const app = express();
const port = 3001;
const client = new BitsoClient();
const binance = new BinanceExchange(config.binance.key, config.binance.secret);
const controller = new AgentController(client);

app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// --- General API ---

app.get('/api/balance', async (req, res) => {
    try {
        // Fetch both independently - don't let one failure kill everything
        let bitsoBalances: any[] = [];
        let binanceBalances: any[] = [];

        // Bitso (may fail if keys are bad or API down)
        try {
            const bitsoData = await client.getBalance();
            if (bitsoData?.payload?.balances) {
                bitsoBalances = bitsoData.payload.balances.map((b: any) => ({
                    ...b,
                    provider: 'bitso'
                }));
            } else if (bitsoData?.payload && Array.isArray(bitsoData.payload)) {
                bitsoBalances = bitsoData.payload.map((b: any) => ({
                    ...b,
                    provider: 'bitso'
                }));
            }
        } catch (e: any) {
            console.warn("Bitso balance fetch failed (non-fatal):", e.message);
        }

        // Binance
        try {
            const bnbData = await binance.getBalance();
            binanceBalances = bnbData.map(b => ({
                currency: b.asset.toLowerCase(),
                available: b.free.toString(),
                locked: b.locked.toString(),
                total: b.total.toString(),
                provider: 'binance'
            }));
        } catch (e: any) {
            console.warn("Binance balance fetch failed (non-fatal):", e.message);
        }

        const combined = [...bitsoBalances, ...binanceBalances];

        res.json({
            success: true,
            payload: combined
        });
    } catch (error: any) {
        console.error("Balance Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Binance Trade History ---
app.get('/api/binance/trades', async (req, res) => {
    try {
        const symbol = (req.query.symbol as string) || 'FETBNB';
        const limit = parseInt(req.query.limit as string) || 20;
        const data = await (binance as any).getMyTrades(symbol, limit);
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- Binance Open Orders ---
app.get('/api/binance/orders', async (req, res) => {
    try {
        const orders = await binance.getOpenOrders();
        res.json(orders);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- P&L Calculation Helpers ---
async function calculateExchangePnl(exchange: any, pairs: string[], days: number) {
    const now = Date.now();
    const startTime = now - (days * 24 * 60 * 60 * 1000);
    let totalPnl = 0;
    let tradeCount = 0;
    const byAsset: Record<string, { pnl: number, trades: number }> = {};

    for (const symbol of pairs) {
        try {
            let trades = [];
            if (exchange instanceof BinanceExchange) {
                trades = await exchange.getMyTrades(symbol, 500);
            } else {
                trades = await (exchange as BitsoClient).getUserTrades(symbol, 200);
            }

            const recent = trades.filter((t: any) => {
                const time = t.time || new Date(t.created_at).getTime();
                return time >= startTime;
            });

            for (const t of recent) {
                tradeCount++;
                const qty = parseFloat(t.qty || t.major);
                const price = parseFloat(t.price);
                const fee = parseFloat(t.commission || t.fees_amount || 0);
                const isBuyer = t.isBuyer !== undefined ? t.isBuyer : (t.side === 'buy');

                // Determine base asset (e.g., BTC from BTCUSDT or btc_usd)
                let baseAsset = symbol.replace('BNB', '').replace('_usd', '').toLowerCase();
                if (!byAsset[baseAsset]) byAsset[baseAsset] = { pnl: 0, trades: 0 };

                let pnlChange = 0;
                if (isBuyer) {
                    pnlChange = -(qty * price + fee);
                } else {
                    pnlChange = (qty * price - fee);
                }
                
                totalPnl += pnlChange;
                byAsset[baseAsset].pnl += pnlChange;
                byAsset[baseAsset].trades += 1;
            }
        } catch (e) { /* skip pair/error */ }
    }
    return { pnl: totalPnl, trades: tradeCount, byAsset };
}

// --- Binance P&L ---
app.get('/api/binance/pnl', async (req, res) => {
    try {
        const pairs = ['FETBNB', 'SOLBNB', 'DOTBNB', 'XRPBNB', 'ADABNB', 'SUIBNB'];
        
        const pnl24h = await calculateExchangePnl(binance, pairs, 1);
        const pnl7d = await calculateExchangePnl(binance, pairs, 7);
        const pnl30d = await calculateExchangePnl(binance, pairs, 30);

        // Get BNB price for USD conversion
        let bnbPrice = 640;
        try {
            const ticker = await binance.getTicker('BNBUSDT');
            bnbPrice = ticker.last;
        } catch (e) { /* use default */ }

        res.json({
            bnb_price: bnbPrice,
            periods: {
                "24h": { pnl_bnb: pnl24h.pnl, pnl_usd: pnl24h.pnl * bnbPrice, trades: pnl24h.trades, byAsset: pnl24h.byAsset },
                "7d": { pnl_bnb: pnl7d.pnl, pnl_usd: pnl7d.pnl * bnbPrice, trades: pnl7d.trades, byAsset: pnl7d.byAsset },
                "30d": { pnl_bnb: pnl30d.pnl, pnl_usd: pnl30d.pnl * bnbPrice, trades: pnl30d.trades, byAsset: pnl30d.byAsset }
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// --- Bitso P&L ---
app.get('/api/bitso/pnl', async (req, res) => {
    try {
        const pairs = ['btc_usd', 'xrp_usd', 'eth_usd', 'sol_usd', 'ltc_usd'];
        
        const pnl24h = await calculateExchangePnl(client, pairs, 1);
        const pnl7d = await calculateExchangePnl(client, pairs, 7);
        const pnl30d = await calculateExchangePnl(client, pairs, 30);

        res.json({
            periods: {
                "24h": { pnl_usd: pnl24h.pnl, trades: pnl24h.trades, byAsset: pnl24h.byAsset },
                "7d": { pnl_usd: pnl7d.pnl, trades: pnl7d.trades, byAsset: pnl7d.byAsset },
                "30d": { pnl_usd: pnl30d.pnl, trades: pnl30d.trades, byAsset: pnl30d.byAsset }
            }
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/ticker', async (req, res) => {
    try {
        const book = req.query.book as string || 'btc_usd';
        const ticker = await client.getTicker(book);
        res.json(ticker);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// --- Agents API ---

// Create Agent
app.post('/api/agents', (req, res) => {
    const { type, config } = req.body;
    try {
        const agentStatus = controller.createAgent(type, config);
        res.json(agentStatus);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// List Agents
app.get('/api/agents', (req, res) => {
    const agents = controller.getAllAgents();
    res.json(agents);
});

// Agent Action (Pause/Resume/Stop)
app.post('/api/agents/:id/:action', (req, res) => {
    const { id, action } = req.params;

    if (action === 'pause') controller.pauseAgent(id);
    else if (action === 'resume') controller.resumeAgent(id);
    else if (action === 'stop') controller.stopAgent(id);
    else return res.status(400).json({ error: "Invalid action" });

    const agent = controller.getAgent(id);
    if (!agent) return res.status(404).json({ error: "Agent not found" });

    res.json(agent.getStatus());
});

// Delete Agent
app.delete('/api/agents/:id', (req, res) => {
    const result = controller.deleteAgent(req.params.id);
    if (result) res.json({ success: true });
    else res.status(404).json({ error: "Agent not found" });
});

// --- Backtest API ---
// Lazy load to avoid circular deps if any, or just import at top
import { BacktestEngine } from './backtest/BacktestEngine';
import { MakerMaker } from './strategies/maker_maker';
import { MakerTaker } from './strategies/maker_taker';
import { ElevadorChino } from './strategies/elevador_chino';
import { TriangularArbitrage } from './strategies/triangular_arbitrage';

app.post('/api/backtest', async (req, res) => {
    const { strategy, book, start, end, amount, spread } = req.body;
    // start/end as timestamps or strings?
    // start/end as timestamps or strings? 
    // Defaults: Jan 1 2025 to Nov 30 2025
    const startTime = start ? new Date(start).getTime() : new Date('2025-01-01').getTime();
    const endTime = end ? new Date(end).getTime() : new Date('2025-11-30').getTime();

    const engine = new BacktestEngine();

    let StrategyClass;
    switch (strategy) {
        case 'maker-maker': StrategyClass = MakerMaker; break;
        case 'maker-taker': StrategyClass = MakerTaker; break;
        case 'elevador-chino': StrategyClass = ElevadorChino; break;
        case 'triangular-arbitrage': StrategyClass = TriangularArbitrage; break;
        default: return res.status(400).json({ error: "Unknown strategy" });
    }

    // FETCH LOGIC
    // If triangular, we need 3 books.
    if (strategy === 'triangular-arbitrage') {
        // Hardcoded path for demo: btc_usd, eth_btc, eth_usd
        await engine.fetchHistory('btc_usd', 86400, startTime, endTime);
        await engine.fetchHistory('eth_btc', 86400, startTime, endTime);
        await engine.fetchHistory('eth_usd', 86400, startTime, endTime);
    } else {
        await engine.fetchHistory(book || 'btc_usd', 86400, startTime, endTime);
    }

    try {
        const results = await engine.run(StrategyClass, { book: book || 'btc_usd', amount: amount || '10', spread: spread || 0.5 });
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
