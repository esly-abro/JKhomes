/**
 * ElevenLabs Integration Routes
 * API endpoints for connecting and managing ElevenLabs AI calling
 */

const elevenLabsController = require('../controllers/elevenLabs.integration.controller');

async function elevenLabsRoutes(fastify, options) {
    const { requireRole } = require('../middleware/roles');

    /**
     * GET /api/integrations/elevenlabs/config
     * Get current ElevenLabs configuration (masked)
     */
    fastify.get('/config', {
        preHandler: requireRole(['owner', 'admin'])
    }, elevenLabsController.getElevenLabsConfig);

    /**
     * POST /api/integrations/elevenlabs/config
     * Save ElevenLabs credentials
     */
    fastify.post('/config', {
        preHandler: requireRole(['owner', 'admin']),
        schema: {
            body: {
                type: 'object',
                required: ['apiKey', 'agentId'],
                properties: {
                    apiKey: { type: 'string', minLength: 10 },
                    agentId: { type: 'string', minLength: 5 },
                    phoneNumberId: { type: 'string' }
                }
            }
        }
    }, elevenLabsController.saveElevenLabsConfig);

    /**
     * POST /api/integrations/elevenlabs/test
     * Test ElevenLabs connection
     */
    fastify.post('/test', {
        preHandler: requireRole(['owner', 'admin'])
    }, elevenLabsController.testElevenLabsConnection);

    /**
     * DELETE /api/integrations/elevenlabs/disconnect
     * Disconnect ElevenLabs
     */
    fastify.delete('/disconnect', {
        preHandler: requireRole(['owner', 'admin'])
    }, elevenLabsController.disconnectElevenLabs);
}

module.exports = elevenLabsRoutes;
