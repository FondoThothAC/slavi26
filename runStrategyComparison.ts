import { BacktestSimulator, MockExchange } from './src/strategies/BacktestSimulator';
import { ScalpingGridStrategy, TriangularArbitrageStrategy, Signal } from './src/strategies/StrategyEngine';

declare var console: any; // Quick fix for missing types/lib

/**
 * Strategy Comparison Runner.
 * Generates synthetic market data and runs both strategies.
 */
// ...

// (Lines 1-70 skipped) 



// Setup
const TICKS = 750; // 1 Month of hours
const INITIAL_USD = 10000;

// Load Historical Data
declare var require: any;
declare var process: any;
declare var __dirname: any;

const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '../../data');

function loadCandles(filename: string): any[] {
    const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
    const data = JSON.parse(raw);
    return data.map((d: any) => ({
        timestamp: d.timestamp,
        price: d.close
    }));
}

console.log('Loading historical data from ' + DATA_DIR + '...');

// Initialize with empty arrays to satisfy TS "used before assigned" check, though we exit on fail.
let xrpUsdtData: any[] = [];
let btcUsdtData: any[] = [];
let xrpBtcData: any[] = [];
let bitsoXrpUsdData: any[] = [];
let bitsoBtcUsdData: any[] = [];

try {
    xrpUsdtData = loadCandles('binance_XRPUSDT.json');
    btcUsdtData = loadCandles('binance_BTCUSDT.json');
    xrpBtcData = loadCandles('binance_XRPBTC.json');
    bitsoXrpUsdData = loadCandles('bitso_XRPUSD.json');
    bitsoBtcUsdData = loadCandles('bitso_BTCUSD.json');
    console.log(`Loaded ${xrpUsdtData.length} candles per file.`);
} catch (e: any) {
    console.error("Failed to load data files! Run 'node fetchHistoricalData.js' first. Error: " + e.message);
    process.exit(1);
}




// --- Run 1: Scalping Grid (XRP/USDT) ---
console.log('--- Running Scalping Grid (XRP/USDT) ---');
const mockExGrid = new MockExchange({ 'USDT': INITIAL_USD, 'XRP': 0 });
mockExGrid.loadData('XRP/USDT', xrpUsdtData);

// Grid Strategy: Center around current price, +/- 10% range, 20 levels, $100 per grid
const startPrice = xrpUsdtData[0].price;
console.log(`Grid Strategy Center: ${startPrice}`);
const gridStrategy = new ScalpingGridStrategy(startPrice, 0.10, 20, 100);

const simGrid = new BacktestSimulator(gridStrategy, mockExGrid, ['XRP/USDT']);

simGrid.run(TICKS).then((results: { tick: number, signal: Signal }[]) => {
    console.log(`Grid Signals Generated: ${results.length}`);
    // console.log(results.slice(0, 5)); // Show first 5
});


// --- Run 2: Triangular Arbitrage ---
console.log('\n--- Running Triangular Arbitrage ---');
const mockExTri = new MockExchange({ 'USDT': INITIAL_USD, 'XRP': 0, 'BTC': 0 });
mockExTri.loadData('XRP/USDT', xrpUsdtData);
mockExTri.loadData('XRP/BTC', xrpBtcData);
mockExTri.loadData('BTC/USDT', btcUsdtData);

const triStrategy = new TriangularArbitrageStrategy(mockExTri, 'USDT', 'XRP', 'BTC', 100, 0.2); // 0.2% min profit
const simTri = new BacktestSimulator(triStrategy, mockExTri, ['XRP/USDT']); // Trigger symbol doesn't matter much for internal analysis

simTri.run(TICKS).then((results: { tick: number, signal: Signal }[]) => {
    console.log(`Triangular Signals Generated: ${results.length}`);
    const profits = results.map((r) => {
        const parts = r.signal.reason.split('Profit: ');
        if (parts.length > 1 && parts[1] !== undefined) {
            return parseFloat(parts[1]);
        }
        return 0;
    });
    const totalEstProfit = profits.reduce((a, b) => a + b, 0);
    console.log(`Estimated Total Opportunity %: ${totalEstProfit.toFixed(2)}%`);
});
