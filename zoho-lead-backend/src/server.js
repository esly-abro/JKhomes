/**
 * Main Server File
 * Express application entry point
 */

const express = require('express');
const cors = require('cors');
const expressWs = require('express-ws');
const config = require('./config/config');
const logger = require('./utils/logger');
const requestLogger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const leadsRoutes = require('./routes/leads');
const twilioService = require('./services/twilioElevenLabsService');

// Create Express app
const app = express();

// Enable WebSocket support
const wsInstance = expressWs(app);

// Middleware
app.use(cors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());  // Parse JSON bodies
app.use(requestLogger);  // Log all requests

// Health check endpoint
app.get('/health', (req, res) => {
    const tokenManager = require('./services/tokenManager');
    const tokenInfo = tokenManager.getTokenInfo();

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        nodejs: process.version,
        token: {
            isValid: tokenInfo.isValid,
            expiresAt: tokenInfo.expiresAt
        },
        twilio: {
            configured: !!(config.twilio?.accountSid && config.twilio?.authToken)
        }
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Zoho Lead Ingestion Backend',
        version: '1.0.0',
        endpoints: {
            'POST /leads': 'Create or update lead',
            'GET /leads/sources': 'Get valid source values',
            'POST /elevenlabs/call': 'Initiate Twilio + ElevenLabs call',
            'GET /health': 'Health check'
        }
    });
});

// API Routes
app.use('/leads', leadsRoutes);
app.use('/elevenlabs', require('./routes/elevenLabs'));
app.use('/webhook', require('./routes/webhookRoutes'));  // ElevenLabs post-call webhooks
app.use('/', require('./routes/aiWebhook'));  // Legacy AI webhook routes

// WebSocket endpoint for Twilio media streaming
app.ws('/elevenlabs/media-stream', (ws, req) => {
    const metadata = {
        callSid: req.query.callSid || 'unknown',
        leadId: req.query.leadId,
        leadName: req.query.leadName
    };

    logger.info('WebSocket connection established', metadata);
    twilioService.handleMediaStream(ws, metadata);
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.originalUrl
    });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;

app.listen(PORT, () => {
    logger.info(`🚀 Server started on port ${PORT}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`Zoho API Domain: ${config.zoho.apiDomain}`);
    logger.info(`Twilio Configured: ${!!(config.twilio?.accountSid && config.twilio?.authToken)}`);
    logger.info(`OpenAI Configured: ${!!config.openai?.apiKey}`);
    logger.info(`WhatsApp Configured: ${!!config.twilio?.whatsappNumber}`);
    logger.info('');
    logger.info('Available endpoints:');
    logger.info(`  POST   http://localhost:${PORT}/leads`);
    logger.info(`  GET    http://localhost:${PORT}/leads/sources`);
    logger.info(`  POST   http://localhost:${PORT}/elevenlabs/call`);
    logger.info(`  POST   http://localhost:${PORT}/webhook/elevenlabs  [Post-call automation]`);
    logger.info(`  POST   http://localhost:${PORT}/webhook/test        [Test webhook]`);
    logger.info(`  GET    http://localhost:${PORT}/webhook/health      [Webhook health]`);
    logger.info(`  GET    http://localhost:${PORT}/health`);
    logger.info('');
    logger.info('Ready to accept lead ingestion and ElevenLabs/Twilio calls! 🎉');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
