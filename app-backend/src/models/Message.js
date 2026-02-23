/**
 * Message Model
 * Stores individual messages within lead conversations.
 * Multi-tenant: scoped to organizationId.
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        required: true,
        index: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    senderName: {
        type: String,
        required: true,
        trim: true
    },
    /** 'outbound' = agent → lead, 'inbound' = lead → agent */
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        required: true,
        default: 'outbound'
    },
    /** Delivery channel through which this message was sent/received */
    channel: {
        type: String,
        enum: ['whatsapp', 'sms', 'email', 'internal', 'phone'],
        default: 'internal'
    },
    /** The actual message content */
    body: {
        type: String,
        required: true,
        maxlength: 4096
    },
    /** Status of the message in the delivery pipeline */
    status: {
        type: String,
        enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
        default: 'sent'
    },
    /** Optional: external message ID from WhatsApp/Twilio/etc. */
    externalMessageId: {
        type: String,
        sparse: true
    },
    /** Optional: metadata (template name, media URL, etc.) */
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    /** Soft delete */
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound indexes for fast lookups
messageSchema.index({ organizationId: 1, leadId: 1, createdAt: -1 });
messageSchema.index({ leadId: 1, createdAt: -1 });
messageSchema.index({ organizationId: 1, senderId: 1 });

/**
 * Get paginated messages for a lead conversation
 */
messageSchema.statics.getConversation = async function (leadId, organizationId, { page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;
    const filter = { leadId, organizationId, isDeleted: false };

    const [messages, total] = await Promise.all([
        this.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments(filter)
    ]);

    return {
        messages: messages.reverse(), // chronological order
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
};

/**
 * Get conversation summaries (last message per lead) for an organization
 */
messageSchema.statics.getConversationList = async function (organizationId, { page = 1, limit = 30 } = {}) {
    const skip = (page - 1) * limit;

    const pipeline = [
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), isDeleted: false } },
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: '$leadId',
                lastMessage: { $first: '$body' },
                lastMessageAt: { $first: '$createdAt' },
                lastDirection: { $first: '$direction' },
                lastChannel: { $first: '$channel' },
                messageCount: { $sum: 1 },
                unreadCount: {
                    $sum: {
                        $cond: [
                            { $and: [{ $eq: ['$direction', 'inbound'] }, { $ne: ['$status', 'read'] }] },
                            1, 0
                        ]
                    }
                }
            }
        },
        { $sort: { lastMessageAt: -1 } },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: limit }],
                totalCount: [{ $count: 'count' }]
            }
        }
    ];

    const [result] = await this.aggregate(pipeline);
    const conversations = result.data || [];
    const total = result.totalCount[0]?.count || 0;

    // Populate lead info
    if (conversations.length > 0) {
        const Lead = mongoose.model('Lead');
        const leadIds = conversations.map(c => c._id);
        const leads = await Lead.find({ _id: { $in: leadIds } })
            .select('name email phone status source')
            .lean();

        const leadMap = {};
        leads.forEach(l => { leadMap[l._id.toString()] = l; });

        conversations.forEach(c => {
            c.lead = leadMap[c._id.toString()] || null;
        });
    }

    return { conversations, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = mongoose.model('Message', messageSchema);
