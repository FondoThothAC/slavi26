
import axios from 'axios';

export interface OpenClawAnalysis {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    score: number;
    reasoning: string;
    sources: string[];
}

export class OpenClawIntegration {
    private apiUrl: string;
    private apiKey: string;

    constructor() {
        this.apiUrl = process.env.OPENCLAW_API_URL || 'http://localhost:3000/api/agent';
        this.apiKey = process.env.OPENCLAW_API_KEY || '';
    }

    async analyzeDeeply(keyword: string): Promise<OpenClawAnalysis | null> {
        try {
            console.log(`🔍 [OpenClaw] Requesting deep analysis for ${keyword}...`);
            
            // Note: Adjusting the payload format based on OpenClaw/Moltbot's expected API
            // Usually expects a message or a specific tool call.
            const response = await axios.post(this.apiUrl, {
                message: `Perform a deep market sentiment analysis for ${keyword}. 
                         Research recent news, social media, and market trends. 
                         Respond in JSON format with: sentiment (BULLISH/BEARISH/NEUTRAL), 
                         score (-1.0 to 1.0), reasoning (one paragraph), and sources (array of URLs).`,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds for deep analysis
            });

            // Handle potential variations in response structure
            const data = response.data;
            const content = data.response || data.message || data.output;

            if (!content) return null;

            // Attempt to extract JSON if it's wrapped in text
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    sentiment: result.sentiment || 'NEUTRAL',
                    score: result.score || 0,
                    reasoning: result.reasoning || 'No reasoning provided',
                    sources: result.sources || []
                };
            }

            return null;
        } catch (error: any) {
            console.error(`❌ [OpenClaw] Integration error:`, error.message);
            return null;
        }
    }

    isEnabled(): boolean {
        return !!process.env.OPENCLAW_API_URL;
    }
}
