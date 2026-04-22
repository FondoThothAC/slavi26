
import { BitsoClient } from "../api";

export enum AgentStatus {
    STOPPED = 'STOPPED',
    RUNNING = 'RUNNING',
    PAUSED = 'PAUSED'
}

export interface AgentConfig {
    book: string;
    amount: string; // Base amount to trade
    [key: string]: any; // Allow strategy specific config
}

export abstract class Agent {
    protected client: BitsoClient;
    protected config: AgentConfig;
    public status: AgentStatus = AgentStatus.STOPPED;
    public id: string;
    public logs: string[] = [];
    public abstract type: string;

    constructor(client: BitsoClient, config: AgentConfig, id: string = Date.now().toString() + '-' + Math.floor(Math.random() * 1000)) {
        this.client = client;
        this.config = config;
        this.id = id;
    }

    abstract init(): Promise<void>;
    abstract tick(): Promise<void>;

    public async run() {
        if (this.status === AgentStatus.RUNNING) return;
        this.status = AgentStatus.RUNNING;
        this.log("Agent started");

        try {
            await this.init();
        } catch (e: any) {
            this.log(`Init failed: ${e.message}`);
            this.stop();
            return;
        }

        while (this.status === AgentStatus.RUNNING) {
            try {
                await this.tick();
            } catch (e: any) {
                this.log(`Tick error: ${e.message}`);
                await new Promise(r => setTimeout(r, 5000));
            }
            // Default loop delay, strategies can override tick to sleep internally if they want, 
            // but for backtesting we need 1 tick = 1 candle usually. 
            // In live mode, we need a delay.
            await new Promise(r => setTimeout(r, 10000)); // 10s default "tick" rate
        }
        this.log("Agent stopped loop");
    }

    public start() {
        this.run(); // Run is now the async loop
    }

    public stop() {
        this.status = AgentStatus.STOPPED;
        this.log("Agent stopped");
    }

    public pause() {
        if (this.status === AgentStatus.RUNNING) {
            this.status = AgentStatus.PAUSED;
            this.log("Agent paused");
        }
    }

    public resume() {
        if (this.status === AgentStatus.PAUSED) {
            this.status = AgentStatus.RUNNING;
            this.log("Agent resumed");
            this.run();
        }
    }

    protected log(message: string) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${this.id}] ${message}`;
        this.logs.push(logEntry);
        console.log(logEntry);
    }

    public getStatus() {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            config: this.config,
            logs: this.logs.slice(-50) // Return last 50 logs
        };
    }
}
