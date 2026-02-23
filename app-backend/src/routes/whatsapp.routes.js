/**
 * WhatsApp Routes for Fastify
 * API endpoints for WhatsApp Business integration
 */

const settingsController = require('../controllers/settings.controller');

async function whatsappRoutes(fastify, options) {
  const { requireRole } = require('../middleware/roles');

  /**
   * GET /api/whatsapp/templates
   * Get WhatsApp templates using user's saved credentials
   */
  fastify.get('/templates', {
    preHandler: requireRole(['owner', 'admin', 'manager', 'agent'])
  }, settingsController.getWhatsappTemplates);

  /**
   * POST /api/whatsapp/send-template
   * Send WhatsApp template using user's saved credentials
   */
  fastify.post('/send-template', {
    preHandler: requireRole(['owner', 'admin', 'manager', 'agent'])
  }, settingsController.sendWhatsappTemplate);

  /**
   * POST /api/whatsapp/send-text
   * Send a free-form WhatsApp text message (works with Twilio sandbox)
   */
  fastify.post('/send-text', {
    preHandler: requireRole(['owner', 'admin', 'manager', 'agent'])
  }, settingsController.sendWhatsappText);

  /**
   * GET /api/whatsapp/config
   * Get WhatsApp configuration status for current user
   */
  fastify.get('/config', {
    preHandler: requireRole(['owner', 'admin', 'manager', 'agent'])
  }, settingsController.getWhatsappSettings);
}

module.exports = whatsappRoutes;
