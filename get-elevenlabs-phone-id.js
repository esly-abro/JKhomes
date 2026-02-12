onst axios = require('axios');
require('dotenv').config({ path: './zoho-lead-backend/.env' });

const API_KEY = process.env.ELEVENLABS_API_KEY;

if (!API_KEY) {
    console.error('API Key not found in .env');
    process.exit(1);
}

const URL = 'https://api.elevenlabs.io/v1/convai/phone-numbers';

async function listNumbers() {
    try {
        console.log('Fetching phone numbers from ElevenLabs...');
        const response = await axios.get(URL, {
            headers: {
                'xi-api-key': API_KEY
            }
        });
        console.log('Success! Phone Numbers Found:');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error fetching numbers:');
        console.error(error.response ? error.response.data : error.message);
    }
}

listNumbers();
