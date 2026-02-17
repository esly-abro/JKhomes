/**
 * Notification Service
 * CRUD operations for in-app notifications + SSE push
 */

const Notification = require('../models/Notification');
const sseManager = require('./sse.manager');

// Map notification type → UI display helpers
const TYPE_META = {
    lead_assigned: { iconType: 'user', defaultTitle: 'New lead assigned' },
    task_assigned: { iconType: 'flag', defaultTitle: 'New task assigned' },
    lead_status_high: { iconType: 'mail', defaultTitle: 'Lead status update' },
    agent_registered: { iconType: 'settings', defaultTitle: 'New agent registered' }
};

/**
 * Create a notification and push it via SSE
 * @param {object} params
 * @param {string} params.userId - Recipient user ID
 * @param {string} params.organizationId
 * @param {string} params.type - One of: lead_assigned, task_assigned, lead_status_high, agent_registered
 * @param {string} params.title
 * @param {string} [params.message]
 * @param {string} [params.avatarFallback] - 1-2 char avatar text
 * @param {object} [params.data] - Extra payload (leadId, taskId, etc.)
 */
async function create({ userId, organizationId, type, title, message, avatarFallback, data }) {
    const meta = TYPE_META[type] || { iconType: 'mail', defaultTitle: 'Notification' };

    const notification = await Notification.create({
        userId,
        organizationId,
        type,
        title: title || meta.defaultTitle,
        message: message || '',
        avatarFallback: avatarFallback || (title ? title.charAt(0).toUpperCase() : 'N'),
        iconType: meta.iconType,
        data: data || {}
    });

    // Push to user via SSE (non-blocking)
    try {
        sseManager.sendToUser(userId, 'notification', _formatForClient(notification));
    } catch (err) {
        console.error('SSE push failed:', err.message);
    }

    return notification;
}

/**
 * Get notifications for a user with pagination
 */
async function getForUser(userId, { page = 1, limit = 30, unreadOnly = false } = {}) {
    const filter = { userId };
    if (unreadOnly) filter.isRead = false;

    const [notifications, total] = await Promise.all([
        Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Notification.countDocuments(filter)
    ]);

    return {
        notifications: notifications.map(_formatForClient),
        total,
        page,
        pages: Math.ceil(total / limit)
    };
}

/**
 * Mark a single notification as read
 */
async function markRead(notificationId, userId) {
    const result = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true },
        { new: true }
    ).lean();
    return result;
}

/**
 * Mark all notifications as read for a user
 */
async function markAllRead(userId) {
    const result = await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true }
    );
    return { modified: result.modifiedCount };
}

/**
 * Get unread count for a user
 */
async function getUnreadCount(userId) {
    return Notification.countDocuments({ userId, isRead: false });
}

/**
 * Format a DB notification document for the client
 * Maps to the Notification interface expected by NotificationMenu.tsx
 */
function _formatForClient(doc) {
    const now = new Date();
    const created = new Date(doc.createdAt);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    return {
        id: doc._id.toString(),
        type: _mapTypeToClient(doc.type),
        avatarFallback: doc.avatarFallback || 'N',
        iconType: doc.iconType || 'mail',
        title: doc.title,
        description: doc.message || '',
        time: _relativeTime(created),
        timestamp: created.toISOString(),
        isUnread: !doc.isRead,
        section: diffDays < 7 ? 'new' : 'earlier',
        data: doc.data || {}
    };
}

/**
 * Map backend notification type to client-side type enum
 */
function _mapTypeToClient(type) {
    const map = {
        lead_assigned: 'lead',
        task_assigned: 'callback',
        lead_status_high: 'status',
        agent_registered: 'visit'
    };
    return map[type] || 'lead';
}

/**
 * Relative time string (same logic as client uses)
 */
function _relativeTime(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    const diffWeeks = Math.floor(diffDays / 7);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return `${diffWeeks}w`;
}

module.exports = {
    create,
    getForUser,
    markRead,
    markAllRead,
    getUnreadCount
};
