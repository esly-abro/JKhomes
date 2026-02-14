/**
 * ExecutionLog Model
 * 
 * First-class structured logging for every workflow execution step.
 * Each node execution (pending → running → success/failed) creates a log entry.
 * 
 * This enables:
 *   - Per-step audit trail with exact timestamps
 *   - Queryable execution history (by run, lead, automation, org)
 *   - Dashboard analytics (success rate, avg duration, failure patterns)
 *   - Debugging individual workflow executions
 *   - Compliance / regulatory audit trail
 * 
 * Schema: { nodeId, status, timestamp, message } + metadata
 */

const mongoose = require('mongoose');

const executionLogSchema = new mongoose.Schema({
    // ── References ──────────────────────────────────
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        index: true,
    },
    automationRun: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AutomationRun',
        required: true,
        index: true,
    },
    automation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Automation',
        required: true,
    },
    lead: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Lead',
    },

    // ── Node Info ───────────────────────────────────
    nodeId: {
        type: String,
        required: true,
    },
    nodeType: String,
    nodeLabel: String,

    // ── Status ──────────────────────────────────────
    status: {
        type: String,
        enum: ['pending', 'running', 'success', 'failed', 'skipped', 'timeout', 'waiting', 'retrying', 'dead-letter'],
        required: true,
    },

    // ── Message / Error ─────────────────────────────
    message: String,
    error: String,

    // ── Execution Details ───────────────────────────
    duration: Number,           // execution time in ms
    attempt: Number,            // which attempt (1, 2, 3...)
    workerId: String,           // which worker instance handled this

    // ── Metadata (node-specific result data) ────────
    metadata: mongoose.Schema.Types.Mixed,

    // ── Timestamp ───────────────────────────────────
    timestamp: {
        type: Date,
        default: Date.now,
        index: true,
    },
}, {
    timestamps: false,  // We use our own `timestamp` field
    versionKey: false,
});

// ── Compound Indexes ────────────────────────────────
executionLogSchema.index({ automationRun: 1, timestamp: 1 });
executionLogSchema.index({ organizationId: 1, timestamp: -1 });
executionLogSchema.index({ automation: 1, status: 1, timestamp: -1 });
executionLogSchema.index({ lead: 1, timestamp: -1 });

// ── TTL Index — auto-delete logs older than 90 days ─
executionLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ExecutionLog', executionLogSchema);
