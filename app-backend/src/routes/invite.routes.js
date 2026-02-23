/**
 * Invite Routes
 * Fastify plugin for team member invitation endpoints.
 * Prefix: /api/invites
 */

const inviteController = require('../controllers/invite.controller');
const { requireRole } = require('../middleware/roles');

async function inviteRoutes(fastify, options) {
    // Send invite (owner/admin only)
    fastify.post('/', {
        preHandler: requireRole(['owner', 'admin'])
    }, inviteController.sendInvite);

    // List invites (owner/admin only)
    fastify.get('/', {
        preHandler: requireRole(['owner', 'admin'])
    }, inviteController.listInvites);

    // Revoke invite (owner/admin only)
    fastify.delete('/:id', {
        preHandler: requireRole(['owner', 'admin'])
    }, inviteController.revokeInvite);

    // Accept invite (any authenticated user)
    fastify.post('/accept', inviteController.acceptInvite);
}

module.exports = inviteRoutes;
