
import { SentimentAgent } from './src/agents/SentimentAgent';

async function verifyHybridAgent() {
    const agent = new SentimentAgent();
    console.log("🚀 Testing Hybrid Sentiment Agent...");

    // Test with XRP (should fallback to Ollama if OpenClaw is not configured)
    console.log("\n--- Test 1: Market Analysis (Fallback) ---");
    const result = await agent.analyzeMarket('XRP');

    console.log("Result Model:", result.model);
    console.log("Sentiment:", result.sentiment);
    console.log("Score:", result.score);
    console.log("Reasoning:", result.reasoning);

    if (result.model === 'OpenClaw Agent') {
        console.log("✅ Success: OpenClaw analysis achieved!");
    } else {
        console.log("ℹ️ Info: Fallback to classic AI worked (OpenClaw not active/configured).");
    }

    console.log("\n--- Verification Complete ---");
}

verifyHybridAgent();
