/**
 * Configuration Module
 * Loads and validates environment variables
 */

require('dotenv').config();

const config = {
    // Server configuration
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // Zoho OAuth credentials
    zoho: {
        clientId: process.env.ZOHO_CLIENT_ID,
        clientSecret: process.env.ZOHO_CLIENT_SECRET,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN,
        apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in',
        accountsUrl: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in',
        scope: process.env.ZOHO_CRM_SCOPE || 'ZohoCRM.modules.ALL'
    },

    // ElevenLabs Configuration
    elevenLabs: {
        apiKey: process.env.ELEVENLABS_API_KEY || '',
        agentId: process.env.ELEVENLABS_AGENT_ID || '',
        phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID || ''  // Empty if not set
    },

    // Twilio Configuration
    twilio: {
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER || '+17655076878',
        // WhatsApp-enabled Twilio number (same or different from voice number)
        whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER || '+17655076878'
    },

    // OpenAI Configuration (for AI intent analysis)
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',  // Cost-effective model for intent analysis
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 1000
    },

    // Server Configuration
    server: {
        baseUrl: process.env.SERVER_URL || 'https://jkconstruction.com',
        webhookSecret: process.env.ELEVENLABS_WEBHOOK_SECRET  // For HMAC validation
    },

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info'
};

// Validate required environment variables
function validateConfig() {
    const required = [
        'ZOHO_CLIENT_ID',
        'ZOHO_CLIENT_SECRET',
        'ZOHO_REFRESH_TOKEN'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(', ')}\n` +
            'Please check your .env file'
        );
    }
}

// Validate on module load
validateConfig();

module.exports = config;
