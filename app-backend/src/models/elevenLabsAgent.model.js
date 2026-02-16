/**
 * ElevenLabs Agent Model
 * Maps ElevenLabs agent_id → organization for multi-tenant tracking
 * 
 * All agents are created under ONE shared ElevenLabs account (platform owner's API key).
 * This model tracks which org owns which agent, plus usage stats for billing.
 */

const mongoose = require('mongoose');

const elevenLabsAgentSchema = new mongoose.Schema({
    // ElevenLabs agent ID (from their API)
    agentId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // Organization that owns this agent
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true,
        index: true
    },
    // User who created it
    createdBy: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    // Agent name (cached from ElevenLabs for quick lookups)
    name: {
        type: String,
        default: ''
    },
    // Is this the org's default/active agent?
    isDefault: {
        type: Boolean,
        default: false
    },
    // Usage tracking for billing
    usage: {
        totalCalls: {
            type: Number,
            default: 0
        },
        totalMinutes: {
            type: Number,
            default: 0
        },
        // Monthly breakdown: { '2026-02': { calls: 10, minutes: 45.5 }, ... }
        monthly: {
            type: Map,
            of: new mongoose.Schema({
                calls: { type: Number, default: 0 },
                minutes: { type: Number, default: 0 }
            }, { _id: false }),
            default: new Map()
        },
        lastCallAt: {
            type: Date,
            default: null
        }
    }
}, {
    timestamps: true
});

// Compound index for fast org-scoped queries
elevenLabsAgentSchema.index({ organizationId: 1, createdAt: -1 });

/**
 * Find all agents belonging to an organization
 */
elevenLabsAgentSchema.statics.findByOrg = function(orgId) {
    return this.find({ organizationId: orgId }).sort({ createdAt: -1 });
};

/**
 * Find agent by ElevenLabs ID and verify org ownership
 */
elevenLabsAgentSchema.statics.findByAgentIdAndOrg = function(agentId, orgId) {
    return this.findOne({ agentId, organizationId: orgId });
};

/**
 * Record a call for usage tracking
 */
elevenLabsAgentSchema.methods.recordCall = function(durationMinutes = 0) {
    const monthKey = new Date().toISOString().slice(0, 7); // '2026-02'
    
    this.usage.totalCalls += 1;
    this.usage.totalMinutes += durationMinutes;
    this.usage.lastCallAt = new Date();
    
    if (!this.usage.monthly.has(monthKey)) {
        this.usage.monthly.set(monthKey, { calls: 0, minutes: 0 });
    }
    const month = this.usage.monthly.get(monthKey);
    month.calls += 1;
    month.minutes += durationMinutes;
    this.usage.monthly.set(monthKey, month);
    
    return this.save();
};

/**
 * Get usage summary for an organization (all agents combined)
 */
elevenLabsAgentSchema.statics.getOrgUsageSummary = async function(orgId, monthKey) {
    const agents = await this.find({ organizationId: orgId });
    
    let totalCalls = 0;
    let totalMinutes = 0;
    const agentBreakdown = [];
    
    for (const agent of agents) {
        const agentData = {
            agentId: agent.agentId,
            name: agent.name,
            totalCalls: agent.usage.totalCalls,
            totalMinutes: agent.usage.totalMinutes
        };
        
        if (monthKey) {
            const monthData = agent.usage.monthly.get(monthKey);
            agentData.monthCalls = monthData?.calls || 0;
            agentData.monthMinutes = monthData?.minutes || 0;
            totalCalls += agentData.monthCalls;
            totalMinutes += agentData.monthMinutes;
        } else {
            totalCalls += agent.usage.totalCalls;
            totalMinutes += agent.usage.totalMinutes;
        }
        
        agentBreakdown.push(agentData);
    }
    
    return {
        organizationId: orgId,
        month: monthKey || 'all-time',
        totalCalls,
        totalMinutes: Math.round(totalMinutes * 100) / 100,
        agentCount: agents.length,
        agents: agentBreakdown
    };
};

const ElevenLabsAgent = mongoose.model('ElevenLabsAgent', elevenLabsAgentSchema);
module.exports = ElevenLabsAgent;
