/**
 * Appointment (formerly SiteVisit) Schema
 * Generic appointment/meeting model for all industries.
 * Real estate: "Site Visit", SaaS: "Demo", Healthcare: "Consultation", etc.
 * MongoDB collection remains 'sitevisits' for backward compatibility.
 */

const mongoose = require('mongoose');

const siteVisitSchema = new mongoose.Schema({
    // Organization scope for multi-tenancy
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    
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

    // Appointment type — configurable per tenant ("site_visit", "demo", "consultation", etc.)
    appointmentType: {
        type: String,
        default: 'site_visit',
        trim: true,
        lowercase: true
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
    
    // Property for the site visit (optional - for real estate and catalog-based orgs)
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property',
        index: true,
        sparse: true,
        required: false
    },
    
    // Generic resource/inventory item for catalog-based appointments (optional)
    inventoryItemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InventoryItem',
        index: true,
        sparse: true,
        required: false
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
siteVisitSchema.index({ organizationId: 1, leadId: 1, scheduledAt: -1 });
siteVisitSchema.index({ agentId: 1, scheduledAt: -1 });
siteVisitSchema.index({ status: 1 });
siteVisitSchema.index({ syncStatus: 1, createdAt: -1 });

// Compound index to prevent double-booking same property at same time
// Only applies to non-cancelled visits with propertyId (sparse index)
siteVisitSchema.index(
    { organizationId: 1, propertyId: 1, scheduledDate: 1, 'timeSlot.startTime': 1, status: 1 },
    { 
        unique: true,
        sparse: true,
        partialFilterExpression: { propertyId: { $exists: true }, status: { $in: ['scheduled', 'completed'] } }
    }
);

// Index for checking agent conflicts
siteVisitSchema.index({ agentId: 1, scheduledDate: 1, 'timeSlot.startTime': 1, status: 1 });

/**
 * Pre-save hook: Validation and data transformation
 * 1. Validate that either propertyId or inventoryItemId is set
 * 2. Set scheduledDate from scheduledAt
 * 3. Set timeSlot based on scheduledAt and duration
 */
siteVisitSchema.pre('save', async function() {
    // Validation: Ensure either propertyId or inventoryItemId is set
    if (!this.propertyId && !this.inventoryItemId) {
        throw new Error('Either propertyId or inventoryItemId must be provided');
    }
    
    // Set scheduledDate from scheduledAt
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
});

/**
 * Static method to check for conflicts before booking
 * Supports both property-based (real estate) and resource-based (generic) bookings
 */
siteVisitSchema.statics.checkConflict = async function(organizationId, scheduledDate, startTime, resourceQuery = {}, excludeVisitId = null) {
    const query = {
        organizationId,
        scheduledDate,
        'timeSlot.startTime': startTime,
        status: { $in: ['scheduled', 'completed'] },
        ...resourceQuery  // Can be { propertyId } or { inventoryItemId } or { agentId }
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
siteVisitSchema.statics.getByAgentId = async function(organizationId, agentId, limit = 50) {
    return this.find({ organizationId, agentId, status: { $ne: 'cancelled' } })
        .sort({ scheduledAt: -1 })
        .limit(limit)
        .populate('agentId', 'name email')
        .populate('propertyId', 'name location');
};

/**
 * Get site visits by lead
 */
siteVisitSchema.statics.getByLeadId = async function(organizationId, leadId, limit = 50) {
    return this.find({ organizationId, leadId })
        .sort({ scheduledAt: -1 })
        .limit(limit)
        .populate('propertyId', 'name location');
};

/**
 * Get visits for a property on a specific date
 */
siteVisitSchema.statics.getByPropertyAndDate = async function(organizationId, propertyId, date) {
    const scheduledDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.find({
        organizationId,
        propertyId,
        scheduledDate,
        status: { $in: ['scheduled', 'completed'] }
    }).sort({ 'timeSlot.startTime': 1 });
};

/**
 * Count visits for a property on a specific date
 */
siteVisitSchema.statics.countByPropertyAndDate = async function(organizationId, propertyId, date) {
    const scheduledDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    return this.countDocuments({
        organizationId,
        propertyId,
        scheduledDate,
        status: { $in: ['scheduled', 'completed'] }
    });
};

const SiteVisit = mongoose.model('SiteVisit', siteVisitSchema);

// Alias for generic usage — same model, just a clearer name
const Appointment = SiteVisit;

module.exports = SiteVisit;
module.exports.Appointment = Appointment;
