require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../src/config/env');
const elevenLabsService = require('../src/services/elevenLabs.service');

async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(config.mongodb.uri);
        console.log('Connected.');

        const result = await elevenLabsService.syncConversations();
        console.log('Sync result:', result);

        process.exit(0);
    } catch (error) {
        console.error('Script failed:', error);
        process.exit(1);
    }
}

run();
