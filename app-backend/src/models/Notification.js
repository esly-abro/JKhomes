/**
 * Notification Schema
 * MongoDB model for storing user notifications
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    type: {
        type: String,
        enum: ['sla_breach', 'stale_lead', 'new_lead', 'lead_assigned', 'stage_change', 'system', 'reminder'],
        required: true
    },
    
    title: {
        type: String,
        required: true
    },
    
    message: {
        type: String,
        required: true
    },
    
    // Related entity
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead'
    },
    
    leadName: String,
    
    // Importance level
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    
    // Status
    isRead: {
        type: Boolean,
        default: false
    },
    
    readAt: {
        type: Date
    },
    
    // Additional metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Index for fetching user notifications efficiently
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
