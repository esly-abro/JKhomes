const axios = require('axios');
const config = require('./src/config/config');

const API_KEY = config.elevenLabs.apiKey;
const AGENT_ID = config.elevenLabs.agentId;
const PHONE_NUMBER_ID = config.elevenLabs.phoneNumberId;
const TEST_PHONE = '+916381143136';

async function testCall() {
    console.log('Testing ElevenLabs Twilio Outbound Call');
    console.log('========================================');
    console.log('Agent ID:', AGENT_ID);
    console.log('Phone Number ID:', PHONE_NUMBER_ID);
    console.log('To:', TEST_PHONE);
    console.log('');

    const payload = {
        agent_id: AGENT_ID,
        agent_phone_number_id: PHONE_NUMBER_ID,
        to_number: TEST_PHONE
    };

    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('');

    try {
        const response = await axios.post(
            'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
            payload,
            {
                headers: {
                    'xi-api-key': API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.log('❌ FAILED');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.message);
        console.log('Response Data:', JSON.stringify(error.response?.data, null, 2));
        console.log('');
        console.log('Full Error Details:');
        console.log('URL:', error.config?.url);
        console.log('Method:', error.config?.method);
        console.log('Headers:', JSON.stringify(error.config?.headers, null, 2));
    }
}

testCall();
