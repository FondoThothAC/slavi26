import axios, { AxiosRequestConfig, Method } from 'axios';
import crypto from 'crypto';
import { config } from './config';

export class BitsoClient {
    private key: string;
    private secret: string;
    private baseUrl: string;

    constructor() {
        this.key = config.bitso.key;
        this.secret = config.bitso.secret;
        this.baseUrl = config.bitso.baseUrl;
    }

    private getSignature(nonce: number, method: string, path: string, body: object | null = null): string {
        const payload = body ? JSON.stringify(body) : '';
        const message = `${nonce}${method}${path}${payload}`;
        const signature = crypto.createHmac('sha256', this.secret).update(message).digest('hex');
        return signature;
    }

    private async request(method: Method, endpoint: string, data: object | null = null) {
        const nonce = new Date().getTime();
        // The path usually includes /v3/ for signed requests in some docs, but baseUrl might already have it. 
        // Let's assume endpoint starts with / and is relative to baseUrl which is https://api.bitso.com/v3
        // Bitso Signature requires the full path e.g. /v3/balance

        // Adjusting path for signature to ensure it matches what Bitso expects.
        // If baseUrl is https://api.bitso.com/v3, and endpoint is /balance
        // The signature usually needs /v3/balance.

        const requestPath = `/v3${endpoint}`;
        const signature = this.getSignature(nonce, method.toUpperCase(), requestPath, data);
        const authHeader = `Bitso ${this.key}:${nonce}:${signature}`;

        const options: AxiosRequestConfig = {
            method: method,
            url: `${this.baseUrl}${endpoint}`,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            },
            data: data
        };

        try {
            const response = await axios(options);
            return response.data;
        } catch (error: any) {
            if (error.response) {
                console.error(`API Error ${endpoint}:`, error.response.status, error.response.data);
                throw new Error(`Bitso API Error: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    async getBalance() {
        return this.request('GET', '/balance');
    }

    async getOpenOrders(book: string) {
        return this.request('GET', `/open_orders?book=${book}`);
    }

    async placeOrder(book: string, side: 'buy' | 'sell', type: 'limit' | 'market', major: string | null = null, price: string | null = null) {
        // Simple wrapper, can be expanded
        const body: any = {
            book,
            side,
            type
        };
        if (major) body.major = major; // Amount in major currency (e.g., BTC to buy)
        if (price) body.price = price;

        return this.request('POST', '/orders', body);
    }

    async cancelOrder(oid: string) {
        return this.request('DELETE', `/orders/${oid}`);
    }

    // Public API (no auth needed technically, but authenticated limits are higher usually)
    async getOrderBook(book: string) {
        // Can use private request or basic public one. Using private for simplicity of reuse.
        return this.request('GET', `/order_book?book=${book}`);
    }

    async getTicker(book: string) {
        return this.request('GET', `/ticker?book=${book}`);
    }

    async getUserTrades(book: string, limit: number = 25) {
        return this.request('GET', `/user_trades?book=${book}&limit=${limit}`);
    }
}
