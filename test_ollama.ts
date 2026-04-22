
import axios from 'axios';

declare var console: any;

const OLLAMA_URL = 'http://localhost:11434';

async function checkOllama() {
    console.log("🔍 Testing connection to Ollama at " + OLLAMA_URL + "...");

    try {
        // 1. Check Version/Heartbeat
        const response = await axios.get(OLLAMA_URL);
        console.log("✅ Ollama is Alive! Response:", response.data);

        // 2. List Models
        console.log("\n📦 Fetching available models...");
        const modelsParams = await axios.get(`${OLLAMA_URL}/api/tags`);
        if (modelsParams.data && modelsParams.data.models) {
            console.log("Available Models:");
            modelsParams.data.models.forEach((m: any) => {
                console.log(` - ${m.name}`);
            });

            // 3. Test Generation with first model
            const modelToUse = modelsParams.data.models[0]?.name || 'llama3';
            console.log(`\n🧠 Testing inference with model: ${modelToUse}...`);

            const prompt = {
                model: modelToUse,
                prompt: "Say 'Hello from the Trading Bot!' differently.",
                stream: false
            };

            const gen = await axios.post(`${OLLAMA_URL}/api/generate`, prompt);
            console.log("🤖 AI Says:", gen.data.response);

        } else {
            console.log("⚠️  Connected, but no models found. Run `ollama pull llama3`");
        }

    } catch (e: any) {
        console.error("❌ Could not connect to Ollama.");
        console.error("Make sure the app is running and 'ollama serve' is active.");
        console.error("Error:", e.message);
    }
}

checkOllama();
