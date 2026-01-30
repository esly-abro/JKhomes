const axios = require('axios');
const config = require('./src/config/config');

const API_KEY = config.elevenLabs.apiKey;
const AGENT_ID = config.elevenLabs.agentId;
const PHONE_NUMBER_ID = config.elevenLabs.phoneNumberId;
const TEST_PHONE = '+916381143136';

const client = axios.create({
    baseURL: 'https://api.elevenlabs.io/v1/convai',
    headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
    },
    timeout: 30000
});

const endpoints = [
    {
        name: 'Twilio Outbound Call (v1/convai)',
        path: '/twilio/outbound-call',
        payload: {
            agent_id: AGENT_ID,
            to_number: TEST_PHONE,
            agent_phone_number_id: PHONE_NUMBER_ID
        }
    },
    {
        name: 'Twilio Outbound Call (v1 direct)',
        path: '/twilio/outbound-call',
        baseURL: 'https://api.elevenlabs.io/v1',
        payload: {
            agent_id: AGENT_ID,
            to_number: TEST_PHONE,
            agent_phone_number_id: PHONE_NUMBER_ID
        }
    },
    {
        name: 'Phone Number Initiate Call',
        path: `/phone-numbers/${PHONE_NUMBER_ID}/initiate-call`,
        payload: {
            agent_id: AGENT_ID,
            to_number: TEST_PHONE
        }
    },
    {
        name: 'Conversations Create',
        path: '/conversations',
        payload: {
            agent_id: AGENT_ID,
            phone_number_id: PHONE_NUMBER_ID,
            to_number: TEST_PHONE
        }
    },
    {
        name: 'Agent Outbound Call',
        path: `/agents/${AGENT_ID}/outbound-call`,
        payload: {
            phone_number_id: PHONE_NUMBER_ID,
            to_number: TEST_PHONE
        }
    }
];

async function testEndpoint(endpoint) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Testing: ${endpoint.name}`);
    console.log(`Endpoint: ${endpoint.path}`);
    console.log(`Payload:`, JSON.stringify(endpoint.payload, null, 2));
    console.log('='.repeat(60));

    try {
        const axiosInstance = endpoint.baseURL ? axios.create({
            baseURL: endpoint.baseURL,
            headers: {
                'xi-api-key': API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        }) : client;

        const response = await axiosInstance.post(endpoint.path, endpoint.payload);
        console.log('✅ SUCCESS!');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        return { success: true, endpoint: endpoint.name, data: response.data };
    } catch (error) {
        console.log('❌ FAILED');
        console.log('Status:', error.response?.status || 'N/A');
        console.log('Error:', error.message);
        if (error.response?.data) {
            console.log('Response:', JSON.stringify(error.response.data, null, 2));
        }
        return { success: false, endpoint: endpoint.name, error: error.message };
    }
}

async function main() {
    console.log('ElevenLabs Outbound Call Endpoint Tester');
    console.log('=========================================');
    console.log('Agent ID:', AGENT_ID);
    console.log('Has API Key:', !!API_KEY);
    console.log('Phone Number ID:', PHONE_NUMBER_ID || 'Not Set');
    console.log('Test Phone:', TEST_PHONE);

    const results = [];

    for (const endpoint of endpoints) {
        const result = await testEndpoint(endpoint);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between tests
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
        console.log('\n✅ Working Endpoints:');
        successful.forEach(r => console.log(`  - ${r.endpoint}`));
    }

    if (failed.length > 0) {
        console.log('\n❌ Failed Endpoints:');
        failed.forEach(r => console.log(`  - ${r.endpoint}: ${r.error}`));
    }

    if (successful.length === 0) {
        console.log('\n⚠️  No working endpoints found!');
        console.log('Possible issues:');
        console.log('  1. Twilio integration not configured in ElevenLabs dashboard');
        console.log('  2. Phone Number ID not set or invalid');
        console.log('  3. Agent not configured for outbound calls');
        console.log('  4. API endpoint structure has changed');
    }
}

main().catch(console.error);
