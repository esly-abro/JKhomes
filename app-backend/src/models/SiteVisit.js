/**
 * SiteVisit Schema
 * Stores confirmed site visits for leads (leads stored in Zoho CRM)
 */

const mongoose = require('mongoose');

const siteVisitSchema = new mongoose.Schema({
    // Lead reference (Zoho CRM ID)
    leadId: {
        type: String,
        required: true,
        index: true
    },
    leadName: {
        type: String,
        required: true
    },
    leadPhone: {
        type: String
    },
    
    // Visit scheduling
    scheduledAt: {
        type: Date,
        required: true
    },
    // Store the time slot info for easier conflict checking
    scheduledDate: {
        type: String,  // Format: "YYYY-MM-DD"
        required: true
    },
    timeSlot: {
        startTime: String,  // Format: "HH:MM"
        endTime: String
    },
    duration: {
        type: Number,
        default: 60  // Minutes
    },
    completedAt: {
        type: Date
    },
    
    // Agent who scheduled/conducted the visit
    agentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    agentName: {
        type: String
    },
    
    // Visit status
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
        default: 'scheduled'
    },
    
    // Property for the site visit
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        index: true,
        required: true
    },
    
    // Visit notes
    notes: {
        type: String
    },
    
    // Cancellation info
    cancelledAt: {
        type: Date
    },
    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    cancellationReason: {
        type: String
    },
    
    // Rescheduling info
    rescheduledFrom: {
        type: Date
    },
    rescheduledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Zoho CRM sync fields
    zohoActivityId: {
        type: String,
        unique: true,
        sparse: true
        // Note: unique already creates an index, no need for separate index: true
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

// Indexes for efficient queries
siteVisitSchema.index({ leadId: 1, scheduledAt: -1 });
siteVisitSchema.index({ agentId: 1, scheduledAt: -1 });
siteVisitSchema.index({ status: 1 });
siteVisitSchema.index({ syncStatus: 1, createdAt: -1 });

// Compound index to prevent double-booking same property at same time
// Only applies to non-cancelled visits
siteVisitSchema.index(
    { propertyId: 1, scheduledDate: 1, 'timeSlot.startTime': 1, status: 1 },
    { 
        unique: true,
        partialFilterExpression: { status: { $in: ['scheduled', 'completed'] } }
    }
);

// Index for checking agent conflicts
siteVisitSchema.index({ agentId: 1, scheduledDate: 1, 'timeSlot.startTime': 1, status: 1 });

/**
 * Pre-save hook to set scheduledDate from scheduledAt
 */
siteVisitSchema.pre('save', function(next) {
    if (this.scheduledAt) {
        const date = new Date(this.scheduledAt);
        this.scheduledDate = date.toISOString().split('T')[0];
        
        // Set timeSlot if not already set
        if (!this.timeSlot || !this.timeSlot.startTime) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const startTime = `${hours}:${minutes}`;
            
            // Calculate end time based on duration
            const endDate = new Date(date.getTime() + (this.duration || 60) * 60000);
            const endHours = endDate.getHours().toString().padStart(2, '0');
            const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
            const endTime = `${endHours}:${endMinutes}`;
            
            this.timeSlot = { startTime, endTime };
        }
    }
    next();
});

/**
 * Static method to check for conflicts before booking
 */
siteVisitSchema.statics.checkConflict = async function(propertyId, scheduledDate, startTime, excludeVisitId = null) {
    const query = {
        propertyId,
        scheduledDate,
        'timeSlot.startTime': startTime,
        status: { $in: ['scheduled', 'completed'] }
    };
    
    if (excludeVisitId) {
        query._id = { $ne: excludeVisitId };
    }
    
    const existingVisit = await this.findOne(query);
    return existingVisit;
};

/**
 * Static method to check agent conflicts
 */
siteVisitSchema.statics.checkAgentConflict = async function(agentId, scheduledDate, startTime, excludeVisitId = null) {
    const query = {
        agentId,
        scheduledDate,
        'timeSlot.startTime': startTime,
        status: { $in: ['scheduled', 'completed'] }
    };
    
    if (excludeVisitId) {
        query._id = { $ne: excludeVisitId };
    }
    
    const existingVisit = await this.findOne(query);
    return existingVisit;
};

/**
 * Get site visits by agent
 */
siteVisitSchema.statics.getByAgentId = async function(agentId, limit = 50) {
    return this.find({ agentId, status: { $ne: 'cancelled' } })
        .sort({ scheduledAt: -1 })
        .limit(limit)
        .populate('agentId', 'name email')
        .populate('propertyId', 'name location');
};

/**
 * Get site visits by lead
 */
siteVisitSchema.statics.getByLeadId = async function(leadId, limit = 50) {
    return this.find({ leadId })
        .sort({ scheduledAt: -1 })
        .limit(limit)
        .populate('propertyId', 'name location');
};

/**
 * Get visits for a property on a specific date
 */
siteVisitSchema.statics.getByPropertyAndDate = async function(propertyId, date) {
    const scheduledDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.find({
        propertyId,
        scheduledDate,
        status: { $in: ['scheduled', 'completed'] }
    }).sort({ 'timeSlot.startTime': 1 });
};

/**
 * Count visits for a property on a specific date
 */
siteVisitSchema.statics.countByPropertyAndDate = async function(propertyId, date) {
    const scheduledDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.countDocuments({
        propertyId,
        scheduledDate,
        status: { $in: ['scheduled', 'completed'] }
    });
};

const SiteVisit = mongoose.model('SiteVisit', siteVisitSchema);

module.exports = SiteVisit;
