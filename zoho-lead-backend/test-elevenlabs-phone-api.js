const axios = require('axios');
const config = require('./src/config/config');

async function testElevenLabsPhoneAPI() {
    console.log('Testing ElevenLabs Phone Number API');
    console.log('====================================\n');

    const API_KEY = config.elevenLabs.apiKey;
    const PHONE_NUMBER_ID = config.elevenLabs.phoneNumberId;
    const AGENT_ID = config.elevenLabs.agentId;

    console.log('Configuration:');
    console.log('  Phone Number ID:', PHONE_NUMBER_ID);
    console.log('  Agent ID:', AGENT_ID);
    console.log('');

    // Try the phone number specific endpoint
    const endpoints = [
        {
            name: 'Phone Number Call Endpoint',
            url: `https://api.elevenlabs.io/v1/convai/phone-numbers/${PHONE_NUMBER_ID}/call`,
            method: 'POST',
            data: {
                agent_id: AGENT_ID,
                to_number: '+916381143136'
            }
        },
        {
            name: 'Phone Number Initiate',
            url: `https://api.elevenlabs.io/v1/convai/phone-numbers/${PHONE_NUMBER_ID}/initiate`,
            method: 'POST',
            data: {
                agent_id: AGENT_ID,
                to_number: '+916381143136'
            }
        },
        {
            name: 'Agent Call via Phone',
            url: `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}/call`,
            method: 'POST',
            data: {
                phone_number_id: PHONE_NUMBER_ID,
                to_number: '+916381143136'
            }
        }
    ];

    for (const endpoint of endpoints) {
        console.log(`\nTesting: ${endpoint.name}`);
        console.log(`URL: ${endpoint.url}`);
        console.log(`Data:`, JSON.stringify(endpoint.data, null, 2));

        try {
            const response = await axios({
                method: endpoint.method,
                url: endpoint.url,
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json'
                },
                data: endpoint.data
            });

            console.log('✅ SUCCESS!');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            break; // Stop on first success

        } catch (error) {
            console.log('❌ Failed');
            console.log('Status:', error.response?.status);
            console.log('Error:', error.response?.data?.detail || error.message);
        }
    }
}

testElevenLabsPhoneAPI();
