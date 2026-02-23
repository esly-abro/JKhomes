/**
 * Invite Controller
 * HTTP handlers for team member invitation management.
 */

const inviteService = require('../services/invite.service');

/**
 * POST /api/invites
 * Send an invitation to a new team member
 */
async function sendInvite(request, reply) {
    const { email, role } = request.body;
    const inviter = {
        id: request.user.id || request.user._id,
        name: request.user.name,
        organizationId: request.user.organizationId
    };

    const invite = await inviteService.sendInvite({ email, role }, inviter);
    return reply.code(201).send({ success: true, data: invite });
}

/**
 * GET /api/invites
 * List invitations (optional ?status=pending|accepted|expired|revoked)
 */
async function listInvites(request, reply) {
    const organizationId = request.user.organizationId;
    const { status } = request.query;

    const invites = await inviteService.listInvites(organizationId, { status });
    return reply.code(200).send({ success: true, data: invites });
}

/**
 * DELETE /api/invites/:id
 * Revoke a pending invitation
 */
async function revokeInvite(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const result = await inviteService.revokeInvite(id, organizationId);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * POST /api/invites/accept
 * Accept an invitation using the token (called during registration)
 */
async function acceptInvite(request, reply) {
    const { token } = request.body;
    const userId = request.user.id || request.user._id;

    const result = await inviteService.acceptInvite(token, userId);
    return reply.code(200).send({ success: true, data: result });
}

module.exports = {
    sendInvite,
    listInvites,
    revokeInvite,
    acceptInvite
};
