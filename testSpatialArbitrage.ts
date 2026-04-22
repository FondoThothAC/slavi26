
declare var require: any;
declare var console: any;
declare var __dirname: any;

const fs = require('fs');

const path = require('path');

// Load Data
const DATA_DIR = path.join(__dirname, '../../data');

function loadCandles(filename: string): any[] {
    try {
        const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error(`Error loading ${filename}:`, e);
        return [];
    }
}

// Config
const INITIAL_CAPITAL = 1000; // $1000 USD on each exchange
const FEE_BINANCE = 0.001; // 0.1%
const FEE_BITSO = 0.005; // 0.5% (Conservative estimate for lower tiers)
const TOTAL_FEE = FEE_BINANCE + FEE_BITSO;
const MIN_PROFIT_THRESHOLD = 0.008; // Target 0.8% net profit (so spread must be > 0.6% + 0.8% = 1.4%)

// Strategy: Spatial Arbitrage
// Concept: 
// 1. If Binance < Bitso by (Fees + Profit): Buy Binance, Sell Bitso.
// 2. If Bitso < Binance by (Fees + Profit): Buy Bitso, Sell Binance.
// * Assumes we hold USDT and XRP on BOTH exchanges to execute immediately (no transfer times).

async function run() {
    const binanceData = loadCandles('binance_XRPUSDT.json');
    const bitsoData = loadCandles('bitso_XRPUSD.json');

    if (binanceData.length === 0 || bitsoData.length === 0) {
        console.log("No data found. Skipping.");
        return;
    }

    let opportunities = 0;
    let totalPotentialProfit = 0;

    console.log(`Analyzing ${binanceData.length} aligned 1h candles...`);

    for (let i = 0; i < binanceData.length; i++) {
        const bin = binanceData[i];
        const bit = bitsoData[i]; // Assumes timestamps align perfect for 1h candles (they should based on generation)

        // Prices
        const pBin = bin.close;
        const pBit = bit.close;

        // Check Gap 1: Buy Binance -> Sell Bitso
        // Profit % = (Sell - Buy) / Buy - Fees
        const gap1 = (pBit - pBin) / pBin;
        const net1 = gap1 - TOTAL_FEE;

        // Check Gap 2: Buy Bitso -> Sell Binance
        const gap2 = (pBin - pBit) / pBit;
        const net2 = gap2 - TOTAL_FEE;

        if (net1 > MIN_PROFIT_THRESHOLD) {
            opportunities++;
            totalPotentialProfit += net1;
            // console.log(`[${new Date(bin.timestamp).toISOString()}] Buy Binance ($${pBin}) -> Sell Bitso ($${pBit}) | Net: ${(net1*100).toFixed(2)}%`);
        } else if (net2 > MIN_PROFIT_THRESHOLD) {
            opportunities++;
            totalPotentialProfit += net2;
            // console.log(`[${new Date(bin.timestamp).toISOString()}] Buy Bitso ($${pBit}) -> Sell Binance ($${pBin}) | Net: ${(net2*100).toFixed(2)}%`);
        }
    }

    console.log("\n--- Spatial Arbitrage Results (1 Month) ---");
    console.log(`Total Opportunities: ${opportunities}`);
    console.log(`Estimated Cumulative Return: ${(totalPotentialProfit * 100).toFixed(2)}%`);
    console.log(`Average Return per Trade: ${opportunities > 0 ? ((totalPotentialProfit / opportunities) * 100).toFixed(2) : 0}%`);
    console.log(`Assumed Fees: ${(TOTAL_FEE * 100).toFixed(1)}% (Binance+Bitso)`);
}

run();
