/**
 * Messages Controller
 * HTTP handlers for lead conversation messaging.
 */

const messagesService = require('../services/messages.service');
const { parsePagination } = require('../utils/pagination');

/**
 * POST /api/messages
 * Send a message in a lead conversation
 */
async function sendMessage(request, reply) {
    const { leadId, body, channel, metadata } = request.body;

    const message = await messagesService.sendMessage({
        leadId,
        body,
        channel: channel || 'internal',
        sender: {
            id: request.user.id || request.user._id,
            name: request.user.name,
            organizationId: request.user.organizationId
        },
        metadata
    });

    return reply.code(201).send({ success: true, data: message });
}

/**
 * GET /api/messages/conversations
 * List all conversations (grouped by lead) with last message + unread count
 */
async function getConversations(request, reply) {
    const pagination = parsePagination(request.query);
    const organizationId = request.user.organizationId;

    const result = await messagesService.getConversationList(organizationId, pagination);
    return reply.code(200).send({ success: true, ...result });
}

/**
 * GET /api/messages/conversations/:leadId
 * Get paginated messages for a specific lead
 */
async function getConversation(request, reply) {
    const { leadId } = request.params;
    const pagination = parsePagination(request.query);
    const organizationId = request.user.organizationId;

    const result = await messagesService.getConversation(leadId, organizationId, pagination);
    return reply.code(200).send({ success: true, ...result });
}

/**
 * PATCH /api/messages/conversations/:leadId/read
 * Mark all messages in a conversation as read
 */
async function markAsRead(request, reply) {
    const { leadId } = request.params;
    const userId = request.user.id || request.user._id;
    const organizationId = request.user.organizationId;

    const result = await messagesService.markAsRead(leadId, organizationId, userId);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * GET /api/messages/unread-count
 * Get total unread message count for the org
 */
async function getUnreadCount(request, reply) {
    const organizationId = request.user.organizationId;
    const count = await messagesService.getUnreadCount(organizationId);
    return reply.code(200).send({ success: true, data: { unreadCount: count } });
}

/**
 * GET /api/messages/search?q=...
 * Search messages by text content
 */
async function searchMessages(request, reply) {
    const { q } = request.query;
    const pagination = parsePagination(request.query);
    const organizationId = request.user.organizationId;

    const result = await messagesService.searchMessages(organizationId, q, pagination);
    return reply.code(200).send({ success: true, ...result });
}

module.exports = {
    sendMessage,
    getConversations,
    getConversation,
    markAsRead,
    getUnreadCount,
    searchMessages
};
