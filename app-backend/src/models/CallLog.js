/**
 * Call Log Schema
 * MongoDB model for storing Twilio call history
 */

const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema({
    // Call identifiers
    callSid: {
        type: String,
        unique: true,
        sparse: true,
        required: true
    },
    
    // Lead information
    leadId: {
        type: String,
        required: true,
        index: true
    },
    leadName: {
        type: String
    },
    
    // Call details
    from: {
        type: String,
        required: true
    },
    to: {
        type: String,
        required: true
    },
    direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        default: 'outbound'
    },
    status: {
        type: String,
        enum: ['queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'],
        default: 'queued'
    },
    
    // Duration and timing
    duration: {
        type: Number, // in seconds
        default: 0
    },
    startTime: {
        type: Date
    },
    endTime: {
        type: Date
    },
    
    // IVR Response (if any)
    ivrResponse: {
        digit: String,
        meaning: String, // e.g., "Interested", "Not Interested", "Call Back Later"
        timestamp: Date
    },
    
    // Recording
    recordingUrl: {
        type: String
    },
    recordingSid: {
        type: String
    },
    
    // Agent info
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    agentName: {
        type: String
    },
    
    // Provider
    provider: {
        type: String,
        default: 'twilio'
    },
    
    // Notes
    notes: {
        type: String
    },
    
    // Raw response from provider
    rawResponse: {
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

// Indexes for common queries
callLogSchema.index({ leadId: 1, createdAt: -1 });
callLogSchema.index({ agentId: 1, createdAt: -1 });
callLogSchema.index({ status: 1 });
callLogSchema.index({ createdAt: -1 });
callLogSchema.index({ syncStatus: 1, createdAt: -1 });
callLogSchema.index({ zohoActivityId: 1 });

/**
 * Get calls for a lead
 */
callLogSchema.statics.getByLeadId = async function(leadId, limit = 50) {
    return this.find({ leadId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

/**
 * Get calls by agent
 */
callLogSchema.statics.getByAgentId = async function(agentId, limit = 50) {
    return this.find({ agentId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

/**
 * Get call statistics
 */
callLogSchema.statics.getStats = async function(dateFrom, dateTo) {
    const match = {};
    if (dateFrom || dateTo) {
        match.createdAt = {};
        if (dateFrom) match.createdAt.$gte = dateFrom;
        if (dateTo) match.createdAt.$lte = dateTo;
    }
    
    return this.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalDuration: { $sum: '$duration' }
            }
        }
    ]);
};

const CallLog = mongoose.model('CallLog', callLogSchema);

module.exports = CallLog;
