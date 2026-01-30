const axios = require('axios');
const config = require('./src/config/config');

async function testElevenLabsPhoneCall() {
    console.log('Testing ElevenLabs Phone Call API');
    console.log('==================================\n');

    const API_KEY = config.elevenLabs.apiKey;
    const AGENT_ID = config.elevenLabs.agentId;
    const PHONE_NUMBER_ID = config.elevenLabs.phoneNumberId;
    const TEST_NUMBER = '+916381143136';

    console.log('Config:');
    console.log('  Agent ID:', AGENT_ID);
    console.log('  Phone Number ID:', PHONE_NUMBER_ID);
    console.log('  To:', TEST_NUMBER);
    console.log('');

    // Try different endpoint patterns
    const endpoints = [
        {
            name: 'Agents Call Endpoint',
            url: `https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}/call`,
            data: {
                phone_number_id: PHONE_NUMBER_ID,
                to_number: TEST_NUMBER
            }
        },
        {
            name: 'Phone Number Call',
            url: `https://api.elevenlabs.io/v1/convai/phone-numbers/${PHONE_NUMBER_ID}/call`,
            data: {
                agent_id: AGENT_ID,
                to_number: TEST_NUMBER
            }
        },
        {
            name: 'Conversations Outbound',
            url: 'https://api.elevenlabs.io/v1/convai/conversations/outbound',
            data: {
                agent_id: AGENT_ID,
                phone_number_id: PHONE_NUMBER_ID,
                to_number: TEST_NUMBER
            }
        },
        {
            name: 'Direct Call',
            url: 'https://api.elevenlabs.io/v1/convai/call',
            data: {
                agent_id: AGENT_ID,
                phone_number_id: PHONE_NUMBER_ID,
                to_number: TEST_NUMBER
            }
        }
    ];

    for (const endpoint of endpoints) {
        console.log(`\nTrying: ${endpoint.name}`);
        console.log(`URL: ${endpoint.url}`);
        console.log(`Data:`, JSON.stringify(endpoint.data, null, 2));

        try {
            const response = await axios.post(endpoint.url, endpoint.data, {
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ SUCCESS!');
            console.log('Response:', JSON.stringify(response.data, null, 2));
            console.log('\n🎉 FOUND WORKING ENDPOINT!');
            break;

        } catch (error) {
            console.log('❌ Failed');
            console.log('Status:', error.response?.status);
            console.log('Error:', error.response?.data?.detail || error.message);
        }
    }
}

testElevenLabsPhoneCall();
