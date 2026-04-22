
import axios from 'axios';
import { NewsFetcher, NewsItem } from './NewsFetcher';
import { OpenClawIntegration } from '../OpenClawIntegration';

declare var console: any;

const OLLAMA_URL = 'http://localhost:11434';

export interface SentimentResult {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    score: number; // -1 to 1
    reasoning: string;
    model: string;
    timestamp: Date;
    news?: NewsItem[];
}

export class SentimentAgent {
    private fetcher: NewsFetcher;
    private openClaw: OpenClawIntegration;
    private model: string = 'qwen3-vl:235b-cloud'; // Default to one found

    constructor() {
        this.fetcher = new NewsFetcher();
        this.openClaw = new OpenClawIntegration();
        this.detectBestModel();
    }

    private async detectBestModel() {
        try {
            const res = await axios.get(`${OLLAMA_URL}/api/tags`);
            if (res.data.models && res.data.models.length > 0) {
                // Prefer light text models if available, else pick first
                const names = res.data.models.map((m: any) => m.name);
                if (names.some((n: string) => n.includes('llama3'))) this.model = names.find((n: string) => n.includes('llama3'));
                else if (names.some((n: string) => n.includes('mistral'))) this.model = names.find((n: string) => n.includes('mistral'));
                else if (names.some((n: string) => n.includes('gemma'))) this.model = names.find((n: string) => n.includes('gemma'));
                else this.model = names[0];

                console.log(`🧠 AI Agent selected model: ${this.model}`);
            }
        } catch (e) {
            console.error("Failed to detect Ollama models");
        }
    }

    async analyzeMarket(keyword: string = 'XRP'): Promise<SentimentResult> {
        // 0. Try OpenClaw Deep Analysis first if enabled
        if (this.openClaw.isEnabled()) {
            const deepResult = await this.openClaw.analyzeDeeply(keyword);
            if (deepResult) {
                console.log(`✨ [Hybrid] Using OpenClaw Deep Analysis for ${keyword}`);
                return {
                    sentiment: deepResult.sentiment,
                    score: deepResult.score,
                    reasoning: `(OpenClaw) ${deepResult.reasoning}`,
                    model: 'OpenClaw Agent',
                    timestamp: new Date(),
                    news: [] // OpenClaw manages its own sources
                };
            }
        }

        // 1. Fallback to Classic RSS + Ollama logic
        const news = await this.fetcher.fetchLatestNews(keyword);
        if (news.length === 0) {
            return {
                sentiment: 'NEUTRAL',
                score: 0,
                reasoning: 'No news found to analyze.',
                model: this.model,
                timestamp: new Date(),
                news: []
            };
        }

        // 2. Prepare Prompt
        const newsText = news.map(n => `- ${n.title}: ${n.description}`).join('\n');
        const prompt = `
        Analyze the following crypto news for ${keyword}:
        ${newsText}

        Determine the immediate market sentiment. 
        Respond in strict JSON format:
        {
            "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
            "score": <number between -1.0 and 1.0>,
            "reasoning": "<one sentence summary>"
        }
        Do not add any text outside the JSON.
        `;

        // 3. Query Ollama
        try {
            const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
                model: this.model,
                prompt: prompt,
                stream: false,
                format: "json" // Force JSON mode
            });

            const result = JSON.parse(response.data.response);
            return {
                sentiment: result.sentiment || 'NEUTRAL',
                score: result.score || 0,
                reasoning: result.reasoning || 'Analysis failed',
                model: this.model,
                timestamp: new Date(),
                news: news
            };

        } catch (e: any) {
            console.error("AI Analysis Failed:", e.message);
            return {
                sentiment: 'NEUTRAL',
                score: 0,
                reasoning: 'AI unresponsive',
                model: this.model,
                timestamp: new Date(),
                news: news
            };
        }
    }
}
