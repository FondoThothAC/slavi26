import { WebSocketServer, WebSocket } from 'ws';

// Variables globales para mantener el estado del servidor y los clientes
let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

/**
 * Inicializa el servidor de WebSockets en el puerto especificado.
 */
export function startWebSocketServer(port: number = 8080): WebSocketServer {
    if (wss) {
        console.log(`[WS] Reusing existing WebSocket server on ${port}`);
        return wss;
    }

    wss = new WebSocketServer({ port });

    console.log(`[Dashboard] 📡 Servidor WebSocket (Antigravity Engine) escuchando en puerto ${port}`);

    wss.on('connection', (ws: WebSocket) => {
        console.log('[Dashboard] 🟢 Nuevo cliente conectado al panel');
        clients.add(ws);

        ws.on('close', () => {
            console.log('[Dashboard] 🔴 Cliente desconectado');
            clients.delete(ws);
        });

        ws.on('error', (error) => {
            console.error('[Dashboard] ⚠️ Error en WebSocket:', error);
        });
    });

    wss.on('error', (err: any) => {
        if (err?.code === 'EADDRINUSE') {
            console.error(`[WS] Port ${port} already in use. Retrying or cleanup needed.`);
            return;
        }
        console.error('[WS] Server error:', err);
    });

    return wss;
}

/**
 * Detiene el servidor de WebSockets limpiamente.
 */
export async function stopWebSocketServer(): Promise<void> {
    if (!wss) return;

    console.log('[WS] Closing WebSocket server...');
    
    // Close all active connections first
    clients.forEach(client => {
        client.terminate();
    });
    clients.clear();

    return new Promise((resolve) => {
        wss!.close(() => {
            console.log('[WS] WebSocket server closed.');
            wss = null;
            resolve();
        });
    });
}

/**
 * Función para emitir datos a todos los paneles (clientes) conectados.
 * @param payload Objeto que contiene capital, trades o logs.
 */
export function broadcastToDashboard(payload: {
    capital?: string;
    trades?: Array<{ id: string; symbol: string; pnl: number; status: string }>;
    log?: string;
    stats?: any; // For full stats sync
}) {
    if (!wss) return; // Si el servidor no ha iniciado, no hace nada

    const message = JSON.stringify(payload);

    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}
