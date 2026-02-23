/**
 * CalendarEvent Model
 * Stores calendar events beyond just site visits — meetings, calls, follow-ups, etc.
 * Multi-tenant: scoped to organizationId.
 */

const mongoose = require('mongoose');

const calendarEventSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    /** User who created the event */
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    /** User the event is assigned to (could be a different agent) */
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true
    },
    /** Optional lead reference */
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
    },
    type: {
        type: String,
        enum: ['site_visit', 'appointment', 'call', 'meeting', 'follow_up', 'other'],
        default: 'meeting'
    },
    /** Start time (required) */
    startAt: {
        type: Date,
        required: true,
        index: true
    },
    /** End time (optional — defaults to startAt + 1 hour in service) */
    endAt: {
        type: Date
    },
    /** Full-day event */
    allDay: {
        type: Boolean,
        default: false
    },
    /** Location (address or property name) */
    location: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    /** Status of the event */
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'no_show'],
        default: 'scheduled'
    },
    /** Color label for UI display */
    color: {
        type: String,
        default: '#3b82f6' // blue
    },
    /** Optional reminder (minutes before event) */
    reminderMinutes: {
        type: Number,
        default: 30,
        min: 0
    },
    /** Arbitrary metadata */
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

// Query by org + date range
calendarEventSchema.index({ organizationId: 1, startAt: 1, endAt: 1 });
calendarEventSchema.index({ assignedTo: 1, startAt: 1 });
calendarEventSchema.index({ leadId: 1, startAt: 1 });

/**
 * Get events in a date range for an organization
 */
calendarEventSchema.statics.getEvents = async function (organizationId, startDate, endDate, filters = {}) {
    const query = {
        organizationId,
        isDeleted: false,
        startAt: { $gte: startDate },
        ...(endDate && { startAt: { $lte: endDate } })
    };
    // Combine startAt conditions if both exist
    if (endDate) {
        query.startAt = { $gte: startDate, $lte: endDate };
    }
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.leadId) query.leadId = filters.leadId;

    return this.find(query)
        .sort({ startAt: 1 })
        .populate('leadId', 'name email phone')
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name email')
        .lean();
};

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);
