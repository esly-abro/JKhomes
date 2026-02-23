/**
 * AssignmentRule Model
 * Configurable lead assignment rules per organization.
 * Rules are evaluated in priority order when auto-assigning leads.
 */

const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema({
    field: {
        type: String,
        required: true,
        enum: ['source', 'budget', 'location', 'category', 'status', 'tags', 'score']
    },
    operator: {
        type: String,
        required: true,
        enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in']
    },
    value: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    }
}, { _id: false });

const assignmentRuleSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
        default: ''
    },
    /** Conditions that must ALL match for this rule to apply (AND logic) */
    conditions: {
        type: [conditionSchema],
        validate: {
            validator: v => v.length > 0,
            message: 'At least one condition is required'
        }
    },
    /** Action: which agent(s) to assign to */
    action: {
        type: {
            type: String,
            enum: ['assign_agent', 'round_robin', 'least_busy'],
            required: true
        },
        /** Specific agent IDs (for assign_agent) */
        agentIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]
    },
    /** Priority: lower = higher priority */
    priority: {
        type: Number,
        default: 10,
        min: 1,
        max: 100
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    /** Soft delete */
    isDeleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

assignmentRuleSchema.index({ organizationId: 1, isActive: 1, priority: 1 });

/**
 * Get active rules for an org, sorted by priority
 */
assignmentRuleSchema.statics.getActiveRules = async function (organizationId) {
    return this.find({ organizationId, isActive: true, isDeleted: false })
        .sort({ priority: 1 })
        .populate('action.agentIds', 'name email')
        .lean();
};

module.exports = mongoose.model('AssignmentRule', assignmentRuleSchema);
