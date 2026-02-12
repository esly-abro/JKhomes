/**
 * Lead Schema
 * MongoDB model for storing lead data and status updates
 */

const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
    // Can be Zoho ID or custom ID
    zohoId: {
        type: String,
        sparse: true,
        index: true
    },
    
    // Lead details
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true
    },
    company: {
        type: String,
        trim: true
    },
    
    // Lead source - flexible to accept various sources
    source: {
        type: String,
        default: 'Website'
    },
    
    // Lead status - flexible to accept various statuses
    status: {
        type: String,
        default: 'New'
    },
    
    // Lead score (0-100)
    score: {
        type: Number,
        min: 0,
        max: 100,
        default: 50
    },
    
    // Property interested in
    propertyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Property'
    },
    
    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedToName: {
        type: String
    },
    
    // Additional fields
    notes: {
        type: String
    },
    tags: [{
        type: String
    }],
    
    // Address
    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
    },
    
    // Custom fields
    customFields: {
        type: mongoose.Schema.Types.Mixed
    },
    
    // Category (generic — replaces hardcoded propertyType)
    // The label for this field is configurable per tenant via TenantConfig.categoryFieldLabel
    category: {
        type: String
    },
    // Backward compat: old data may still have propertyType stored directly.
    // The virtual below maps propertyType ↔ category seamlessly.
    
    // Monetary value (budget / deal size / contract value)
    budget: {
        type: Number
    },
    location: {
        type: String
    },
    preferredLocation: {
        type: String
    },
    
    // Communication tracking
    callStatus: {
        type: String,
        enum: ['not_called', 'called', 'answered', 'not_answered', 'busy', 'voicemail', 'wrong_number', 'callback_requested'],
        default: 'not_called'
    },
    callAttempts: {
        type: Number,
        default: 0
    },
    lastCallAt: {
        type: Date
    },
    
    whatsappStatus: {
        type: String,
        enum: ['not_sent', 'sent', 'delivered', 'read', 'replied', 'not_responding', 'opted_out'],
        default: 'not_sent'
    },
    lastWhatsappAt: {
        type: Date
    },
    
    // Engagement tracking
    lastContactAt: {
        type: Date
    },
    firstResponseAt: {
        type: Date
    },
    
    // Appointment (formerly "Site visit")
    appointmentScheduled: {
        type: Boolean,
        default: false
    },
    appointmentDate: {
        type: Date
    },
    
    // Tracking
    lastContactedAt: {
        type: Date
    },
    nextFollowUpAt: {
        type: Date
    },
    
    // Sync status with Zoho
    syncedWithZoho: {
        type: Boolean,
        default: false
    },
    lastSyncedAt: {
        type: Date
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ================================
// VIRTUAL: propertyType ↔ category
// Old code that reads lead.propertyType still works.
// Old code that writes lead.propertyType → writes to category.
// ================================
leadSchema.virtual('propertyType')
    .get(function () {
        return this.category;
    })
    .set(function (value) {
        this.category = value;
    });

// ================================
// VIRTUAL: siteVisitScheduled ↔ appointmentScheduled
// VIRTUAL: siteVisitDate ↔ appointmentDate
// Old code that reads lead.siteVisitScheduled still works.
// ================================
leadSchema.virtual('siteVisitScheduled')
    .get(function () {
        return this.appointmentScheduled;
    })
    .set(function (value) {
        this.appointmentScheduled = value;
    });

leadSchema.virtual('siteVisitDate')
    .get(function () {
        return this.appointmentDate;
    })
    .set(function (value) {
        this.appointmentDate = value;
    });

// When receiving data from API (e.g. create/update), migrate old field names
leadSchema.pre('save', function () {
    // If someone set propertyType directly via $set (not through virtual), copy it over
    if (this.isModified('propertyType') && !this.isModified('category')) {
        this.category = this.propertyType;
    }
});

// Indexes
leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ source: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ category: 1 });

/**
 * Get leads with pagination and filters
 */
leadSchema.statics.getLeads = async function(filters = {}, page = 1, limit = 20) {
    const query = {};
    
    if (filters.status) query.status = filters.status;
    if (filters.source) query.source = filters.source;
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;
    
    const skip = (page - 1) * limit;
    
    const [leads, total] = await Promise.all([
        this.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('assignedTo', 'name email'),
        this.countDocuments(query)
    ]);
    
    return {
        data: leads,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

/**
 * Update lead status
 */
leadSchema.statics.updateStatus = async function(leadId, status, userId) {
    const lead = await this.findByIdAndUpdate(
        leadId,
        { 
            status,
            updatedAt: new Date(),
            lastContactedAt: new Date()
        },
        { new: true }
    );
    return lead;
};

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;
