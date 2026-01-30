require('dotenv').config();
const axios = require('axios');
const config = require('./src/config/config');

async function getHistory() {
    try {
        console.log('Fetching conversations with API Key:', config.elevenLabs.apiKey.substring(0, 5) + '...');

        const response = await axios.get('https://api.elevenlabs.io/v1/convai/conversations', {
            headers: {
                'xi-api-key': config.elevenLabs.apiKey
            }
        });

        console.log('Conversations found:', response.data.conversations.length);

        if (response.data.conversations.length > 0) {
            console.log('Most recent conversation sample:');
            console.log(JSON.stringify(response.data.conversations[0], null, 2));

            const convId = response.data.conversations[0].conversation_id;
            console.log(`\nFetching details for ${convId}...`);

            const details = await axios.get(`https://api.elevenlabs.io/v1/convai/conversations/${convId}`, {
                headers: {
                    'xi-api-key': config.elevenLabs.apiKey
                }
            });

            const fs = require('fs');
            fs.writeFileSync('history_output.json', JSON.stringify(details.data, null, 2));
            console.log('Saved details to history_output.json');
        } else {
            console.log('No conversations found.');
        }
    } catch (error) {
        console.error('Error fetching history:', error.response ? error.response.data : error.message);
    }
}

getHistory();
