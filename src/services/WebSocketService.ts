import WebSocket from 'ws';

/**
 * @description Servicio unificado para la gestión de streams de WebSocket de Binance.
 * Utiliza la librería 'ws' directamente para máxima estabilidad y compatibilidad.
 */
export class WebSocketService {
  private ws: WebSocket | null = null;
  private priceCache: Map<string, number> = new Map();
  private subscribedSymbols: Set<string> = new Set();
  private wsUrl = 'wss://stream.binance.com:9443/ws';

  constructor() {
    this.connect();
  }

  private connect() {
    if (this.subscribedSymbols.size === 0) {
      console.log('[WebSocket] Waiting for first subscription to connect...');
      return;
    }

    const streams = Array.from(this.subscribedSymbols).map(s => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    if (this.ws) {
        this.ws.terminate();
    }

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log(`[WebSocket] Connected to ${this.subscribedSymbols.size} streams.`);
    });

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const d = parsed.data;
        if (d?.s && d?.c) {
          const symbol = d.s.toUpperCase();
          const price = parseFloat(d.c);
          this.priceCache.set(symbol, price);
        }
      } catch (e) {}
    });

    this.ws.on('error', (err) => {
      console.error('[WebSocket] Error:', err.message);
    });

    this.ws.on('close', () => {
      console.log('[WebSocket] Connection closed. Reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    });
  }

  /**
   * @description Se suscribe a los tickers de los símbolos proporcionados.
   * @param symbols Lista de símbolos (e.g. ['ADABNB', 'BTCBNB'])
   */
  public subscribe(symbols: string[]) {
    let changed = false;
    for (const s of symbols) {
        const normalized = s.toUpperCase().replace('/', '');
        if (!this.subscribedSymbols.has(normalized)) {
            this.subscribedSymbols.add(normalized);
            changed = true;
        }
    }

    if (changed) {
        this.connect();
    }
  }

  /**
   * @description Obtiene el precio más reciente cacheado.
   */
  public getPrice(symbol: string): number | undefined {
    const normalized = symbol.replace('/', '').toUpperCase();
    return this.priceCache.get(normalized);
  }

  public getAllPrices(): Map<string, number> {
    return new Map(this.priceCache);
  }

  public disconnect() {
    this.ws?.terminate();
    this.ws = null;
  }
}
