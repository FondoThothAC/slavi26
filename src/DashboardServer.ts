import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { telegram } from './utils/TelegramManager';
import { broadcastToDashboard } from './ws-server';

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

/**
 * Enhanced SLAVI Dashboard Server
 * Features: Real-time all-coin balances, CSV export, trade history
 */
export class DashboardServer {
    private port = 3333;
    private stats: any = {
        status: 'BOOTING',
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
        totalPortfolioValue: '0.000000',
        availablePortfolioValue: '0.000000',
        managerStatus: 'Initializing...',
        strategyStates: {} as Record<string, any>,
        priceHistory: [] as { timestamp: number; exchange: string; price: number; marker?: 'buy' | 'sell' }[],
        recentTrades: [] as any[],
        hodlMode: true // HODL Mode ON by default — only sells at profit target
    };
    private logsDir: string;
    private priceHistoryFile: string;
    private app: any;
    private server: any;
    private io: any;
    private lastBroadcast = 0;

    constructor(port = 3333) {
        this.port = port;
        this.logsDir = path.join(process.cwd(), 'logs');
        this.priceHistoryFile = path.join(this.logsDir, 'price_history.json');

        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
        }

        // Initialize Express + Socket.IO
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server, {
            cors: { origin: "*", methods: ["GET", "POST"] }
        });

        this.setupRoutes();
        this.setupSockets();

        // Load price history from disk
        this.loadPriceHistory();
    }

    private loadPriceHistory() {
        try {
            if (fs.existsSync(this.priceHistoryFile)) {
                const data = JSON.parse(fs.readFileSync(this.priceHistoryFile, 'utf8'));
                this.stats.priceHistory = data.priceHistory || [];
                console.log(`[Dashboard] Loaded ${this.stats.priceHistory.length} price history entries`);
            }
        } catch (e: any) {
            console.error('[Dashboard] Failed to load price history:', e.message);
        }
    }

    private savePriceHistory() {
        try {
            fs.writeFileSync(this.priceHistoryFile, JSON.stringify({
                priceHistory: this.stats.priceHistory.slice(-500) // Keep last 500 entries
            }));
        } catch (e: any) {
            // Silently fail, we don't want to spam logs
        }
    }

    updateTotalPortfolioValue(total: string, available: string) {
        this.stats.totalPortfolioValue = total;
        this.stats.availablePortfolioValue = available;
    }

    updateManagerStatus(status: string) {
        this.stats.managerStatus = status;
    }

    recalculateTotalPortfolio() {
        let totalValue = 0;
        let btcPrice = 0;
        let xrpPrice = 0;
        let ethPrice = 0;
        let solPrice = 0;

        // Try to find price in history (search recent backwards if possible, but find returns first which is oldest if not sorted. Assuming it's latest at the end, find might get the old one. We'll use reverse just in case, but let's stick to existing logic for now, or use reduce/reverse)
        // Wait, priceHistory is pushed to, so the latest is at the end. find() from start gives earliest.
        // Let's use reverse() to get the latest easily
        const historyCopy = [...this.stats.priceHistory].reverse();

        const btcHist = historyCopy.find((p: any) => p.exchange.includes('BTC'));
        if (btcHist) btcPrice = btcHist.price;

        const xrpHist = historyCopy.find((p: any) => p.exchange.includes('XRP'));
        if (xrpHist) xrpPrice = xrpHist.price;

        const ethHist = historyCopy.find((p: any) => p.exchange.includes('ETH'));
        if (ethHist) ethPrice = ethHist.price;

        const solHist = historyCopy.find((p: any) => p.exchange.includes('SOL'));
        if (solHist) solPrice = solHist.price;

        // Sum up balances
        for (const exName of Object.keys(this.stats.exchanges)) {
            const ex = this.stats.exchanges[exName];
            if (ex && ex.balances) {
                ex.balances.forEach((b: BalanceInfo) => {
                    // Stablecoins
                    if (b.asset === 'USD' || b.asset === 'USDT' || b.asset === 'USDC' || b.asset === 'BUSD' || b.asset === 'FDUSD') {
                        totalValue += b.total;
                    }
                    else if (b.asset === 'MXN') {
                        totalValue += b.total / 20.50;
                    }
                    // Crypto
                    else {
                        if (b.asset === 'BTC' && btcPrice > 0) totalValue += b.total * btcPrice;
                        else if (b.asset === 'XRP' && xrpPrice > 0) totalValue += b.total * xrpPrice;
                        else if (b.asset === 'ETH' && ethPrice > 0) totalValue += b.total * ethPrice;
                        else if (b.asset === 'SOL' && solPrice > 0) totalValue += b.total * solPrice;
                    }
                });
            }
        }

        this.stats.totalPortfolioValue = totalValue.toFixed(2);
        this.stats.availablePortfolioValue = totalValue.toFixed(2);
    }

    private setupRoutes() {
        // API Stats
        this.app.get('/api/stats', (req: any, res: any) => {
            res.json(this.stats);
        });

        this.app.get('/api/balances', (req: any, res: any) => {
            res.json(this.stats.exchanges);
        });

        this.app.get('/api/export-csv', async (req: any, res: any) => {
            // Need a way to access tradeLogger. For now, we'll assume it's passed or used via event bus.
            // Simplified for now based on previous logic.
            res.status(500).send('Exporter needs tradeLogger instance');
        });

        this.app.get('/api/logs', (req: any, res: any) => {
            const logPath = path.join(this.logsDir, 'bot.log');
            if (fs.existsSync(logPath)) {
                res.download(logPath, 'slavi_bot.log');
            } else {
                res.status(404).send('No logs yet');
            }
        });

        this.app.get('/api/toggle-hodl', (req: any, res: any) => {
            this.stats.hodlMode = !this.stats.hodlMode;
            console.log(`[Dashboard] HODL Mode is now ${this.stats.hodlMode ? 'ON' : 'OFF'}`);
            res.json({ hodlMode: this.stats.hodlMode });
            this.broadcastState();
        });

        this.app.get('/api/hodl-status', (req: any, res: any) => {
            res.json({ hodlMode: this.stats.hodlMode });
        });

        // Serve Dashboard UI (Production Build)
        const uiPath = path.join(process.cwd(), 'dashboard-ui', 'dist');
        if (fs.existsSync(uiPath)) {
            this.app.use(express.static(uiPath));
            this.app.get(/.*/, (req: any, res: any) => {
                if (!req.url.startsWith('/api')) {
                    res.sendFile(path.join(uiPath, 'index.html'));
                }
            });
        } else {
            // Fallback for when UI is not built
            this.app.get('/', (req: any, res: any) => {
                res.send(this.getEnhancedHtml());
            });
        }
    }

    private setupSockets() {
        this.io.on('connection', (socket: any) => {
            console.log(`[Socket] New connection: ${socket.id}`);
            socket.emit('state', this.stats);
            
            socket.on('disconnect', () => {
                console.log(`[Socket] Disconnected: ${socket.id}`);
            });
        });
    }

    private broadcastState() {
        const now = Date.now();
        if (now - this.lastBroadcast < 1000) return; // Throttle to 1s
        this.lastBroadcast = now;
        this.io.emit('state', this.stats);
    }

    start(tradeLogger?: any) {
        // Allow dynamic export if logger provided
        this.app.get('/api/export-csv-direct', async (req: any, res: any) => {
            if (tradeLogger) {
                const content = await tradeLogger.getCSVContent();
                res.header('Content-Type', 'text/csv');
                res.header('Content-Disposition', 'attachment; filename="slavi_trades.csv"');
                res.send(content);
            } else {
                res.status(500).send('Logger not active');
            }
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`🌍 Dashboard Active at http://localhost:${this.port}`);
            console.log(`📊 WebSocket ready on same port.`);
        });
    }

    public isHodlModeActive(): boolean {
        return this.stats.hodlMode === true;
    }

    /**
     * Update all balances for an exchange
     */
    updateAllBalances(exchangeName: string, balances: BalanceInfo[], connected: boolean = true, error?: string) {
        if (!this.stats.exchanges[exchangeName]) {
            this.stats.exchanges[exchangeName] = {
                name: exchangeName,
                connected: false,
                balances: [],
                activeOrders: 0,
                lastUpdate: new Date()
            };
        }

        this.stats.exchanges[exchangeName].connected = connected;
        this.stats.exchanges[exchangeName].balances = balances;
        this.stats.exchanges[exchangeName].lastUpdate = new Date();
        if (error) {
            this.stats.exchanges[exchangeName].error = error;
        }
        this.broadcastState();
    }

    updateExchangeStats(name: string, balance: any, activeOrders: number, lastPrice: number, openOrdersList: any[] = [], orderBook: any = null) {
        if (!this.stats.exchanges[name]) {
            this.stats.exchanges[name] = {
                name: name,
                connected: true,
                balances: [],
                activeOrders: 0,
                lastUpdate: new Date()
            };
        }
        this.stats.exchanges[name].activeOrders = activeOrders;
        this.stats.exchanges[name].openOrdersList = openOrdersList;
        if (orderBook) this.stats.exchanges[name].orderBook = orderBook;
        this.stats.exchanges[name].lastUpdate = new Date();

        // Legacy single balance update
        if (balance && balance.asset) {
            const existing = this.stats.exchanges[name].balances.find((b: BalanceInfo) => b.asset === balance.asset);
            if (existing) {
                existing.free = balance.free;
                existing.locked = balance.locked || 0;
                existing.total = balance.total || balance.free;
            } else {
                this.stats.exchanges[name].balances.push(balance);
            }
        }
        this.broadcastState();
    }

    updateRecentTrades(trades: any[]) {
        this.stats.recentTrades = trades;
        this.broadcastState();
    }

    updateTradeStats(stats: TradeStats) {
        this.stats.tradeStats = stats;
        this.broadcastState();
    }

    updateSentiment(sentiment: any) {
        this.stats.aiSentiment = sentiment;
    }

    updateStrategyState(exchange: string, state: any) {
        this.stats.strategyStates[exchange] = state;
    }

    updatePrice(exchange: string, price: number) {
        this.stats.priceHistory.push({
            timestamp: Date.now(),
            exchange,
            price
        });
        // console.log(`[Dashboard] Price Update: ${exchange} $${price}`);
        // Keep last 500 entries to match persistence
        if (this.stats.priceHistory.length > 500) {
            this.stats.priceHistory.shift();
        }
        // Save to disk every 10 updates (to avoid too many writes)
        if (this.stats.priceHistory.length % 10 === 0) {
            this.savePriceHistory();
        }
        this.broadcastState();
    }

    addTradeMarker(exchange: string, type: 'buy' | 'sell', price: number) {
        this.stats.priceHistory.push({
            timestamp: Date.now(),
            exchange,
            price,
            marker: type
        });
    }

    log(message: string) {
        console.log(`[Bot] ${message}`);
        const timestamp = new Date().toLocaleTimeString();
        this.stats.logs.unshift(`[${timestamp}] ${message}`);
        if (this.stats.logs.length > 100) this.stats.logs.pop();

        // Also write to file
        const logLine = `[${new Date().toISOString()}] ${message}\n`;
        const logPath = path.join(this.logsDir, 'bot.log');
        fs.appendFileSync(logPath, logLine);
        this.broadcastState();
        broadcastToDashboard({ log: message });
    }

    logStrategy(message: string) {
        console.log(`[Strategy] ${message}`);
        const timestamp = new Date().toLocaleTimeString();
        this.stats.strategyLogs.unshift(`[${timestamp}] ${message}`);
        if (this.stats.strategyLogs.length > 100) this.stats.strategyLogs.pop();
        this.broadcastState();
        broadcastToDashboard({ log: `[Strategy] ${message}` });
    }

    private getRecentTradesHtml(): string {
        if (!this.stats.recentTrades || this.stats.recentTrades.length === 0) {
            return `
                <div class="card" style="margin-top: 20px;">
                    <h3 style="color: #0088ff; margin-bottom: 10px;">📜 Historial de Transacciones</h3>
                    <p style="color:#888;">No hay transacciones recientes.</p>
                </div>
            `;
        }
        
        const rows = [...this.stats.recentTrades].reverse().map((t: any) => `
            <tr>
                <td style="color:#888;">${new Date(t.timestamp).toLocaleTimeString()}</td>
                <td><strong>${t.symbol}</strong></td>
                <td style="color: ${t.side === 'BUY' ? '#00ff88' : '#ff4444'}; font-weight: bold;">${t.side}</td>
                <td>$${t.price}</td>
                <td>${t.amount}</td>
                <td><strong>$${t.total.toFixed(2)}</strong></td>
            </tr>
        `).join('');

        return `
            <div class="card" style="margin-top: 20px;">
                <h3 style="color: #0088ff; margin-bottom: 10px;">📜 Historial de Transacciones (Últimas 15)</h3>
                <div class="balance-table-wrapper">
                    <table class="balance-table" style="font-size: 0.9em;">
                        <thead>
                            <tr><th>Hora</th><th>Par</th><th>Lado</th><th>Precio</th><th>Monto</th><th>Total</th></tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    private getEnhancedHtml() {
        const uptime = Math.floor((Date.now() - new Date(this.stats.startTime).getTime()) / 60000);

        // Build exchange cards with ALL balances
        let exchangeCards = '';
        for (const exName of Object.keys(this.stats.exchanges)) {
            const ex = this.stats.exchanges[exName];

            let balanceRows = '';
            if (ex.balances && ex.balances.length > 0) {
                // Filter only non-zero balances
                const activeBalances = ex.balances.filter((b: BalanceInfo) => b.total > 0);

                if (activeBalances.length > 0) {
                    balanceRows = activeBalances.map((b: BalanceInfo) => `
                        <tr>
                            <td><strong>${b.asset}</strong></td>
                            <td>${b.free.toFixed(6)}</td>
                            <td>${b.locked.toFixed(6)}</td>
                            <td><strong>${b.total.toFixed(6)}</strong></td>
                        </tr>
                    `).join('');
                } else {
                    balanceRows = '<tr><td colspan="4" style="text-align:center; color:#666;">No active balances found (all 0.00)</td></tr>';
                }
            } else {
                balanceRows = '<tr><td colspan="4">No balances loaded</td></tr>';
            }

            const statusColor = ex.connected ? '#00ff88' : '#ff4444';
            const statusText = ex.connected ? '● Connected' : '✗ ' + (ex.error || 'Disconnected');

            let ordersHtml = '';
            if (ex.openOrdersList && ex.openOrdersList.length > 0) {
                const rows = ex.openOrdersList.map((o: any) => `
                    <tr>
                         <td>${o.side.toUpperCase()}</td>
                         <td>${o.price}</td>
                         <td>${o.amount}</td>
                         <td>${new Date(o.createdAt).toLocaleTimeString()}</td>
                    </tr>
                `).join('');

                ordersHtml = `
                    <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                        <h4 style="color: #00ff88; margin-bottom: 5px;">Active Orders (${ex.openOrdersList.length})</h4>
                        <table class="balance-table" style="font-size: 0.9em;">
                            <thead>
                                <tr><th>Side</th><th>Price</th><th>Amount</th><th>Time</th></tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                `;
            } else {
                ordersHtml = `<div style="margin-top: 10px; font-size: 0.9em; color: #666;">No active orders</div>`;
            }

            let marketBookHtml = '';
            if (ex.orderBook) {
                const bids = ex.orderBook.bids.slice(0, 5).map((o: any) => {
                    const price = parseFloat(o.price);
                    const amount = parseFloat(o.amount);
                    return `<div style="color:#00ff88">${isNaN(price) ? '-' : price.toFixed(5)} (${isNaN(amount) ? '-' : amount.toFixed(2)})</div>`;
                }).join('');
                const asks = ex.orderBook.asks.slice(0, 5).map((o: any) => {
                    const price = parseFloat(o.price);
                    const amount = parseFloat(o.amount);
                    return `<div style="color:#ff4444">${isNaN(price) ? '-' : price.toFixed(5)} (${isNaN(amount) ? '-' : amount.toFixed(2)})</div>`;
                }).join('');

                marketBookHtml = `
                    <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                        <h4 style="color: #aaa; margin-bottom: 5px;">Market Order Book</h4>
                        <div style="display:flex; justify-content:space-between; font-size:0.85em;">
                            <div style="width:48%">
                                <div style="border-bottom:1px solid #333; margin-bottom:2px;">BIDS (Buy)</div>
                                ${bids}
                            </div>
                            <div style="width:48%; text-align:right;">
                                <div style="border-bottom:1px solid #333; margin-bottom:2px;">ASKS (Sell)</div>
                                ${asks}
                            </div>
                        </div>
                    </div>
                `;
            }

            exchangeCards += `
                <div class="card exchange-card">
                    <div class="card-header">
                        <h2>${exName}</h2>
                        <span style="color: ${statusColor}">${statusText}</span>
                    </div>
                    <div class="balance-table-wrapper">
                        <table class="balance-table">
                            <thead>
                                <tr>
                                    <th>Asset</th>
                                    <th>Available</th>
                                    <th>Locked</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${balanceRows}
                            </tbody>
                        </table>
                    </div>
                    ${ordersHtml}
                    ${marketBookHtml}
                    <div class="card-footer">
                        Last Update: ${new Date(ex.lastUpdate).toLocaleTimeString()}
                    </div>
                </div>
            `;
        }

        if (!exchangeCards) {
            exchangeCards = '<div class="card"><p>No exchanges connected yet...</p></div>';
        }

        let strategyHtml = '';
        const exchanges = Object.keys(this.stats.strategyStates);
        for (const exName of exchanges) {
            const s = this.stats.strategyStates[exName];
            if (!s) continue;

            const hasPosition = s.lastBuy && s.lastBuy > 0;
            const pct = hasPosition ? ((s.current - s.lastBuy) / s.lastBuy) * 100 : 0;
            const color = hasPosition ? (pct >= 0 ? '#00ff88' : '#ff4444') : '#888';

            strategyHtml += `
            <div class="card" style="border: 1px solid ${color};">
                <h3 style="color: ${color}; margin-bottom: 10px;">🎯 ${exName}: Active Strategy Cycle</h3>
                <div class="stats-grid">
                     <div class="stat-box">
                        <div class="stat-label">Last Buy</div>
                        <div class="stat-value">${hasPosition ? '$' + s.lastBuy.toFixed(4) : '---'}</div>
                     </div>
                     <div class="stat-box">
                        <div class="stat-label">Target Sell</div>
                        <div class="stat-value">${hasPosition ? '$' + s.target.toFixed(4) : '---'}</div>
                     </div>
                     <div class="stat-box">
                        <div class="stat-label">Current Price</div>
                        <div class="stat-value" style="color:${color}">$${(s.current || 0).toFixed(4)}</div>
                     </div>
                     <div class="stat-box">
                        <div class="stat-label">Distance</div>
                        <div class="stat-value">${hasPosition ? pct.toFixed(2) + '%' : '---'}</div>
                     </div>
                </div>
                <div style="margin-top: 10px; font-size: 0.9em; text-align: center; color: #888;">
                     Status: <span style="color: #fff; font-weight: bold;">${s.status}</span>
                </div>
            </div>
            `;
        }

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>🤖 SLAVI Trading Bot</title>
            <meta charset="UTF-8">
            <meta http-equiv="refresh" content="30">
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { 
                    font-family: 'Segoe UI', Tahoma, sans-serif; 
                    background: linear-gradient(135deg, #0d0d0d 0%, #1a1a2e 100%); 
                    color: #fff; 
                    min-height: 100vh;
                    padding: 20px;
                }
                .header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                h1 { color: #0088ff; font-size: 2em; }
                .status-bar { 
                    display: flex; 
                    gap: 20px; 
                    background: rgba(0,136,255,0.1); 
                    padding: 10px 20px; 
                    border-radius: 10px;
                }
                .status-item { text-align: center; }
                .status-value { font-size: 1.5em; font-weight: bold; color: #0088ff; }
                .portfolio-val { font-size: 1.8em; color: white; font-weight: bold; margin-left: 20px; }
                
                .card { 
                    background: rgba(45,45,45,0.9); 
                    border-radius: 15px; 
                    padding: 20px; 
                    margin-bottom: 20px; 
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .card-header { 
                    display: flex; 
                    justify-content: space-between; 
                    align-items: center; 
                    margin-bottom: 15px;
                    border-bottom: 1px solid rgba(255,255,255,0.1);
                    padding-bottom: 10px;
                }
                .card-footer { 
                    margin-top: 15px; 
                    font-size: 0.85em; 
                    color: #888; 
                }
                
                .grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); 
                    gap: 20px; 
                }
                
                .balance-table-wrapper { max-height: 300px; overflow-y: auto; }
                .balance-table { 
                    width: 100%; 
                    border-collapse: collapse; 
                }
                .balance-table th, .balance-table td { 
                    padding: 8px 12px; 
                    text-align: left; 
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .balance-table th { 
                    background: rgba(0,136,255,0.1); 
                    color: #0088ff;
                    position: sticky;
                    top: 0;
                }
                .balance-table tr:hover { background: rgba(255,255,255,0.05); }
                
                .log-box { 
                    height: 300px; 
                    overflow-y: auto; 
                    background: #000; 
                    padding: 15px; 
                    border-radius: 10px;
                    font-family: 'Courier New', monospace; 
                    font-size: 0.85em; 
                    color: #aaa; 
                    line-height: 1.6;
                    border: 1px solid #333;
                }
                .log-title { color: #888; margin-bottom: 5px; font-weight: bold; }
                .log-entry-system { color: #aaa; }
                .log-entry-strategy { color: #00ff88; }
                .log-box div { margin-bottom: 3px; }
                
                .btn { 
                    display: inline-block;
                    padding: 10px 20px; 
                    background: linear-gradient(135deg, #0088ff, #0055aa);
                    color: #fff; 
                    text-decoration: none; 
                    border-radius: 8px;
                    font-weight: bold;
                    margin-right: 10px;
                    margin-top: 10px;
                    transition: transform 0.2s;
                    border: none;
                    cursor: pointer;
                }
                .btn:hover { transform: scale(1.05); }
                .btn-secondary { background: linear-gradient(135deg, #444, #666); color: #fff; }
                .btn-hodl-off { background: linear-gradient(135deg, #666, #444); color: #ccc; }
                .btn-hodl-on { background: linear-gradient(135deg, #ff4444, #aa0000); color: #fff; animation: pulse 2s infinite; }
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0.7); }
                    70% { box-shadow: 0 0 0 10px rgba(255, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(255, 68, 68, 0); }
                }
                
                .stats-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
                    gap: 15px; 
                    margin-top: 15px;
                }
                .stat-box { 
                    background: rgba(0,0,0,0.3); 
                    padding: 15px; 
                    border-radius: 10px; 
                    text-align: center;
                }
                .stat-label { color: #888; font-size: 0.85em; }
                .stat-value { font-size: 1.5em; font-weight: bold; margin-top: 5px; }
                .profit-positive { color: #00ff88; }
                .profit-negative { color: #ff4444; }
                .chart-container { position: relative; height: 300px; width: 100%; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="display:flex; align-items:center;">
                    <h1>🚀 SLAVI BNB Production Suite</h1>
                    <div class="portfolio-val" style="display:flex; flex-direction:column; line-height:1.2;">
                        <span>Total: $${this.stats.totalPortfolioValue} USD</span>
                        <span style="font-size:0.8em; color:#888;">Disponible: $${this.stats.availablePortfolioValue} USD</span>
                    </div>
                </div>
                <div class="status-bar">
                    <div class="status-item">
                        <div class="status-value">${uptime}m</div>
                        <div>Uptime</div>
                    </div>
                    <div class="status-item">
                        <div class="status-value" style="color: #0f0;">● ONLINE</div>
                        <div>Status</div>
                    </div>
                    <div class="status-item">
                        <div class="status-value" style="color: ${telegram.isEnabled() ? '#0f0' : '#888'};">
                            ${telegram.isEnabled() ? '🔔 ACTIVE' : '🔕 OFF'}
                        </div>
                        <div>Telegram</div>
                    </div>
                    <div class="status-item">
                        <div class="status-value">${this.stats.tradeStats.tradeCount}</div>
                        <div>Trades</div>
                    </div>
                </div>
            </div>
            
            ${strategyHtml}
            
            <!-- Trade Stats -->
            <div class="card">
                <h3>📊 Trading Statistics</h3>
                <div class="stats-grid">
                    <div class="stat-box">
                        <div class="stat-label">Total Buys</div>
                        <div class="stat-value">$${this.stats.tradeStats.totalBuys}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Total Sells</div>
                        <div class="stat-value">$${this.stats.tradeStats.totalSells}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">Net P/L</div>
                        <div class="stat-value ${parseFloat(this.stats.tradeStats.netProfit) >= 0 ? 'profit-positive' : 'profit-negative'}">
                            $${this.stats.tradeStats.netProfit}
                        </div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-label">ROI</div>
                        <div class="stat-value ${parseFloat(this.stats.tradeStats.profitPercent) >= 0 ? 'profit-positive' : 'profit-negative'}">
                            ${this.stats.tradeStats.profitPercent}%
                        </div>
                    </div>
                </div>
                
                <div class="chart-container">
                    <canvas id="profitChart"></canvas>
                </div>

                ${this.stats.aiSentiment ? `
                <div style="margin-top: 20px; padding: 15px; background: rgba(0,0,255,0.1); border-left: 4px solid #0088ff; border-radius: 5px;">
                    <h4 style="color: #0088ff; margin-bottom: 5px;">🧠 AI Insight (${this.stats.aiSentiment.model})</h4>
                    <div style="font-size: 1.2em; font-weight: bold; margin-bottom: 5px;">
                        ${this.stats.aiSentiment.sentiment} 
                        <span style="font-size: 0.8em; color: #888;">(Score: ${this.stats.aiSentiment.score})</span>
                    </div>
                    <div style="font-style: italic; color: #ccc;">"${this.stats.aiSentiment.reasoning}"</div>
                    
                    ${this.stats.aiSentiment.news && this.stats.aiSentiment.news.length > 0 ? `
                    <details style="margin-top: 10px; color: #aaa; font-size: 0.9em;">
                        <summary style="cursor: pointer; outline: none;">See ${this.stats.aiSentiment.news.length} Analyzed Headlines</summary>
                        <ul style="margin-top: 5px; padding-left: 20px; list-style-type: none;">
                            ${this.stats.aiSentiment.news.map((n: any) => `
                                <li style="margin-bottom: 5px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 3px;">
                                    ${n.title} 
                                    <span style="font-size:0.8em; color:#0088ff">(${n.source})</span>
                                </li>`).join('')}
                        </ul>
                    </details>
                    ` : ''}

                    <div style="font-size: 0.7em; color: #666; margin-top: 5px;">Updated: ${new Date(this.stats.aiSentiment.timestamp).toLocaleTimeString()}</div>
                </div>` : ''}

                <div style="margin-top: 15px; display: flex; align-items: center; flex-wrap: wrap;">
                    <button id="hodlToggleBtn" class="btn ${this.stats.hodlMode ? 'btn-hodl-on' : 'btn-hodl-off'}" onclick="toggleHodl()">
                        ${this.stats.hodlMode ? '🛡️ HODL MODE ACTIVE (No-Sell)' : '🔓 Enable HODL Mode'}
                    </button>
                    <a href="/api/export-csv" class="btn">📥 Download CSV</a>
                    <a href="/api/logs" class="btn btn-secondary">📄 Download Logs</a>
                </div>
            </div>

            ${this.getRecentTradesHtml()}
            
            <!-- Exchange Balances -->
            <h2 style="color: #0088ff; margin: 20px 0 15px;">💰 Portfolio (Real-Time)</h2>
            <div class="grid">
                ${exchangeCards}
            </div>

            <!-- Dual Terminals -->
            <div class="grid">
                <div class="card">
                    <div class="log-title">🖥️ System Terminal</div>
                    <div class="log-box">
                        ${this.stats.logs.map((l: string) => `<div class="log-entry-system">${l}</div>`).join('')}
                    </div>
                </div>
                <div class="card">
                    <div class="log-title">🧠 Strategy Engine</div>
                    <div class="log-box">
                        ${this.stats.strategyLogs.map((l: string) => `<div class="log-entry-strategy">> ${l}</div>`).join('')}
                    </div>
                </div>
            </div>
            
            <script>
                function toggleHodl() {
                    fetch('/api/toggle-hodl', { method: 'POST' })
                        .then(res => res.json())
                        .then(data => {
                            window.location.reload(); // Refresh to update visuals
                        });
                }

                // Price History Data (from server) - includes all Bitso pairs
                // Price History Data (from server)
                // Filter: Show all or specific exchange. Currently we use 'Binance'.
                const priceData = ${JSON.stringify(this.stats.priceHistory.map((p: any) => ({ x: p.timestamp, y: p.price, marker: p.marker, ex: p.exchange })))};
                
                // Separate regular points from trade markers
                const lineData = priceData.map((p: any) => ({ x: p.x, y: p.y }));
                const buyMarkers = priceData.filter((p: any) => p.marker === 'buy').map((p: any) => ({ x: p.x, y: p.y }));
                const sellMarkers = priceData.filter((p: any) => p.marker === 'sell').map((p: any) => ({ x: p.x, y: p.y }));

                const ctx = document.getElementById('profitChart').getContext('2d');
                const pChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        datasets: [
                            {
                                label: 'Price (USD)',
                                data: lineData,
                                borderColor: '#00ff88',
                                backgroundColor: 'rgba(0, 255, 136, 0.1)',
                                fill: true,
                                tension: 0.2,
                                pointRadius: 2
                            },
                            {
                                label: 'Buy',
                                data: buyMarkers,
                                type: 'scatter',
                                backgroundColor: '#00ff88',
                                pointRadius: 8,
                                pointStyle: 'triangle'
                            },
                            {
                                label: 'Sell',
                                data: sellMarkers,
                                type: 'scatter',
                                backgroundColor: '#ff4444',
                                pointRadius: 8,
                                pointStyle: 'rectRot'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        plugins: { 
                            legend: { display: true, labels: { color: '#fff' } },
                            tooltip: { 
                                callbacks: { label: (c) => '$' + (c.raw as any).y.toFixed(4) }
                            }
                        },
                        scales: {
                            y: { 
                                grid: { color: 'rgba(255,255,255,0.05)' }, 
                                ticks: { color: '#888' },
                                title: { display: true, text: 'Price ($)', color: '#888' }
                            },
                            x: { 
                                type: 'linear',
                                grid: { display: false }, 
                                ticks: { 
                                    color: '#888',
                                    callback: function(value: any) {
                                        return new Date(value).toLocaleTimeString();
                                    }
                                },
                                title: { display: true, text: 'Time', color: '#888' }
                            }
                        }
                    }
                });

                // Auto-update chart every 10s
                /*
                setInterval(() => {
                    fetch('/api/chart-data')
                        .then(r => r.json())
                        .then(d => {
                            pChart.data.labels = d.labels;
                            pChart.data.datasets[0].data = d.data;
                            pChart.update();
                        });
                }, 10000);
                */
            </script>
            
            <footer style="text-align: center; color: #444; margin-top: 30px; font-size: 0.8em;">
                SLAVI BNB Production Suite v2.0 | High-Performance Scalper
            </footer>
        </body>
        </html>
        `;
    }
}
