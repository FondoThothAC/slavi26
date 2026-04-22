import { Exchange, Ticker } from './exchanges/Exchange';
import { BinanceExchange } from './exchanges/BinanceExchange';

export interface ScanResult {
    symbol: string;
    score: number;
    price: number;
    change24h: number;
    volume24h: number; // USDT Volume
    reason: string;
}

export interface TriangleOpportunity {
    path: string[]; // [USDT, XRP, BTC, USDT]
    profitPercent: number;
    action: string; // 'buy' first pair
}

export class MarketScanner {
    // Top coins to ignore if we want only "hidden gems", or include all?
    // Let's include everything with high volume.
    private minVolumeUSDT = 5000000; // $5M daily volume min
    private minVolatility = 1.0; // Reduced to catch more movement in Top coins

    constructor(private exchange: BinanceExchange) { }

    /**
     * Find Top Trending Coins for Scalping
     * Prioritizes High Volume (Liquidity) to serve as "Top Capitalization" proxy.
     */
    // Curated high-quality BNB pairs (proven profitable in micro_bnb_bot.py)
    private readonly CURATED_BNB = [
        'BTCBNB', 'ETHBNB', 'FETBNB', 'SOLBNB', 'DOTBNB',
        'XRPBNB', 'ADABNB', 'SUIBNB', 'TRXBNB', 'LTCBNB', 'BCHBNB'
    ];

    async getTopTrending(limit: number = 10): Promise<ScanResult[]> {
        try {
            const allTickers = await this.exchange.getAllTickers();

            // Build a map for fast lookup
            const tickerMap = new Map<string, Ticker>();
            for (const t of allTickers) {
                tickerMap.set(t.symbol, t);
            }

            const results: ScanResult[] = [];

            // Phase 1: Add curated pairs (5 best — guaranteed quality)
            for (const symbol of this.CURATED_BNB) {
                const t = tickerMap.get(symbol);
                if (!t) continue;
                results.push({
                    symbol: this.normalizeSymbol(symbol),
                    score: t.volume24h + 999999, // Boost curated coins
                    price: t.last,
                    change24h: t.change24h,
                    volume24h: t.volume24h,
                    reason: `⭐ Curated | Chg: ${t.change24h}%`
                });
            }

            // Phase 2: Add trending BNB pairs NOT in curated list (for discovery)
            const excluded = ['USDC', 'FDUSD', 'TUSD', 'DAI', 'USDP', 'BUSD', 'USDT', 'USD1'];
            const bnbPairs = allTickers.filter((t: Ticker) => {
                if (!t.symbol.endsWith('BNB')) return false;
                if (this.CURATED_BNB.includes(t.symbol)) return false; // Already added
                const base = t.symbol.replace('BNB', '');
                if (excluded.includes(base) || base.length === 0) return false;
                // Quality filter: must have minimum volume to avoid micro-caps
                return t.volume24h > 500; // Minimum 500 BNB daily volume
            });

            bnbPairs.sort((a: Ticker, b: Ticker) => b.volume24h - a.volume24h);

            for (const t of bnbPairs.slice(0, 10)) {
                results.push({
                    symbol: this.normalizeSymbol(t.symbol),
                    score: t.volume24h,
                    price: t.last,
                    change24h: t.change24h,
                    volume24h: t.volume24h,
                    reason: `📈 Trending | Vol: ${t.volume24h.toFixed(0)} BNB, Chg: ${t.change24h}%`
                });
            }

            // Sort by momentum
            results.sort((a: ScanResult, b: ScanResult) => {
                const isACurated = a.score > 100000000;
                const isBCurated = b.score > 100000000;
                
                if (isACurated && !isBCurated) return -1;
                if (!isACurated && isBCurated) return 1;
                
                return b.change24h - a.change24h;
            });

            return results.slice(0, limit);

        } catch (e) {
            console.error("Scanner Error:", e);
            return [];
        }
    }

    /**
     * Find Triangular Arbitrage Opportunities
     * Path: USDT -> A -> B -> USDT
     */
    async findTriangularLoops(): Promise<TriangleOpportunity[]> {
        // Implementation for later... or minimal checking now
        // Requires matrix of all pairs.
        return [];
    }

    private normalizeSymbol(raw: string): string {
        // Binance returns "FETBNB", we want "FET/BNB"
        if (raw.endsWith('BNB')) {
            return raw.replace('BNB', '/BNB');
        }
        if (raw.endsWith('USDT')) {
            return raw.replace('USDT', '/USDT');
        }
        return raw;
    }
}
