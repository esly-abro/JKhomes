/**
 * Campaign Model
 * For broadcasting messages (WhatsApp/SMS) to leads
 */

const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    phone: String,
    name: String,
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
        default: 'pending'
    },
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date,
    error: String
}, { _id: false });

const campaignSchema = new mongoose.Schema({
    // Organization (Multi-tenancy)
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },

    // Owner
    ownerId: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    
    // Campaign details
    name: {
        type: String,
        required: true,
        trim: true
    },
    
    // Message content
    message: {
        type: String,
        required: true
    },
    
    // Media attachment (image/document)
    media: {
        url: String,           // Public URL of uploaded file
        filename: String,      // Original filename
        mimeType: String,      // image/jpeg, image/png, etc.
        size: Number           // File size in bytes
    },
    
    // Channel
    channel: {
        type: String,
        enum: ['whatsapp', 'sms'],
        default: 'whatsapp'
    },
    
    // Targeting
    targetFilter: {
        type: {
            type: String,
            enum: ['all', 'status', 'source', 'custom'],
            default: 'all'
        },
        statuses: [String],    // Lead statuses to include
        sources: [String],     // Lead sources to include
        leadIds: [mongoose.Schema.Types.ObjectId]  // Specific leads
    },
    
    // Recipients
    recipients: [recipientSchema],
    
    // Stats
    stats: {
        total: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        delivered: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        read: { type: Number, default: 0 }
    },
    
    // Status
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'sending', 'completed', 'cancelled'],
        default: 'draft'
    },
    
    // Schedule
    scheduledAt: Date,
    startedAt: Date,
    completedAt: Date,
    
    // Error tracking
    lastError: String
    
}, {
    timestamps: true
});

// Index for efficient queries
campaignSchema.index({ ownerId: 1, createdAt: -1 });
campaignSchema.index({ status: 1 });

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign;
