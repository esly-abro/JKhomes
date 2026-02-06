/**
 * Environment Configuration
 * Centralized configuration management from environment variables
 */

require('dotenv').config();

// In development/demo mode, only JWT_SECRET is truly required
const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'development';

const requiredVars = isDemoMode
    ? ['JWT_SECRET']
    : [
        'JWT_SECRET',
        'ZOHO_CLIENT_ID',
        'ZOHO_CLIENT_SECRET',
        'ZOHO_REFRESH_TOKEN',
        'INGESTION_SERVICE_URL',
        'INGESTION_SERVICE_API_KEY'
    ];

// Validate required environment variables
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

// Test dotenv loading
console.log('Loaded Environment Variables:', {
    JWT_SECRET: process.env.JWT_SECRET,
    ZOHO_CLIENT_ID: process.env.ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET: process.env.ZOHO_CLIENT_SECRET,
    ZOHO_REFRESH_TOKEN: process.env.ZOHO_REFRESH_TOKEN,
    INGESTION_SERVICE_URL: process.env.INGESTION_SERVICE_URL,
    INGESTION_SERVICE_API_KEY: process.env.INGESTION_SERVICE_API_KEY
});

const config = {
    // Server
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    port: parseInt(process.env.PORT, 10) || 4000,

    // MongoDB
    mongodb: {
        uri: process.env.MONGODB_URI || null, // null = use in-memory fallback
        dbName: process.env.MONGODB_DB_NAME || 'leadflow'
    },

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET,
        accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
    },

    // Zoho CRM
    zoho: {
        clientId: process.env.ZOHO_CLIENT_ID,
        clientSecret: process.env.ZOHO_CLIENT_SECRET,
        refreshToken: process.env.ZOHO_REFRESH_TOKEN,
        apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.in',
        accountsUrl: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in'
    },

    // Ingestion Service
    ingestion: {
        url: process.env.INGESTION_SERVICE_URL,
        apiKey: process.env.INGESTION_SERVICE_API_KEY
    },

    // ElevenLabs
    elevenLabs: {
        apiKey: process.env.ELEVENLABS_API_KEY,
        agentId: process.env.ELEVENLABS_AGENT_ID,
        phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID
    },

    // CORS - allow multiple localhost ports in development
    cors: {
        origin: process.env.FRONTEND_URL || [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:5176',
            'http://localhost:3000'
        ]
    }
};

module.exports = config;
