import fetch from 'node-fetch';

/**
 * TelegramManager: Simple utility to send notifications to Telegram.
 */
export class TelegramManager {
    private token: string | undefined;
    private chatId: string | undefined;

    constructor() {
        this.token = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
    }

    /**
     * Send a markdown formatted message to the configured Telegram chat.
     */
    async sendMessage(text: string): Promise<boolean> {
        if (!this.token || !this.chatId) {
            return false;
        }

        const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });

            const result = await response.json() as any;
            return result.ok === true;
        } catch (error) {
            console.error('[Telegram] Failed to send message:', error);
            return false;
        }
    }

    /**
     * Send a formatted trade alert.
     */
    async sendTradeAlert(data: {
        symbol: string;
        side: string;
        price: number;
        amount: number;
        pnl?: number;
    }) {
        const emoji = data.side.toUpperCase() === 'BUY' ? '🛒' : '💰';
        const pnlText = data.pnl !== undefined ? `\n*PnL:* ${data.pnl > 0 ? '📈' : '📉'} ${data.pnl.toFixed(2)}%` : '';
        
        const message = `${emoji} *TRADE ALERT: ${data.side.toUpperCase()}*\n` +
                        `*Pair:* ${data.symbol}\n` +
                        `*Price:* ${data.price.toFixed(8)}\n` +
                        `*Amount:* ${data.amount.toFixed(4)} ${data.symbol.split('/')[0]}${pnlText}`;
        
        return this.sendMessage(message);
    }

    /**
     * Send a system status alert.
     */
    async sendSystemAlert(status: string) {
        return this.sendMessage(`🤖 *SYSTEM STATUS:* ${status}`);
    }

    isEnabled(): boolean {
        return !!(this.token && this.chatId);
    }
}

export const telegram = new TelegramManager();
