
const API_BASE = '/api';

// DOM Elements
const agentsContainer = document.getElementById('agents-container');
const createForm = document.getElementById('create-agent-form');
const connectionStatus = document.getElementById('connection-status');
// Backtest Elements
const backtestForm = document.getElementById('backtest-form');
const backtestResults = document.getElementById('backtest-results');
// Balance Elements
const totalBalanceEl = document.getElementById('total-balance');
const balanceChangeEl = document.getElementById('balance-change');
const currencyGridEl = document.getElementById('currency-grid');

// State
let agents = [];
let chartInstance = null;
let balances = [];
let prices = {};
let pnlData = { binance: {}, bitso: {} };

// Currency Icons & Yield Info
const CURRENCY_INFO = {
    btc: { icon: '₿', name: 'Bitcoin', yield: 3.5 },
    eth: { icon: 'Ξ', name: 'Ethereum', yield: 2.8 },
    usd: { icon: '$', name: 'USD', yield: 5.0 },
    mxn: { icon: '$', name: 'MXN', yield: 4.5 },
    xrp: { icon: '✕', name: 'Ripple', yield: 0 },
    ltc: { icon: 'Ł', name: 'Litecoin', yield: 0 },
    sol: { icon: '◎', name: 'Solana', yield: 4.2 },
    usdt: { icon: '₮', name: 'Tether', yield: 4.8 },
    bnb: { icon: '🔶', name: 'BNB', yield: 2.1 },
    fet: { icon: '🤖', name: 'FET', yield: 0 },
    pol: { icon: '⚛️', name: 'POL', yield: 0 },
    sui: { icon: '💧', name: 'SUI', yield: 0 }
};


// Initialize
async function init() {
    await fetchBalance();
    await fetchAgents();
    await fetchTradeHistory();
    await fetchPnL();
    setInterval(fetchBalance, 10000); // Update balance every 10 seconds
    setInterval(fetchAgents, 2000); // Poll every 2 seconds
    setInterval(fetchTradeHistory, 30000); // Trades every 30s
    setInterval(fetchPnL, 30000); // P&L every 30s

    createForm.addEventListener('submit', handleCreateAgent);
    backtestForm.addEventListener('submit', handleBacktest);
}

// ========== TRADE HISTORY ==========
async function fetchTradeHistory() {
    const container = document.getElementById('trade-history');
    const pnlSummaryEl = document.getElementById('trade-history-pnl');
    if (!container) return;
    
    try {
        const pairs = ['FETBNB', 'SOLBNB', 'DOTBNB', 'XRPBNB', 'ADABNB', 'SUIBNB'];
        let allTrades = [];

        for (const symbol of pairs) {
            try {
                const res = await fetch(`${API_BASE}/binance/trades?symbol=${symbol}&limit=20`);
                if (res.ok) {
                    const trades = await res.json();
                    allTrades = allTrades.concat(trades.map(t => ({ ...t, symbol })));
                }
            } catch(e) { /* silent */ }
        }

        allTrades.sort((a, b) => b.time - a.time);

        if (allTrades.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">No hay trades recientes.</p>';
            if (pnlSummaryEl) pnlSummaryEl.innerHTML = '';
            return;
        }

        // P&L Tracking
        let totalNetBnb = 0;
        const lastBuyPrices = {};
        
        // We need to process from oldest to newest to track "profit per trade"
        const sortedOldestFirst = [...allTrades].sort((a, b) => a.time - b.time);
        const tradeResults = {}; // Store profit for individual trades

        sortedOldestFirst.forEach(t => {
            const total = parseFloat(t.qty) * parseFloat(t.price);
            const fee = parseFloat(t.commission || 0);
            
            if (t.isBuyer) {
                totalNetBnb -= (total + fee);
                lastBuyPrices[t.symbol] = parseFloat(t.price);
            } else {
                totalNetBnb += (total - fee);
                if (lastBuyPrices[t.symbol]) {
                    const profitPct = ((parseFloat(t.price) / lastBuyPrices[t.symbol]) - 1) * 100;
                    tradeResults[t.id] = profitPct;
                }
            }
        });

        // Update Summary Header
        if (pnlSummaryEl) {
            const bnbPrice = prices['bnb'] || 600;
            const totalUSD = totalNetBnb * bnbPrice;
            const color = totalUSD >= 0 ? 'var(--success)' : 'var(--danger)';
            const sign = totalUSD >= 0 ? '+' : '';
            pnlSummaryEl.innerHTML = `Net P&L: <span style="color: ${color}">${sign}$${totalUSD.toFixed(4)} USD</span> <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 400;">(${totalNetBnb.toFixed(5)} BNB)</span>`;
        }

        container.innerHTML = allTrades.map(t => {
            const side = t.isBuyer ? 'BUY' : 'SELL';
            const sideColor = t.isBuyer ? 'var(--success)' : 'var(--accent)';
            const date = new Date(t.time).toLocaleString();
            const qty = parseFloat(t.qty).toFixed(2);
            const price = parseFloat(t.price);
            const total = (parseFloat(t.qty) * price).toFixed(6);
            
            let profitBadge = '';
            if (!t.isBuyer && tradeResults[t.id]) {
                const p = tradeResults[t.id];
                const pColor = p >= 0 ? 'var(--success)' : 'var(--danger)';
                profitBadge = `<span style="color: ${pColor}; font-size: 0.75rem; margin-left: 8px;">(${p >= 0 ? '+' : ''}${p.toFixed(2)}%)</span>`;
            }

            return `<div style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center;">
                <span style="color: ${sideColor}; font-weight: 600; width: 45px;">${side}</span>
                <span style="color: var(--text-muted); width: 65px;">${t.symbol.replace('BNB','')}</span>
                <span style="width: 75px;">${qty}</span>
                <span style="width: 100px;">@ ${price}${profitBadge}</span>
                <span style="color: var(--text-muted); width: 100px; text-align: right;">${total} BNB</span>
                <span style="color: var(--text-muted); font-size: 0.75rem; width: 140px; text-align: right;">${date}</span>
            </div>`;
        }).join('');
    } catch (e) {
        console.error('Trade history error:', e);
    }
}

// ========== BALANCE FUNCTIONS ==========

// Fetch Balance from API
async function fetchBalance() {
    try {
        const res = await fetch(`${API_BASE}/balance`);
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.payload) {
                // payload is now a flat array (Bitso + Binance combined)
                balances = Array.isArray(data.payload) ? data.payload : (data.payload.balances || []);
                await fetchPrices();
                renderBalance();
                renderCurrencyGrid();
            }
        }
    } catch (error) {
        console.error("Error fetching balance:", error);
        balanceChangeEl.textContent = "Error al cargar saldos";
    }
}

// Fetch current prices for USD conversion
async function fetchPrices() {
    // Bitso pairs
    const bitsoPairs = ['btc_usd', 'eth_usd', 'xrp_usd', 'ltc_usd'];
    for (const pair of bitsoPairs) {
        try {
            const res = await fetch(`${API_BASE}/ticker?book=${pair}`);
            if (res.ok) {
                const data = await res.json();
                if (data.payload) {
                    const currency = pair.split('_')[0];
                    prices[currency] = parseFloat(data.payload.last);
                }
            }
        } catch (e) { /* silent */ }
    }
    
    // Binance prices (BNB, FET, SOL, etc)
    const binancePairs = [
        { symbol: 'BNBUSDT', key: 'bnb' },
        { symbol: 'FETUSDT', key: 'fet' },
        { symbol: 'SOLUSDT', key: 'sol' },
        { symbol: 'DOTUSDT', key: 'dot' },
        { symbol: 'SUIUSDT', key: 'sui' },
        { symbol: 'TRXUSDT', key: 'trx' },
        { symbol: 'ADAUSDT', key: 'ada' },
        { symbol: 'BCHUSDT', key: 'bch' }
    ];
    for (const { symbol, key } of binancePairs) {
        try {
            const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
            if (res.ok) {
                const data = await res.json();
                prices[key] = parseFloat(data.price);
            }
        } catch (e) { /* silent */ }
    }
    
    prices['usd'] = 1;
    prices['usdt'] = 1;
    prices['fdusd'] = 1;
    prices['mxn'] = 0.058;
}

// Render total balance (split by exchange)
function renderBalance() {
    let totalUSD = 0;
    let binanceUSD = 0;
    let bitsoUSD = 0;

    balances.forEach(b => {
        const currency = b.currency.toLowerCase();
        const available = parseFloat(b.available) + parseFloat(b.locked || 0);
        const price = prices[currency] || 0;
        const val = available * price;
        totalUSD += val;
        
        if (b.provider === 'binance') binanceUSD += val;
        else bitsoUSD += val;
    });

    const fmt = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    totalBalanceEl.innerHTML = `$${fmt(totalUSD)} <span class="currency-label">USD</span>`;

    // Per-exchange totals
    const binanceTotalEl = document.getElementById('binance-total');
    const bitsoTotalEl = document.getElementById('bitso-total');
    if (binanceTotalEl) binanceTotalEl.textContent = `$${fmt(binanceUSD)}`;
    if (bitsoTotalEl) bitsoTotalEl.textContent = `$${fmt(bitsoUSD)}`;

    // Summary line
    const binanceCount = balances.filter(b => b.provider === 'binance' && (parseFloat(b.available) + parseFloat(b.locked || 0)) > 0.00001).length;
    const bitsoCount = balances.filter(b => b.provider !== 'binance' && (parseFloat(b.available) + parseFloat(b.locked || 0)) > 0.00001).length;
    const lockedCount = balances.filter(b => parseFloat(b.locked) > 0).length;

    balanceChangeEl.innerHTML = `Binance: ${binanceCount} activos | Bitso: ${bitsoCount} activos`;
    if (lockedCount > 0) {
        balanceChangeEl.innerHTML += ` • <span style="color: var(--warning)">${lockedCount} en orden</span>`;
    }
}

// Build a single currency card HTML
function buildCurrencyCard(b) {
    const currency = b.currency.toLowerCase();
    const info = CURRENCY_INFO[currency] || { icon: '¤', name: currency.toUpperCase(), yield: 0 };
    const available = parseFloat(b.available);
    const locked = parseFloat(b.locked || 0);
    const total = available + locked;
    const price = prices[currency] || 0;
    const valueUSD = total * price;
    const isMoving = locked > 0;

    const formattedAmount = total < 0.01
        ? total.toFixed(8)
        : total.toLocaleString('en-US', { maximumFractionDigits: 4 });
    const formattedValue = valueUSD.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    // P&L Logic
    const provider = b.provider || 'bitso';
    const exchangePnl = pnlData[provider] || {};
    let pnlHtml = '';
    
    if (exchangePnl['24h'] && exchangePnl['24h'].byAsset && exchangePnl['24h'].byAsset[currency]) {
        const pnl24h = exchangePnl['24h'].byAsset[currency];
        const pnl7d = (exchangePnl['7d'] && exchangePnl['7d'].byAsset && exchangePnl['7d'].byAsset[currency]) || { pnl: 0, trades: 0 };
        const pnl30d = (exchangePnl['30d'] && exchangePnl['30d'].byAsset && exchangePnl['30d'].byAsset[currency]) || { pnl: 0, trades: 0 };

        const fmtPnl = (p) => {
            const val = provider === 'binance' ? p.pnl * (prices['bnb'] || 1) : p.pnl;
            const sign = val >= 0 ? '+' : '';
            const color = val >= 0 ? 'var(--success)' : 'var(--danger)';
            return `<span style="color: ${color}">${sign}$${val.toFixed(2)}</span>`;
        };

        pnlHtml = `
            <div class="pnl-container" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <div class="pnl-row"><span>P&L 24h</span> ${fmtPnl(pnl24h)}</div>
                <div class="pnl-row"><span>P&L 1w</span> ${fmtPnl(pnl7d)}</div>
                <div class="pnl-row"><span>P&L 1m</span> ${fmtPnl(pnl30d)}</div>
            </div>
        `;
    }

    return `
        <div class="currency-card ${isMoving ? 'moving' : ''}">
            <div class="card-badges">
                ${isMoving ? '<span class="status-badge active">En Orden</span>' : ''}
                ${info.yield > 0 ? '<span class="status-badge passive">Rinde</span>' : ''}
            </div>
            <span class="currency-icon">${info.icon}</span>
            <span class="currency-name">${info.name}</span>
            <div class="currency-amount">${formattedAmount}</div>
            <div class="currency-value">≈ $${formattedValue} USD</div>
            ${info.yield > 0 ? `<span class="yield-badge">${info.yield}% APY</span>` : ''}
            ${pnlHtml}
        </div>
    `;
}

// Render currency cards split by exchange
function renderCurrencyGrid() {
    const threshold = 0.00001;
    
    const binanceAssets = balances.filter(b => b.provider === 'binance' && (parseFloat(b.available) + parseFloat(b.locked || 0)) > threshold);
    const bitsoAssets = balances.filter(b => b.provider !== 'binance' && (parseFloat(b.available) + parseFloat(b.locked || 0)) > threshold);

    const binanceGrid = document.getElementById('binance-grid');
    const bitsoGrid = document.getElementById('bitso-grid');

    if (binanceGrid) {
        binanceGrid.innerHTML = binanceAssets.length > 0
            ? binanceAssets.map(buildCurrencyCard).join('')
            : '<div class="currency-card loading"><p>Sin activos en Binance</p></div>';
    }

    if (bitsoGrid) {
        bitsoGrid.innerHTML = bitsoAssets.length > 0
            ? bitsoAssets.map(buildCurrencyCard).join('')
            : '<div class="currency-card loading"><p>Sin activos en Bitso</p></div>';
    }
}

// Fetch Multi-period P&L from both exchanges
async function fetchPnL() {
    // Helper to update UI for a specific exchange
    const updateUI = (exchange, data) => {
        if (!data || !data.periods) return;
        
        for (const [period, stats] of Object.entries(data.periods)) {
            const el = document.getElementById(`${exchange}-pnl-${period}`);
            if (el) {
                const pnlUSD = stats.pnl_usd || 0;
                const trades = stats.trades || 0;
                const sign = pnlUSD >= 0 ? '+' : '';
                const color = pnlUSD >= 0 ? 'var(--success)' : 'var(--danger)';
                el.style.color = color;
                el.innerHTML = `${sign}$${pnlUSD.toFixed(2)} <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 400;">(${trades}t)</span>`;
            }
        }
    };

    // Binance P&L
    try {
        const res = await fetch(`${API_BASE}/binance/pnl`);
        if (res.ok) {
            const data = await res.json();
            pnlData.binance = data.periods;
            updateUI('binance', data);
        }
    } catch (e) { console.error('Binance P&L error:', e); }

    // Bitso P&L
    try {
        const res = await fetch(`${API_BASE}/bitso/pnl`);
        if (res.ok) {
            const data = await res.json();
            pnlData.bitso = data.periods;
            updateUI('bitso', data);
        }
    } catch (e) { console.error('Bitso P&L error:', e); }

    // Re-render currency grid to show per-asset P&L
    renderCurrencyGrid();
}


// Backtest Handler
async function handleBacktest(e) {
    e.preventDefault();
    const strategy = document.getElementById('bt-strategy').value;
    const start = document.getElementById('bt-start').value;
    const end = document.getElementById('bt-end').value;
    // We need to grab amount/spread from the MAIN form or add specific inputs for Backtest?
    // User expects the "Deploy" inputs to apply to Backtest too likely, or we should mirror them.
    // For simplicity, let's grab them from the main inputs as they are global configuration.
    const amount = document.getElementById('amount').value;
    const spread = parseFloat(document.getElementById('spread').value);

    const btn = backtestForm.querySelector('button');

    btn.textContent = "Running Simulation...";
    btn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/backtest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strategy,
                book: document.getElementById('book').value,
                start,
                end,
                amount,
                spread
            })
        });

        const data = await res.json();
        if (res.ok) {
            renderBacktestResults(data);
        } else {
            alert("Backtest Failed: " + data.error);
        }

    } catch (e) {
        console.error(e);
        alert("Sim Error");
    } finally {
        btn.textContent = "Run Backtest";
        btn.disabled = false;
    }
}

function renderBacktestResults(data) {
    backtestResults.style.display = 'block';
    document.getElementById('bt-equity').textContent = "$" + data.finalEquity.toFixed(2);
    document.getElementById('bt-trades').textContent = data.trades.length;

    const ctx = document.getElementById('equityChart').getContext('2d');

    if (chartInstance) chartInstance.destroy();

    const labels = data.equityCurve.map(d => new Date(d.time * 1000).toLocaleDateString());
    const values = data.equityCurve.map(d => d.equity);

    // @ts-ignore
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Portfolio Equity (MXN)',
                data: values,
                borderColor: '#6366f1',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { labels: { color: 'white' } }
            },
            scales: {
                y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            }
        }
    });
}


// Fetch Agents
async function fetchAgents() {
    // Also fetch Bot Manager Status from port 3334
    try {
        const botRes = await fetch('http://localhost:3334/api/stats');
        if (botRes.ok) {
            const botData = await botRes.json();
            const statusEl = document.getElementById('bot-manager-status');
            if (statusEl && botData.managerStatus) {
                const trades = botData.tradeStats ? botData.tradeStats.tradeCount : 0;
                statusEl.innerHTML = `🤖 Bot Manager: <span style="color: #fff;">${botData.managerStatus}</span> <span style="margin-left: 10px; color: #a78bfa;">⚡ Total Trades Ejecutados: ${trades}</span>`;
            }
        }
    } catch (e) {
        // Bot might not be running on this port, silent fail
        const statusEl = document.getElementById('bot-manager-status');
        if (statusEl) statusEl.innerHTML = `🤖 Bot Manager: <span style="color: grey;">Offline</span>`;
    }

    try {
        const res = await fetch(`${API_BASE}/agents`);
        if (res.ok) {
            agents = await res.json();
            renderAgents();
            updateConnection(true);
        } else {
            console.error("Failed to fetch agents");
            updateConnection(false);
        }
    } catch (error) {
        console.error("Connection error", error);
        updateConnection(false);
    }
}

// Update Connection Status UI
function updateConnection(isConnected) {
    if (isConnected) {
        connectionStatus.style.background = 'var(--success)';
        connectionStatus.style.boxShadow = '0 0 10px var(--success)';
    } else {
        connectionStatus.style.background = 'var(--danger)';
        connectionStatus.style.boxShadow = 'none';
    }
}

// Render Agents
function renderAgents() {
    if (agents.length === 0) {
        agentsContainer.innerHTML = `
            <div class="agent-card empty-state" style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">
                <p>No active agents. Deploy one to start trading.</p>
            </div>`;
        return;
    }

    // Smart update (diffing could be better but innerHTML is fast enough for <10 agents)
    // To preserve scroll position of logs, we might want to check if card exists.
    // For MVP, straightforward redraw is fine, or we can just update content if ID exists.
    // Let's do a simple diff-like approach: Re-render all, but we might lose log scroll.
    // To fix log scroll: save state.

    // Better approach for smooth UI:
    // Update existing cards, create new ones, remove old ones.

    // 1. Mark all existing as 'dirty'
    const existingCards = new Set(Array.from(agentsContainer.children).map(c => c.id));
    const verifiedIds = new Set();

    agents.forEach(agent => {
        let card = document.getElementById(`agent-${agent.id}`);
        verifiedIds.add(`agent-${agent.id}`);

        if (!card) {
            // Create
            card = createAgentCard(agent);
            agentsContainer.appendChild(card);
        }

        // Update content
        updateAgentCard(card, agent);
    });

    // Remove defunct
    existingCards.forEach(cardId => {
        if (!verifiedIds.has(cardId) && !document.getElementById(cardId).classList.contains('empty-state')) {
            document.getElementById(cardId).remove();
        }
    });

    // Remove empty state if agents exist
    const emptyState = agentsContainer.querySelector('.empty-state');
    if (agents.length > 0 && emptyState) emptyState.remove();
}

function createAgentCard(agent) {
    const div = document.createElement('div');
    div.className = 'agent-card';
    div.id = `agent-${agent.id}`;
    div.innerHTML = `
        <div class="card-header">
            <div>
                <h3 style="font-weight:600">${agent.config.book.toUpperCase()}</h3>
                <span class="agent-type">${agent.type}</span>
            </div>
            <span class="agent-status"></span>
        </div>
        <div class="agent-id">ID: ${agent.id}</div>
        
        <div class="logs-container" id="logs-${agent.id}">
            <!-- Logs injected here -->
        </div>

        <div class="card-controls">
            ${getControlButtons(agent)}
        </div>
    `;
    return div;
}

function updateAgentCard(card, agent) {
    // Status
    const statusEl = card.querySelector('.agent-status');
    statusEl.className = `agent-status status-${agent.status.toLowerCase()}`;
    statusEl.textContent = agent.status;

    // Logs
    const logsContainer = card.querySelector('.logs-container');
    // Only update if logs changed length or content to avoid scroll jump? 
    // Simply join them.
    const logsHtml = agent.logs.slice().reverse().map(l => `<div class="log-entry"><span class="log-time">${l.split(']')[0].substr(1)}</span>${l.split(']')[2] || l}</div>`).join('');

    if (logsContainer.innerHTML !== logsHtml) {
        logsContainer.innerHTML = logsHtml;
    }

    // Controls
    const controlsContainer = card.querySelector('.card-controls');
    controlsContainer.innerHTML = getControlButtons(agent);

    // Bind events
    const buttons = controlsContainer.querySelectorAll('button');
    buttons.forEach(btn => {
        btn.onclick = () => handleAction(agent.id, btn.dataset.action);
    });
}

function getControlButtons(agent) {
    let btns = '';

    if (agent.status === 'RUNNING') {
        btns += `<button class="btn-control warning" data-action="pause">Pause</button>`;
        btns += `<button class="btn-control danger" data-action="stop">Stop</button>`;
    } else if (agent.status === 'PAUSED') {
        btns += `<button class="btn-control success" data-action="resume">Resume</button>`;
        btns += `<button class="btn-control danger" data-action="stop">Stop</button>`;
    } else {
        btns += `<button class="btn-control success" data-action="resume">Restart</button>`;
    }

    btns += `<button class="btn-control btn-delete" data-action="delete">Delete</button>`;
    return btns;
}

function formatType(config) {
    // We don't have type in config in the response strictly unless we persisted it. 
    // AgentController returns status with config. Ideally we should store type in agent.
    // The current Agent.ts doesn't explicitly store 'type' string (maker-maker etc), 
    // just the class instance. 
    // We can infer or text. Ideally backend adds it.
    // For now, let's display what we can.
    return "Trading Bot";
}

// Handle Actions
async function handleAction(id, action) {
    if (action === 'delete') {
        // if (!confirm('Delete this agent?')) return; // Removed for easier interactions/debug
        console.log(`Deleting agent ${id}...`);
        await fetch(`${API_BASE}/agents/${id}`, { method: 'DELETE' });
    } else {
        await fetch(`${API_BASE}/agents/${id}/${action}`, { method: 'POST' });
    }
    fetchAgents(); // Immediate refresh
}

// Handle Create
async function handleCreateAgent(e) {
    e.preventDefault();
    const type = document.getElementById('strategy-type').value;
    const book = document.getElementById('book').value;
    const amount = document.getElementById('amount').value;
    const spreadInput = document.getElementById('spread').value;

    const config = {
        book,
        amount, // Now using 10 as default for USD strategies, or equivalent
        spread: parseFloat(spreadInput) || 0.01,
        gridLevels: 5
    };

    try {
        const res = await fetch(`${API_BASE}/agents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, config })
        });

        if (res.ok) {
            fetchAgents();
            e.target.reset();
        } else {
            const data = await res.json();
            alert('Error: ' + data.error);
        }
    } catch (error) {
        console.error(error);
        alert('Failed to create agent');
    }
}

// Start
init();
