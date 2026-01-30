const axios = require('axios');

async function testTwilioCall() {
    console.log('Testing Twilio + ElevenLabs Integration');
    console.log('=========================================\n');

    const testData = {
        phoneNumber: '+916381143136',
        leadId: 'test_123',
        leadName: 'Test Lead'
    };

    console.log('Test Data:', testData);
    console.log('');

    try {
        const response = await axios.post('http://localhost:3000/elevenlabs/call', testData, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('✅ SUCCESS!');
        console.log('Response:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.log('❌ FAILED');
        console.log('Status:', error.response?.status);
        console.log('Error:', error.response?.data || error.message);
    }
}

testTwilioCall();
