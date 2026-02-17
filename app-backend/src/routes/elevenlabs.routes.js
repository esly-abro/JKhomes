/**
 * ElevenLabs Integration Routes
 * API endpoints for connecting and managing ElevenLabs AI calling
 */

const elevenLabsController = require('../controllers/elevenLabs.integration.controller');
const agentsController = require('../controllers/elevenLabs.agents.controller');

async function elevenLabsRoutes(fastify, options) {
    const { requireRole } = require('../middleware/roles');

    // ==========================================
    // Config Routes (existing)
    // ==========================================

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

    // ==========================================
    // Agent Management Routes (CRUD)
    // ==========================================

    /**
     * GET /api/integrations/elevenlabs/agents
     * List all ElevenLabs conversational AI agents
     */
    fastify.get('/agents', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.listAgents);

    /**
     * POST /api/integrations/elevenlabs/agents
     * Create a new ElevenLabs AI agent
     */
    fastify.post('/agents', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.createAgent);

    /**
     * GET /api/integrations/elevenlabs/agents/:agentId
     * Get details of a specific agent
     */
    fastify.get('/agents/:agentId', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.getAgent);

    /**
     * PATCH /api/integrations/elevenlabs/agents/:agentId
     * Update an existing agent
     */
    fastify.patch('/agents/:agentId', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.updateAgent);

    /**
     * DELETE /api/integrations/elevenlabs/agents/:agentId
     * Delete an agent
     */
    fastify.delete('/agents/:agentId', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.deleteAgent);

    /**
     * POST /api/integrations/elevenlabs/agents/:agentId/set-default
     * Set agent as the default for outbound calls
     */
    fastify.post('/agents/:agentId/set-default', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.setDefaultAgent);

    /**
     * GET /api/integrations/elevenlabs/voices
     * List available ElevenLabs voices
     */
    fastify.get('/voices', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.listVoices);

    /**
     * GET /api/integrations/elevenlabs/usage
     * Get AI agent usage stats for billing
     */
    fastify.get('/usage', {
        preHandler: requireRole(['owner', 'admin'])
    }, agentsController.getUsage);
}

module.exports = elevenLabsRoutes;
