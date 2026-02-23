/**
 * Messages Routes
 * Fastify plugin for lead conversation messaging endpoints.
 * Prefix: /api/messages
 */

const messagesController = require('../controllers/messages.controller');

async function messagesRoutes(fastify, options) {
    // Send a message
    fastify.post('/', messagesController.sendMessage);

    // List conversations (grouped by lead)
    fastify.get('/conversations', messagesController.getConversations);

    // Get messages for a specific lead
    fastify.get('/conversations/:leadId', messagesController.getConversation);

    // Mark conversation as read
    fastify.patch('/conversations/:leadId/read', messagesController.markAsRead);

    // Get unread count
    fastify.get('/unread-count', messagesController.getUnreadCount);

    // Search messages
    fastify.get('/search', messagesController.searchMessages);
}

module.exports = messagesRoutes;
