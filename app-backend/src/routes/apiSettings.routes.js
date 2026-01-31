/**
 * API Settings Routes
 * Endpoints for managing encrypted API credentials
 */

const apiSettingsController = require('../controllers/apiSettings.controller');

async function apiSettingsRoutes(fastify, options) {
    // Auth is handled by parent app.register wrapper
    
    // Get encryption status (admin only)
    fastify.get('/encryption-status', apiSettingsController.getEncryptionStatus);
    
    // Get all API connection statuses
    fastify.get('/status', apiSettingsController.getApiConnectionStatus);
    
    // Get masked credentials for a specific provider
    fastify.get('/credentials/:provider', apiSettingsController.getMaskedCredentials);
    
    // Save Twilio credentials
    fastify.post('/twilio', apiSettingsController.saveTwilioCredentials);
    
    // Test Twilio connection
    fastify.post('/twilio/test', apiSettingsController.testTwilioConnection);
    
    // Save WhatsApp credentials
    fastify.post('/whatsapp', apiSettingsController.saveWhatsappCredentials);
    
    // Test WhatsApp connection
    fastify.post('/whatsapp/test', apiSettingsController.testWhatsappConnection);
    
    // Delete credentials for a provider
    fastify.delete('/credentials/:provider', apiSettingsController.deleteCredentials);
}

module.exports = apiSettingsRoutes;
