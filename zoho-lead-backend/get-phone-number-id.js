const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.ELEVENLABS_API_KEY || 'sk_90e4e41a67b86e10d3a2854708e107c93b5638df5947efeb';

async function getPhoneNumbers() {
    try {
        console.log('Fetching ElevenLabs Phone Numbers...\n');

        const response = await axios.get('https://api.elevenlabs.io/v1/convai/phone-numbers', {
            headers: { 'xi-api-key': API_KEY }
        });

        console.log('✅ Phone Numbers Retrieved:\n');
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data && response.data.phone_numbers) {
            console.log('\n📋 Summary:');
            response.data.phone_numbers.forEach(phone => {
                console.log(`\nName: ${phone.name}`);
                console.log(`Phone Number: ${phone.number}`);
                console.log(`Phone Number ID: ${phone.phone_number_id}`);
                console.log(`Agent ID: ${phone.agent_id || 'Not assigned'}`);
                console.log(`Provider: ${phone.provider || 'Unknown'}`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

getPhoneNumbers();
