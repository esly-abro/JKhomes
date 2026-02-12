/**
 * Activity Schema
 * MongoDB model for lead activities and notes
 */

const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    // Lead reference
    leadId: {
        type: String,
        required: true,
        index: true
    },
    
    // Activity type
    type: {
        type: String,
        enum: ['call', 'email', 'meeting', 'note', 'status_change', 'task', 'sms', 'whatsapp', 'site_visit', 'appointment'],
        required: true
    },
    
    // Activity details
    title: {
        type: String,
        required: true
    },
    description: {
        type: String
    },
    
    // Who performed the activity
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    userName: {
        type: String
    },
    
    // For scheduled activities
    scheduledAt: {
        type: Date
    },
    completedAt: {
        type: Date
    },
    isCompleted: {
        type: Boolean,
        default: false
    },
    
    // For status changes
    previousStatus: {
        type: String
    },
    newStatus: {
        type: String
    },
    
    // Related call (if activity is a call)
    callLogId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CallLog'
    },
    
    // Outcome/result
    outcome: {
        type: String,
        enum: ['positive', 'negative', 'neutral', 'pending'],
        default: 'neutral'
    },
    
    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed
    },
    
    // Zoho CRM sync fields
    zohoActivityId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    syncStatus: {
        type: String,
        enum: ['pending', 'synced', 'failed'],
        default: 'pending'
    },
    syncedAt: {
        type: Date
    },
    syncError: {
        type: String
    }
}, {
    timestamps: true
});

// Indexes
activitySchema.index({ leadId: 1, createdAt: -1 });
activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ type: 1 });
activitySchema.index({ scheduledAt: 1 });
activitySchema.index({ syncStatus: 1, createdAt: -1 });
activitySchema.index({ zohoActivityId: 1 });

/**
 * Get activities for a lead
 */
activitySchema.statics.getByLeadId = async function(leadId, limit = 50) {
    return this.find({ leadId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'name email');
};

/**
 * Get upcoming scheduled activities
 */
activitySchema.statics.getUpcoming = async function(userId, days = 7) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    const query = {
        scheduledAt: { $gte: now, $lte: future },
        isCompleted: false
    };
    
    if (userId) {
        query.userId = userId;
    }
    
    return this.find(query)
        .sort({ scheduledAt: 1 })
        .populate('userId', 'name email');
};

/**
 * Get recent activities
 */
activitySchema.statics.getRecent = async function(limit = 20) {
    return this.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('userId', 'name email');
};

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
