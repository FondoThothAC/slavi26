const fs = require('fs');
const path = require('path');
const https = require('https');

const BINANCE_API = 'https://api.binance.com/api/v3/klines';

// Polyfill fetch-like behavior with https for compatibility if fetch missing
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                } else {
                    reject(new Error(`Status: ${res.statusCode} ${res.statusMessage}`));
                }
            });
        }).on('error', reject);
    });
}

// Helper to fetch candles
async function fetchBinanceCandles(symbol, interval, limit) {
    const url = `${BINANCE_API}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    console.log(`Fetching ${symbol} from ${url}...`);

    // Check if fetch global exists (Node 18+)
    if (typeof fetch !== 'undefined') {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
        const data = await res.json();
        return parseBinanceData(data);
    } else {
        // Fallback to https
        const data = await fetchJson(url);
        return parseBinanceData(data);
    }
}

function parseBinanceData(data) {
    return data.map(d => ({
        timestamp: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5])
    }));
}

// Generate Bitso data based on Binance data with realistic arbitrage noise
function generateBitsoProxy(binanceData, volatilityMultiplier = 1.0, spreadNoise = 0.005) {
    return binanceData.map(b => {
        // Bitso usually follows Binance but with a spread/lag
        // We simulate a price deviation of +/- spreadNoise % (e.g. 0.5%)
        const deviation = 1 + (Math.random() - 0.5) * 2 * spreadNoise;

        return {
            timestamp: b.timestamp,
            open: b.open * deviation,
            high: b.high * deviation,
            low: b.low * deviation,
            close: b.close * deviation,
            volume: b.volume * 0.1 // Bitso has less volume
        };
    });
}

async function main() {
    const outputDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Fetch Binance Data (Real Market)
    // Get last 1000 candles (approx 16 hours of 1m data, or 40 days of 1h data)
    // User requested "1 month". 1h candles (interval='1h') * 24 * 30 = 720 candles.
    // Let's use 1h candles to cover the full month as requested.
    const interval = '1h';
    const limit = 750; // 1 Month + buffer

    console.log(`Getting ${limit} candles of ${interval} interval (approx 1 month)...`);

    const xrpUsdt = await fetchBinanceCandles('XRPUSDT', interval, limit);
    const btcUsdt = await fetchBinanceCandles('BTCUSDT', interval, limit);
    // Fetch directly or calculate cross? Fetching is better/easier if available.
    // XRPBTC pair exists on Binance.
    const xrpBtc = await fetchBinanceCandles('XRPBTC', interval, limit);

    // 2. Generate Bitso Proxy Data (Simulated Local Exchange)
    const bitsoXrpUsd = generateBitsoProxy(xrpUsdt, 1.0, 0.008); // 0.8% deviation noise
    const bitsoBtcUsd = generateBitsoProxy(btcUsdt, 1.0, 0.006); // 0.6% deviation

    // 3. Save to JSON
    fs.writeFileSync(path.join(outputDir, 'binance_XRPUSDT.json'), JSON.stringify(xrpUsdt, null, 2));
    fs.writeFileSync(path.join(outputDir, 'binance_BTCUSDT.json'), JSON.stringify(btcUsdt, null, 2));
    fs.writeFileSync(path.join(outputDir, 'binance_XRPBTC.json'), JSON.stringify(xrpBtc, null, 2));

    fs.writeFileSync(path.join(outputDir, 'bitso_XRPUSD.json'), JSON.stringify(bitsoXrpUsd, null, 2));
    fs.writeFileSync(path.join(outputDir, 'bitso_BTCUSD.json'), JSON.stringify(bitsoBtcUsd, null, 2));

    console.log('Successfully saved real/proxy historical data to /data folder.');
}

main().catch(console.error);
