/**
 * Assignment Rules Service
 * CRUD for configurable lead assignment rules.
 */

const AssignmentRule = require('../models/AssignmentRule');
const { NotFoundError, ValidationError } = require('../errors/AppError');

class AssignmentRulesService {
    /**
     * Create a new assignment rule
     */
    async createRule(data, creator) {
        if (!data.name) throw new ValidationError('Rule name is required');
        if (!data.conditions || data.conditions.length === 0) {
            throw new ValidationError('At least one condition is required');
        }
        if (!data.action || !data.action.type) {
            throw new ValidationError('Action type is required');
        }

        const rule = await AssignmentRule.create({
            organizationId: creator.organizationId,
            name: data.name,
            description: data.description || '',
            conditions: data.conditions,
            action: data.action,
            priority: data.priority || 10,
            isActive: data.isActive !== false,
            createdBy: creator.id
        });

        return rule.toObject();
    }

    /**
     * Get all rules for an org
     */
    async getRules(organizationId, { includeInactive = false } = {}) {
        const filter = { organizationId, isDeleted: false };
        if (!includeInactive) filter.isActive = true;

        return AssignmentRule.find(filter)
            .sort({ priority: 1 })
            .populate('action.agentIds', 'name email')
            .populate('createdBy', 'name email')
            .lean();
    }

    /**
     * Get a single rule
     */
    async getRuleById(ruleId, organizationId) {
        const rule = await AssignmentRule.findOne({ _id: ruleId, organizationId, isDeleted: false })
            .populate('action.agentIds', 'name email')
            .lean();
        if (!rule) throw new NotFoundError('Assignment rule not found');
        return rule;
    }

    /**
     * Update a rule
     */
    async updateRule(ruleId, organizationId, updates) {
        const rule = await AssignmentRule.findOne({ _id: ruleId, organizationId, isDeleted: false });
        if (!rule) throw new NotFoundError('Assignment rule not found');

        const allowedFields = ['name', 'description', 'conditions', 'action', 'priority', 'isActive'];
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                rule[key] = updates[key];
            }
        }

        await rule.save();
        return rule.toObject();
    }

    /**
     * Delete (soft) a rule
     */
    async deleteRule(ruleId, organizationId) {
        const rule = await AssignmentRule.findOne({ _id: ruleId, organizationId, isDeleted: false });
        if (!rule) throw new NotFoundError('Assignment rule not found');

        rule.isDeleted = true;
        await rule.save();
        return { deleted: true };
    }

    /**
     * Toggle a rule's active state
     */
    async toggleRule(ruleId, organizationId) {
        const rule = await AssignmentRule.findOne({ _id: ruleId, organizationId, isDeleted: false });
        if (!rule) throw new NotFoundError('Assignment rule not found');

        rule.isActive = !rule.isActive;
        await rule.save();
        return rule.toObject();
    }

    /**
     * Evaluate rules against a lead to find the best matching rule
     * Used by the auto-assignment engine.
     */
    async evaluateForLead(lead, organizationId) {
        const rules = await AssignmentRule.getActiveRules(organizationId);

        for (const rule of rules) {
            const matches = rule.conditions.every(condition => {
                return this._evaluateCondition(lead, condition);
            });

            if (matches) {
                return rule;
            }
        }

        return null; // No matching rule
    }

    _evaluateCondition(lead, condition) {
        const { field, operator, value } = condition;
        const leadValue = lead[field];

        switch (operator) {
            case 'equals':
                return String(leadValue).toLowerCase() === String(value).toLowerCase();
            case 'not_equals':
                return String(leadValue).toLowerCase() !== String(value).toLowerCase();
            case 'contains':
                return String(leadValue || '').toLowerCase().includes(String(value).toLowerCase());
            case 'greater_than':
                return Number(leadValue) > Number(value);
            case 'less_than':
                return Number(leadValue) < Number(value);
            case 'in':
                return Array.isArray(value) && value.map(v => String(v).toLowerCase()).includes(String(leadValue).toLowerCase());
            case 'not_in':
                return Array.isArray(value) && !value.map(v => String(v).toLowerCase()).includes(String(leadValue).toLowerCase());
            default:
                return false;
        }
    }
}

module.exports = new AssignmentRulesService();
