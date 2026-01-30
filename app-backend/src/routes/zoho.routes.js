/**
 * Zoho CRM Integration Routes
 * API endpoints for connecting and managing Zoho CRM
 */

const zohoController = require('../controllers/zohoIntegration.controller');

async function zohoRoutes(fastify, options) {
  const { requireRole } = require('../middleware/roles');

  /**
   * GET /api/integrations/zoho/config
   * Get current Zoho CRM configuration (masked)
   */
  fastify.get('/config', {
    preHandler: requireRole(['owner', 'admin'])
  }, zohoController.getZohoConfig);

  /**
   * POST /api/integrations/zoho/config
   * Save Zoho CRM credentials
   */
  fastify.post('/config', {
    preHandler: requireRole(['owner', 'admin']),
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'clientSecret', 'refreshToken'],
        properties: {
          clientId: { type: 'string', minLength: 10 },
          clientSecret: { type: 'string', minLength: 10 },
          refreshToken: { type: 'string', minLength: 10 },
          dataCenter: { type: 'string', enum: ['in', 'com', 'eu', 'au', 'jp'] }
        }
      }
    }
  }, zohoController.saveZohoConfig);

  /**
   * POST /api/integrations/zoho/test
   * Test Zoho CRM connection
   */
  fastify.post('/test', {
    preHandler: requireRole(['owner', 'admin'])
  }, zohoController.testZohoConnection);

  /**
   * DELETE /api/integrations/zoho/disconnect
   * Disconnect Zoho CRM
   */
  fastify.delete('/disconnect', {
    preHandler: requireRole(['owner', 'admin'])
  }, zohoController.disconnectZoho);

  /**
   * GET /api/integrations/zoho/data-centers
   * Get available Zoho data centers
   */
  fastify.get('/data-centers', {
    preHandler: requireRole(['owner', 'admin'])
  }, zohoController.getDataCenters);
}

module.exports = zohoRoutes;
