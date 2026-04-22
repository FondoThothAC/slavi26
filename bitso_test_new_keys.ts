
import axios from 'axios';
import crypto from 'crypto';

const key = 'LbHUpWEuQu';
const secret = '6794107928db40eac7161bc55bf5e050';

console.log('--- Bitso Auth Test (New Keys) ---');
console.log('Key:', key);

async function test() {
    const nonce = Date.now();
    const method = 'GET';
    const requestPath = '/v3/balance';
    const payload = '';

    const message = `${nonce}${method}${requestPath}${payload}`;
    const signature = crypto.createHmac('sha256', secret).update(message).digest('hex');

    const authHeader = `Bitso ${key}:${nonce}:${signature}`;

    console.log(`Request: ${method} ${requestPath}`);
    console.log(`Nonce: ${nonce}`);

    try {
        const res = await axios.get(`https://api.bitso.com${requestPath}`, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });
        console.log('\n✅ SUCCESS!');
        console.log(JSON.stringify(res.data, null, 2));
    } catch (e: any) {
        console.error('\n❌ ERROR');
        if (e.response) {
            console.error('Status:', e.response.status);
            console.error('Data:', JSON.stringify(e.response.data, null, 2));
        } else {
            console.error(e.message);
        }
    }
}

test();
