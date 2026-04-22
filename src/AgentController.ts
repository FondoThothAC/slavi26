
import { Agent, AgentStatus } from './strategies/Agent';
import { MakerMaker } from './strategies/maker_maker';
import { MakerTaker } from './strategies/maker_taker';
import { ElevadorChino } from './strategies/elevador_chino';
import { TriangularArbitrage } from './strategies/triangular_arbitrage';
import { BitsoClient } from './api';

export class AgentController {
    private agents: Map<string, Agent> = new Map();
    private client: BitsoClient;

    constructor(client: BitsoClient) {
        this.client = client;
    }

    createAgent(type: 'maker-maker' | 'maker-taker' | 'elevador-chino' | 'triangular-arbitrage', config: any) {
        let agent: Agent;
        switch (type) {
            case 'maker-maker':
                agent = new MakerMaker(this.client, config);
                break;
            case 'maker-taker':
                agent = new MakerTaker(this.client, config);
                break;
            case 'elevador-chino':
                agent = new ElevadorChino(this.client, config);
                break;
            case 'triangular-arbitrage':
                agent = new TriangularArbitrage(this.client, config);
                break;
            default:
                throw new Error("Unknown strategy type");
        }

        this.agents.set(agent.id, agent);
        agent.start();
        return agent.getStatus();
    }

    getAgent(id: string) {
        return this.agents.get(id);
    }

    getAllAgents() {
        return Array.from(this.agents.values()).map(a => a.getStatus());
    }

    stopAgent(id: string) {
        const agent = this.agents.get(id);
        if (agent) {
            agent.stop();
            return true;
        }
        return false;
    }

    pauseAgent(id: string) {
        const agent = this.agents.get(id);
        if (agent) agent.pause();
    }

    resumeAgent(id: string) {
        const agent = this.agents.get(id);
        if (agent) agent.resume();
    }

    deleteAgent(id: string) {
        this.stopAgent(id);
        return this.agents.delete(id);
    }
}
