/**
 * Notification Schema
 * MongoDB model for in-app notifications (bell icon)
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: [
            'lead_assigned',
            'task_assigned',
            'lead_status_high',
            'agent_registered'
        ],
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        trim: true
    },
    avatarFallback: {
        type: String,
        default: 'N'
    },
    iconType: {
        type: String,
        enum: ['flag', 'user', 'settings', 'mail'],
        default: 'mail'
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Compound index for efficient queries: get unread notifications for a user
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
// Index for fetching all notifications for user sorted by date
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
