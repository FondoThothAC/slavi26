import * as net from 'net';

export async function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

export async function waitForPort(port: number, timeout = 5000): Promise<void> {
    const start = Date.now();
    while (!(await isPortAvailable(port))) {
        if (Date.now() - start > timeout) {
            throw new Error(`Port ${port} still in use after ${timeout}ms`);
        }
        await new Promise(r => setTimeout(r, 500));
    }
}
