/**
 * Messages Service
 * Business logic for lead conversations and messaging.
 */

const Message = require('../models/Message');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { NotFoundError, ValidationError } = require('../errors/AppError');
const logger = require('../utils/logger');

class MessagesService {
    /**
     * Send a message to a lead
     * @param {Object} params
     * @param {string} params.leadId - Lead to message
     * @param {string} params.body - Message body
     * @param {string} params.channel - Delivery channel
     * @param {Object} params.sender - Authenticated user { id, name, organizationId }
     * @returns {Object} Created message
     */
    async sendMessage({ leadId, body, channel = 'internal', sender, metadata = {} }) {
        // Validate lead exists and belongs to the same org
        const lead = await Lead.findOne({
            _id: leadId,
            organizationId: sender.organizationId
        });
        if (!lead) {
            throw new NotFoundError('Lead not found');
        }

        if (!body || !body.trim()) {
            throw new ValidationError('Message body cannot be empty');
        }

        const message = await Message.create({
            organizationId: sender.organizationId,
            leadId,
            senderId: sender.id,
            senderName: sender.name || sender.email || 'Agent',
            direction: 'outbound',
            channel,
            body: body.trim(),
            status: channel === 'internal' ? 'delivered' : 'queued',
            metadata
        });

        // Log activity
        try {
            await Activity.create({
                type: 'message',
                description: `Message sent via ${channel}: "${body.substring(0, 80)}${body.length > 80 ? '...' : ''}"`,
                userId: sender.id,
                userName: sender.name || sender.email,
                leadId,
                organizationId: sender.organizationId,
                metadata: { messageId: message._id, channel }
            });
        } catch (err) {
            logger.warn('Failed to log message activity', { error: err.message });
        }

        // Update lead's last contact timestamp
        try {
            await Lead.findByIdAndUpdate(leadId, {
                lastContactAt: new Date(),
                ...(channel === 'whatsapp' && { whatsappStatus: 'sent', lastWhatsappAt: new Date() })
            });
        } catch (err) {
            logger.warn('Failed to update lead contact timestamp', { error: err.message });
        }

        return message.toObject();
    }

    /**
     * Get messages for a lead conversation
     */
    async getConversation(leadId, organizationId, { page = 1, limit = 50 } = {}) {
        // Verify lead belongs to org
        const lead = await Lead.findOne({ _id: leadId, organizationId }).select('name email phone').lean();
        if (!lead) {
            throw new NotFoundError('Lead not found');
        }

        const result = await Message.getConversation(leadId, organizationId, { page, limit });
        return {
            lead,
            ...result
        };
    }

    /**
     * Get conversation list (inbox) for an organization
     */
    async getConversationList(organizationId, { page = 1, limit = 30 } = {}) {
        return Message.getConversationList(organizationId, { page, limit });
    }

    /**
     * Mark messages as read
     */
    async markAsRead(leadId, organizationId, userId) {
        const result = await Message.updateMany(
            {
                leadId,
                organizationId,
                direction: 'inbound',
                status: { $ne: 'read' }
            },
            { $set: { status: 'read' } }
        );
        return { updated: result.modifiedCount };
    }

    /**
     * Get unread message count per org
     */
    async getUnreadCount(organizationId) {
        const count = await Message.countDocuments({
            organizationId,
            direction: 'inbound',
            status: { $ne: 'read' },
            isDeleted: false
        });
        return { unreadCount: count };
    }

    /**
     * Search messages within an org
     */
    async searchMessages(organizationId, query, { page = 1, limit = 20 } = {}) {
        const skip = (page - 1) * limit;
        const filter = {
            organizationId,
            isDeleted: false,
            body: { $regex: query, $options: 'i' }
        };

        const [messages, total] = await Promise.all([
            Message.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('leadId', 'name email phone')
                .lean(),
            Message.countDocuments(filter)
        ]);

        return { messages, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
}

module.exports = new MessagesService();
