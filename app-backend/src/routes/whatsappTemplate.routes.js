/**
 * WhatsApp Template Routes
 * CRUD + Twilio Content API integration endpoints
 */

const templateController = require('../controllers/whatsappTemplate.controller');

async function whatsappTemplateRoutes(fastify, options) {
  const { requireRole } = require('../middleware/roles');

  /**
   * GET /api/whatsapp-templates
   * List all templates for the user's org (optionally filtered by status)
   */
  fastify.get('/', {
    preHandler: requireRole(['owner', 'admin', 'manager', 'agent'])
  }, templateController.listTemplates);

  /**
   * GET /api/whatsapp-templates/approved
   * Get only approved templates (for automation builder)
   * NOTE: This must be registered BEFORE /:id to avoid conflicts
   */
  fastify.get('/approved', {
    preHandler: requireRole(['owner', 'admin', 'manager', 'agent'])
  }, templateController.getApprovedTemplates);

  /**
   * POST /api/whatsapp-templates/sync
   * Sync template statuses from Twilio + import missing
   */
  fastify.post('/sync', {
    preHandler: requireRole(['owner', 'admin'])
  }, templateController.syncTemplates);

  /**
   * GET /api/whatsapp-templates/:id
   * Get a single template
   */
  fastify.get('/:id', {
    preHandler: requireRole(['owner', 'admin', 'manager'])
  }, templateController.getTemplate);

  /**
   * POST /api/whatsapp-templates
   * Create a new template (draft)
   */
  fastify.post('/', {
    preHandler: requireRole(['owner', 'admin'])
  }, templateController.createTemplate);

  /**
   * PUT /api/whatsapp-templates/:id
   * Update a draft/rejected template
   */
  fastify.put('/:id', {
    preHandler: requireRole(['owner', 'admin'])
  }, templateController.updateTemplate);

  /**
   * DELETE /api/whatsapp-templates/:id
   * Delete a template
   */
  fastify.delete('/:id', {
    preHandler: requireRole(['owner', 'admin'])
  }, templateController.deleteTemplate);

  /**
   * POST /api/whatsapp-templates/:id/submit
   * Submit a template to Twilio Content API for approval
   */
  fastify.post('/:id/submit', {
    preHandler: requireRole(['owner', 'admin'])
  }, templateController.submitForApproval);
}

module.exports = whatsappTemplateRoutes;
