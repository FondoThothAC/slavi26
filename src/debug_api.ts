import { BitsoClient } from './api';
import { config } from './config';

async function test() {
    console.log("Config Key:", config.bitso.key);
    console.log("Config Secret Length:", config.bitso.secret.length);

    const client = new BitsoClient();
    try {
        console.log("Attempting to fetch balance...");
        const balance = await client.getBalance();
        console.log("Success:", balance);
    } catch (error: any) {
        console.error("Error Message:", error.message);
        if (error.response) {
            console.error("Response Data:", error.response.data);
        }
    }
}

test();
