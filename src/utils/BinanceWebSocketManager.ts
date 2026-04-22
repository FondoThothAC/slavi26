import { WebSocketService } from '../services/WebSocketService';

/**
 * @description Manager especializado para los streams de Binance.
 * Actúa como un wrapper del WebSocketService para facilitar la integración en el motor.
 */
export class BinanceWebSocketManager {
    private static instance: WebSocketService;

    public static getInstance(): WebSocketService {
        if (!BinanceWebSocketManager.instance) {
            BinanceWebSocketManager.instance = new WebSocketService();
        }
        return BinanceWebSocketManager.instance;
    }
}
