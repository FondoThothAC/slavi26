import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';

interface BalanceInfo {
    asset: string;
    free: number;
    locked: number;
    total: number;
    usdValue?: number;
}

interface ExchangeData {
    name: string;
    connected: boolean;
    error?: string;
    balances: BalanceInfo[];
    activeOrders: number;
    openOrdersList?: any[];
    orderBook?: { bids: any[], asks: any[] };
    lastUpdate: Date;
}

interface TradeStats {
    tradeCount: number;
    totalBuys: string;
    totalSells: string;
    netProfit: string;
    profitPercent: string;
}

interface ActivePairState {
    pair: string;
    state: string;
    entryPrice: number;
    currentPrice: number;
    currentProfitPct: number;
    peakProfitPct: number;
    targetProfitPct?: number;
    trailingStopActive: boolean;
    trailingThresholdPct: number;
    holdDurationMinutes: number;
    lastUpdate: Date;
}

interface OpenOrder {
    orderId: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    type: string;
    price: number;
    origQty: number;
    executedQty: number;
    status: string;
    time: number;
}

interface GlobalKPIs {
    winRate: number;
    profitFactor: number;
    avgHoldTimeMinutes: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    avgProfitPerWin: number;
    avgLossPerLose: number;
}

export class DashboardServer {
    private port = 3334;
    private stats: any = {
        status: 'LIVE',
        startTime: new Date(),
        exchanges: {} as Record<string, ExchangeData>,
        logs: [] as string[],
        strategyLogs: [] as string[],
        tradeStats: {
            tradeCount: 0,
            totalBuys: '0.00',
            totalSells: '0.00',
            netProfit: '0.00',
            profitPercent: '0.00'
        } as TradeStats,
        totalPortfolioValue: '0.00',
        totalPortfolioBNB: '0.0000',
        totalPortfolioMXN: '0.00',
        availablePortfolioValue: '0.00',
        managerStatus: 'Running',
        strategyStates: {} as Record<string, ActivePairState>,
        activeOrders: [] as OpenOrder[],
        globalKPIs: {
            winRate: 0, profitFactor: 0, avgHoldTimeMinutes: 0, maxDrawdownPct: 0,
            sharpeRatio: 0, totalTrades: 0, winningTrades: 0, losingTrades: 0,
            avgProfitPerWin: 0, avgLossPerLose: 0
        } as GlobalKPIs,
        priceHistory: [] as { timestamp: number; exchange: string; price: number; marker?: 'buy' | 'sell' }[],
        recentTrades: [] as any[],
        hodlMode: false,
        portfolioHistory: [] as { timestamp: number; value: number }[]
    };
    private logsDir: string;
    private priceHistoryFile: string;
    private portfolioHistoryFile: string;
    private lastPortfolioSnapshot = 0;
    private app: any;
    private server: any;
    private io: any;
    private lastBroadcast = 0;

    constructor(port = 3334) {
        this.port = port;
        this.logsDir = path.join(process.cwd(), 'logs');
        this.priceHistoryFile = path.join(this.logsDir, 'price_history.json');
        this.portfolioHistoryFile = path.join(this.logsDir, 'portfolio_history.json');

        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }

        this.loadPriceHistory();
        this.loadPortfolioHistory();

        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, { cors: { origin: "*", methods: ["GET", "POST"] } });

        this.setupRoutes();
        this.setupSockets();
    }

    public async start(tradeLogger?: any) {
        return new Promise<void>((resolve, reject) => {
            this.server.listen(this.port, '0.0.0.0', () => {
                console.log(`[Dashboard] 🚀 Dashboard Server Active at http://localhost:${this.port}`);
                resolve();
            });

            this.server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.error(`[Dashboard] ❌ Port ${this.port} is already in use.`);
                    reject(err);
                } else {
                    reject(err);
                }
            });
        });
    }

    public async stop(): Promise<void> {
        if (this.io) this.io.close();
        return new Promise((resolve) => {
            if (this.server) this.server.close(() => resolve());
            else resolve();
        });
    }

    private loadPriceHistory() {
        try {
            if (fs.existsSync(this.priceHistoryFile)) {
                const data = JSON.parse(fs.readFileSync(this.priceHistoryFile, 'utf8'));
                this.stats.priceHistory = data.priceHistory || [];
            }
        } catch (e) { }
    }

    private savePriceHistory() {
        try {
            fs.writeFileSync(this.priceHistoryFile, JSON.stringify({
                priceHistory: this.stats.priceHistory.slice(-500)
            }));
        } catch (e) { }
    }

    private loadPortfolioHistory() {
        try {
            if (fs.existsSync(this.portfolioHistoryFile)) {
                const data = JSON.parse(fs.readFileSync(this.portfolioHistoryFile, 'utf8'));
                this.stats.portfolioHistory = data.portfolioHistory || [];
            }
        } catch (e) { }
    }

    private savePortfolioHistory() {
        try {
            fs.writeFileSync(this.portfolioHistoryFile, JSON.stringify({
                portfolioHistory: this.stats.portfolioHistory.slice(-500)
            }));
        } catch (e) { }
    }

    private recordPortfolioSnapshot(totalUSD: number) {
        this.stats.portfolioHistory.push({ timestamp: Date.now(), value: totalUSD });
        if (this.stats.portfolioHistory.length > 500) this.stats.portfolioHistory.shift();
        this.savePortfolioHistory();
    }

    recalculateTotalPortfolio(prices?: Map<string, number>) {
        let totalUSD = 0;
        if (prices) {
            prices.forEach((price, symbol) => {
                this.stats.priceHistory.push({ timestamp: Date.now(), exchange: symbol, price: price });
            });
            if (this.stats.priceHistory.length > 1000) this.stats.priceHistory = this.stats.priceHistory.slice(-1000);
        }

        const historyCopy = [...this.stats.priceHistory].reverse();
        const getPrice = (symbol: string) => {
            if (prices?.has(symbol)) return prices.get(symbol)!;
            const hist = historyCopy.find((p: any) => 
                p.exchange === symbol || 
                p.exchange === `${symbol}USDT` || 
                p.exchange === `${symbol}/USDT` ||
                p.exchange === `USDT${symbol}`
            );
            return hist ? hist.price : 0;
        };

        const bnbPrice = getPrice('BNBUSDT') || getPrice('BNB');
        const mxnUsd = 1 / (getPrice('USDMXN') || getPrice('MXNUSD') || 19.50);

        for (const exName of Object.keys(this.stats.exchanges)) {
            const ex = this.stats.exchanges[exName];
            if (ex && ex.balances) {
                ex.balances.forEach((b: BalanceInfo) => {
                    let assetUsd = 0;
                    if (['USD','USDT','USDC','BUSD','FDUSD'].includes(b.asset)) assetUsd = b.total;
                    else if (b.asset === 'MXN') assetUsd = b.total * mxnUsd;
                    else if (b.asset === 'BNB') assetUsd = b.total * bnbPrice;
                    else {
                        const direct = historyCopy.find(p => p.exchange === `${b.asset}USDT` || p.exchange === `${b.asset}USD`);
                        if (direct) assetUsd = b.total * direct.price;
                        else {
                            const bnbPair = historyCopy.find(p => p.exchange === `${b.asset}BNB`);
                            if (bnbPair) assetUsd = b.total * bnbPair.price * bnbPrice;
                            else {
                                const anyP = getPrice(b.asset);
                                if (anyP > 0) assetUsd = b.total * anyP;
                            }
                        }
                    }
                    b.usdValue = assetUsd;
                    totalUSD += assetUsd;
                });
            }
        }

        this.stats.totalPortfolioValue = totalUSD.toFixed(2);
        this.stats.totalPortfolioBNB = (bnbPrice > 0 ? totalUSD / bnbPrice : 0).toFixed(4);
        this.stats.totalPortfolioMXN = (mxnUsd > 0 ? totalUSD / mxnUsd : 0).toFixed(2);
        this.stats.availablePortfolioValue = totalUSD.toFixed(2);

        // Record portfolio snapshot every 5 minutes
        const now = Date.now();
        if (now - this.lastPortfolioSnapshot > 5 * 60 * 1000) {
            this.lastPortfolioSnapshot = now;
            this.recordPortfolioSnapshot(totalUSD);
        }

        this.broadcastState();
    }

    private setupRoutes() {
        this.app.get('/api/stats', (req: any, res: any) => res.json(this.stats));
        this.app.get('/api/toggle-hodl', (req: any, res: any) => {
            this.stats.hodlMode = !this.stats.hodlMode;
            res.json({ hodlMode: this.stats.hodlMode });
            this.broadcastState();
        });
        this.app.get('/api/logs', (req: any, res: any) => {
            const logPath = path.join(this.logsDir, 'bot.log');
            if (fs.existsSync(logPath)) res.download(logPath);
            else res.status(404).send('No logs');
        });
        this.app.get('/', (req: any, res: any) => res.send(this.getEnhancedHtml()));
    }

    private setupSockets() {
        this.io.on('connection', (socket: any) => socket.emit('state', this.stats));
    }

    private broadcastState() {
        const now = Date.now();
        if (now - this.lastBroadcast < 1000) return;
        this.lastBroadcast = now;
        this.io.emit('state', this.stats);
    }

    isHodlModeActive(): boolean { return this.stats.hodlMode; }
    updateManagerStatus(status: string) { this.stats.managerStatus = status; this.broadcastState(); }
    updateAllBalances(exchangeName: string, balances: BalanceInfo[], connected: boolean = true) {
        this.stats.exchanges[exchangeName] = { name: exchangeName, connected, balances, activeOrders: 0, lastUpdate: new Date() };
        this.recalculateTotalPortfolio();
    }
    updateRecentTrades(trades: any[]) { this.stats.recentTrades = trades; this.broadcastState(); }
    updateTradeStats(stats: TradeStats) { this.stats.tradeStats = stats; this.broadcastState(); }
    updateActivePairState(pair: string, state: ActivePairState) { this.stats.strategyStates[pair] = state; this.broadcastState(); }
    updateStrategyState(pair: string, state: any) { this.stats.strategyStates[pair] = state; this.broadcastState(); }
    updateActiveOrders(orders: OpenOrder[]) { this.stats.activeOrders = orders; this.broadcastState(); }
    updateGlobalKPIs(kpis: GlobalKPIs) { this.stats.globalKPIs = kpis; this.broadcastState(); }
    updatePrice(exchange: string, price: number) {
        this.stats.priceHistory.push({ timestamp: Date.now(), exchange, price });
        if (this.stats.priceHistory.length > 500) this.stats.priceHistory.shift();
        this.broadcastState();
    }
    log(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.stats.logs.unshift(`[${timestamp}] ${message}`);
        if (this.stats.logs.length > 50) this.stats.logs.pop();
        this.broadcastState();
    }
    logStrategy(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.stats.strategyLogs.unshift(`[${timestamp}] ${message}`);
        if (this.stats.strategyLogs.length > 50) this.stats.strategyLogs.pop();
        this.broadcastState();
    }

    private getEnhancedHtml(): string {
        const uptime = Math.floor((Date.now() - new Date(this.stats.startTime).getTime()) / 60000);
        const hodl = this.stats.hodlMode;
        const trades = this.stats.recentTrades || [];
        const activePairs = Object.values(this.stats.strategyStates) as ActivePairState[];
        const activeOrders = this.stats.activeOrders || [];

        const activePairsRows = Object.entries(this.stats.strategyStates || {}).map(
          ([pair, s]: [string, any]) => {
            const entry = Number(s?.entryPrice || 0);
            const current = Number(s?.currentPrice || 0);
            
            // Multiplicamos por 100 asumiendo que el bot envía valores decimales (ej. -0.0015 = -0.15%)
            // Si el bot ya los envía multiplicados por 100, entonces quita los * 100 de abajo
            const currentProfitPct = (Number(s?.currentProfitPct || 0)) * 100;
            const peakProfitPct = (Number(s?.peakProfitPct || 0)) * 100;
            const holdMinutes = Number(s?.holdDurationMinutes || 0);
            
            // El target neto es 0.35% (0.50% bruto - 0.15% comisiones)
            const targetProfitPct = 0.35;

            // Delta = Target - Current. Ej: 0.15 - (-0.15) = 0.30 (Falta un 0.30% para llegar)
            const deltaToTargetPct = targetProfitPct - currentProfitPct;

            const pnlColor =
              currentProfitPct > 0 ? 'var(--green)' :
              currentProfitPct < 0 ? 'var(--red)' :
              'var(--muted)';

            // Delta color: Verde si falta poco o ya se pasó, amarillo/naranja si falta regular, rojo si falta mucho
            const deltaColor =
              deltaToTargetPct <= 0 ? 'var(--green)' : 
              deltaToTargetPct <= 0.15 ? 'var(--yellow)' : 'var(--red)';

            const stateLabel =
              s?.status ||
              s?.state ||
              (entry > 0 ? 'ACTIVE' : 'SCANNING');

            return `
              <tr>
                <td><strong>${pair}</strong></td>
                <td style="color: var(--accent)">${stateLabel}</td>
                <td>${entry > 0 ? entry.toFixed(6) : '—'}</td>
                <td>${current > 0 ? current.toFixed(6) : '—'}</td>
                <td>+${targetProfitPct.toFixed(2)}%</td>
                <td style="color:${pnlColor}">${currentProfitPct.toFixed(2)}%</td>
                <td style="color:${deltaColor}">
                  ${deltaToTargetPct > 0 ? '+' : ''}${deltaToTargetPct.toFixed(2)}%
                </td>
                <td style="color:${peakProfitPct >= 0 ? 'var(--green)' : 'var(--red)'}">
                  ${peakProfitPct.toFixed(2)}%
                </td>
                <td>${holdMinutes.toFixed(1)}m</td>
              </tr>
            `;
          }
        ).join('');

        const priceHistory = Array.isArray(this.stats.priceHistory) ? this.stats.priceHistory : [];
        
        const activePairKeys = Object.keys(this.stats.strategyStates || {});
        const primaryPair = activePairKeys.find((k) => {
          const s = this.stats.strategyStates[k];
          return Number(s?.entryPrice || 0) > 0;
        }) || 'BNBUSDT';

        const normalizedPrimaryPair = String(primaryPair).split('/').join('').toUpperCase();

        const mainSeries = priceHistory
          .filter((p: any) => String(p.exchange || '').split('/').join('').toUpperCase() === normalizedPrimaryPair)
          .map((p: any) => ({
            x: p.timestamp,
            y: Number(p.price),
            marker: p.marker || null
          }))
          .sort((a: any, b: any) => a.x - b.x);

        const lineData = mainSeries.filter((p: any) => !p.marker).map((p: any) => ({ x: p.x, y: p.y }));
        const buyMarkers = mainSeries.filter((p: any) => p.marker === 'buy').map((p: any) => ({ x: p.x, y: p.y }));
        const sellMarkers = mainSeries.filter((p: any) => p.marker === 'sell').map((p: any) => ({ x: p.x, y: p.y }));

        return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>SLAVI TERMINAL v2.2</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;700;900&display=swap" rel="stylesheet">
    <style>
        :root { --bg: #020617; --card: rgba(15, 23, 42, 0.6); --accent: #00d2ff; --green: #10b981; --red: #f43f5e; --yellow: #f59e0b; --text: #f8fafc; --muted: #94a3b8; --border: rgba(255,255,255,0.08); }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 2rem; min-height: 100vh; background-image: radial-gradient(circle at top right, #1e293b, #020617); }
        
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 2.5rem; }
        .brand h1 { font-size: 2.2rem; font-weight: 900; letter-spacing: -1px; background: linear-gradient(to right, #fff, var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .portfolio-main { font-size: 3rem; font-weight: 900; margin-top: 0.5rem; }
        
        .stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
        .pill { background: var(--card); border: 1px solid var(--border); border-radius: 1.2rem; padding: 1.2rem; backdrop-filter: blur(10px); text-align: center; }
        .pill-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 2px; color: var(--muted); margin-bottom: 0.5rem; }
        .pill-value { font-size: 1.6rem; font-weight: 700; }

        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin-bottom: 1.5rem; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 1.5rem; padding: 1.8rem; backdrop-filter: blur(15px); box-shadow: 0 20px 50px -12px rgba(0,0,0,0.5); }
        .card-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
        
        .chart-box { height: 350px; width: 100%; margin-top: 1rem; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th { text-align: left; padding: 1rem; color: var(--muted); font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: rgba(15, 23, 42, 0.9); }
        td { padding: 1rem; border-bottom: 1px solid var(--border); font-size: 0.95rem; }
        .row-buy { color: var(--green); font-weight: 700; }
        .row-sell { color: var(--red); font-weight: 700; }
        
        .terminal { height: 300px; overflow-y: auto; background: rgba(0,0,0,0.4); border-radius: 1rem; padding: 1rem; font-family: monospace; font-size: 0.85rem; color: #cbd5e1; line-height: 1.6; border: 1px solid var(--border); }
        .btn { padding: 0.8rem 1.5rem; border-radius: 0.8rem; border: none; font-weight: 700; cursor: pointer; transition: 0.3s; }
        .btn-hodl { background: ${hodl ? 'var(--red)' : 'rgba(255,255,255,.1)'}; color: #fff; }
        
        .status-dot { height: 8px; width: 8px; background: var(--green); border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 10px var(--green); }
        .grid-wide { grid-template-columns: 2fr 1fr; }
        .grid-full { grid-column: span 2; }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">
            <h1>SLAVI TERMINAL v2.2</h1>
            <div class="portfolio-main">$${this.stats.totalPortfolioValue} <span style="font-size: 1rem; color: var(--muted);">USD</span></div>
            <div style="color: var(--muted); margin-top: 0.5rem; font-weight: 600;">${this.stats.totalPortfolioBNB} BNB · ${this.stats.totalPortfolioMXN} MXN</div>
        </div>
        <div style="display: flex; gap: 1rem; align-items: start;">
            <button class="btn btn-hodl" onclick="fetch('/api/toggle-hodl').then(()=>location.reload())">
                ${hodl ? '🛑 HODL MODE ACTIVE' : '🔓 TRADING ACTIVE'}
            </button>
            <a class="btn" style="background:rgba(255,255,255,.06);color:var(--text);text-decoration:none" href="/api/logs" target="_blank">📄 Logs</a>
        </div>
    </div>

    <div class="stats-bar">
        <div class="pill"><div class="pill-label">Uptime</div><div class="pill-value">${uptime}m</div></div>
        <div class="pill"><div class="pill-label">Market Status</div><div class="pill-value" style="color: var(--green)"><span class="status-dot"></span>LIVE</div></div>
        <div class="pill"><div class="pill-label">Trades (Total)</div><div class="pill-value">${this.stats.tradeStats.tradeCount}</div></div>
        <div class="pill"><div class="pill-label">Net ROI</div><div class="pill-value" style="color: ${parseFloat(this.stats.tradeStats.netProfit) >= 0 ? 'var(--green)' : 'var(--red)'}">${this.stats.tradeStats.profitPercent}%</div></div>
    </div>

    <div class="grid grid-full">
        <div class="card">
            <div class="card-title">⚡ ACTIVE PAIRS & DELTA <span style="color:var(--muted);font-size:.8rem">${Object.keys(this.stats.strategyStates).length} slots</span></div>
            <div style="overflow-x: auto;">
                <table>
                    <thead>
                        <tr>
                            <th>Pair</th>
                            <th>State</th>
                            <th>Entry</th>
                            <th>Current</th>
                            <th>Net Target</th>
                            <th>Net P/L</th>
                            <th>Delta to Target</th>
                            <th>Peak P/L</th>
                            <th>Hold</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${activePairsRows || '<tr><td colspan="9" style="text-align: center; color: var(--muted);">🔍 Escáner buscando oportunidades...</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="grid grid-wide">
        <div class="card">
            <div class="card-title">📈 PRICE PERFORMANCE (${primaryPair})</div>
            <div class="chart-box"><canvas id="mainChart"></canvas></div>
        </div>
        <div class="card">
            <div class="card-title">💰 ASSET BALANCES</div>
            <div style="max-height: 350px; overflow-y: auto;">
                <table>
                    <thead><tr><th>Asset</th><th>Total</th><th>Value USD</th></tr></thead>
                    <tbody>
                        ${Object.values(this.stats.exchanges).flatMap((ex: any) =>
                            ex.balances.filter((b: any) => b.total > 0).map((b: any) => `
                                <tr>
                                    <td><strong style="color: var(--accent)">${b.asset}</strong></td>
                                    <td>${b.total.toFixed(b.asset === 'MXN' ? 2 : 6)}</td>
                                    <td style="color: var(--muted)">$${(b.usdValue || 0).toFixed(2)}</td>
                                </tr>
                            `)
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <div class="grid grid-full">
        <div class="card">
            <div class="card-title">📈 CAPITAL EVOLUTION (USD)</div>
            <div class="chart-box"><canvas id="capitalChart"></canvas></div>
        </div>
    </div>

    <div class="grid">
        <div class="card grid-full">
            <div class="card-title">📜 RECENT TRANSACTIONS (TRADES.DB)</div>
            <div style="max-height: 300px; overflow-y: auto;">
            <table>
                <thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Price</th><th>Amount</th><th>Total USD</th></tr></thead>
                <tbody>
                    ${trades.slice().reverse().slice(0, 20).map((t: any) => `
                        <tr>
                            <td style="color: var(--muted)">${new Date(t.timestamp).toLocaleTimeString()}</td>
                            <td><strong>${t.symbol}</strong></td>
                            <td class="${t.side === 'BUY' ? 'row-buy' : 'row-sell'}">${t.side}</td>
                            <td>$${t.price}</td>
                            <td>${t.amount}</td>
                            <td><strong>$${t.total.toFixed(2)}</strong></td>
                        </tr>
                    `).join('')}
                    ${trades.length === 0 ? '<tr><td colspan="6" style="text-align: center; color: var(--muted);">No recent trades</td></tr>' : ''}
                </tbody>
            </table>
            </div>
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <div class="card-title">🖥️ SYSTEM LOGS</div>
            <div class="terminal">${this.stats.logs.map((l: string) => `<div>${l}</div>`).join('')}</div>
        </div>
        <div class="card">
            <div class="card-title">🧠 STRATEGY ENGINE</div>
            <div class="terminal">${this.stats.strategyLogs.map((l: string) => `<div>${l}</div>`).join('')}</div>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        socket.on('state', (state) => {
            if (performance.now() > 300000) { location.reload(); return; }
        });
        setTimeout(() => { location.reload(); }, 30000);

        const ctx = document.getElementById('mainChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: '${primaryPair} Price (USD)',
                        data: ${JSON.stringify(lineData)},
                        borderColor: '#00d2ff',
                        backgroundColor: 'rgba(0, 210, 255, 0.1)',
                        fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2
                    },
                    {
                        label: 'Buy', data: ${JSON.stringify(buyMarkers)},
                        type: 'scatter', backgroundColor: '#10b981', pointRadius: 6, pointStyle: 'triangle'
                    },
                    {
                        label: 'Sell', data: ${JSON.stringify(sellMarkers)},
                        type: 'scatter', backgroundColor: '#f43f5e', pointRadius: 6, pointStyle: 'rectRot'
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    x: { type: 'linear', grid: { display: false }, ticks: { color: '#94a3b8', callback: v => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } },
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
                },
                plugins: { legend: { display: false } }
            }
        });

        const ctxCap = document.getElementById('capitalChart').getContext('2d');
        const capHistory = ${JSON.stringify(this.stats.portfolioHistory.map((p: any) => ({ x: p.timestamp, y: p.value })))};
        new Chart(ctxCap, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Portfolio Value (USD)',
                    data: capHistory,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { type: 'linear', display: false },
                    y: { beginAtZero: false, ticks: { color: '#10b981' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    </script>
</body>
</html>`;
    }
}
