const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const AGENT_URL = `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`;

async function main() {
    try {
        console.log(`Fetching Agent Details for: ${AGENT_ID}...`);
        const response = await axios.get(AGENT_URL, {
            headers: { 'xi-api-key': API_KEY }
        });

        console.log('\n--- AGENT DETAILS ---');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (err) {
        console.error('Error:', err.message);
        if (err.response) {
            console.error('Data:', JSON.stringify(err.response.data));
        }
    }
}

main();
