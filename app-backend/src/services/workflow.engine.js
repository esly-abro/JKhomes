/**
 * Workflow Engine (v2 — BullMQ)
 * 
 * Core orchestration for workflow execution.
 * 
 * This version replaces setInterval + MongoDB polling with BullMQ queues.
 * 
 * How it works:
 *   1. Trigger methods (triggerNewLead, etc.) enqueue events to the BullMQ trigger queue
 *   2. Trigger worker picks them up → finds matching automations → creates execution instances
 *   3. For each automation, the first nodes are enqueued to the execute queue
 *   4. Execute worker processes nodes → updates state → enqueues next nodes
 *   5. Delay nodes use BullMQ delayed jobs (not setTimeout, not scheduledFor polling)
 *   6. Waiting nodes (WhatsApp, AI call) pause and schedule timeout checks
 *   7. Failed nodes retry with exponential backoff (3 attempts) then go to DLQ
 *
 * Modular architecture preserved:
 *   - workflow.triggers.js    - Trigger matching and automation discovery
 *   - workflow.conditions.js  - Condition evaluation and templating
 *   - workflow.executors.js   - Node type execution handlers
 *   - workflow.resume.js      - Response/timeout resumption logic
 *   - workflow.recovery.js    - Error recovery and cleanup
 *   - workflow.queue.js       - BullMQ queue definitions and enqueue helpers
 *   - workflow.worker.js      - BullMQ worker processes
 *
 * Public API (unchanged from v1 — drop-in replacement):
 *   - start()                     → Starts BullMQ workers
 *   - stop()                      → Gracefully stops workers + queues
 *   - triggerNewLead(lead)        → Enqueues lead.created event
 *   - triggerLeadUpdated(lead)    → Enqueues lead.updated event
 *   - triggerSiteVisitScheduled() → Enqueues appointment.scheduled event
 *   - manualTrigger(autoId, leadId) → Enqueues manual trigger
 *   - resume* methods             → Enqueue next steps for waiting runs
 */

const Automation = require('../models/Automation');
const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const Lead = require('../models/Lead');

// Import modular components (unchanged)
const triggers = require('./workflow.triggers');
const conditions = require('./workflow.conditions');
const executors = require('./workflow.executors');
const resume = require('./workflow.resume');
const recovery = require('./workflow.recovery');

// BullMQ integration
const { enqueueTriggerEvent, enqueueNodeExecution, closeQueues } = require('./workflow.queue');
const { startWorkers, stopWorkers, getWorkerStatus } = require('./workflow.worker');
const { closeRedis, isRedisHealthy } = require('../config/redis');

const logger = require('../utils/logger');

class WorkflowEngine {
    constructor() {
        this.isRunning = false;
        this.useQueue = true; // Always true in v2
    }

    // =========================================================================
    // Lifecycle Management
    // =========================================================================

    /**
     * Start the workflow engine.
     * Initializes BullMQ workers that listen on Redis queues.
     * @param {number} _interval - Ignored (kept for API compat with v1)
     */
    start(_interval) {
        if (this.isRunning) {
            logger.warn('⚠️ Workflow engine already running');
            return;
        }

        logger.info('🚀 Starting workflow engine (BullMQ v2)...');

        try {
            startWorkers();
            this.isRunning = true;
            logger.info('✅ Workflow engine started (BullMQ mode)');
        } catch (err) {
            logger.error(`Failed to start workflow engine: ${err.message}`);
            throw err;
        }
    }

    /**
     * Gracefully stop the workflow engine.
     * Closes workers, queues, and Redis connections.
     */
    async stop() {
        if (!this.isRunning) return;

        logger.info('🛑 Stopping workflow engine...');
        this.isRunning = false;

        try {
            await stopWorkers();
            await closeQueues();
            await closeRedis();
            logger.info('✅ Workflow engine stopped');
        } catch (err) {
            logger.error(`Error stopping workflow engine: ${err.message}`);
        }
    }

    // =========================================================================
    // Trigger Methods — Enqueue to BullMQ trigger queue
    // =========================================================================

    /**
     * Trigger automations for a new lead.
     * Enqueues a lead.created event to the trigger queue.
     */
    async triggerNewLead(lead) {
        if (!lead || !lead._id) {
            logger.warn('triggerNewLead called with invalid lead');
            return { success: false, error: 'Invalid lead' };
        }

        try {
            const job = await enqueueTriggerEvent(
                'lead.created',
                lead._id,
                lead.organizationId,
                { leadName: lead.name }
            );
            return { success: true, jobId: job.id, event: 'lead.created' };
        } catch (err) {
            logger.error(`Failed to enqueue triggerNewLead: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Trigger automations for a lead update.
     */
    async triggerLeadUpdated(lead, changes) {
        if (!lead || !lead._id) return { success: false, error: 'Invalid lead' };

        try {
            const job = await enqueueTriggerEvent(
                'lead.updated',
                lead._id,
                lead.organizationId,
                { changes, leadName: lead.name }
            );
            return { success: true, jobId: job.id, event: 'lead.updated' };
        } catch (err) {
            logger.error(`Failed to enqueue triggerLeadUpdated: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Trigger automations for a site visit / appointment scheduled.
     */
    async triggerSiteVisitScheduled(lead, siteVisit) {
        if (!lead || !lead._id) return { success: false, error: 'Invalid lead' };

        try {
            const job = await enqueueTriggerEvent(
                'appointment.scheduled',
                lead._id,
                lead.organizationId,
                { siteVisit, leadName: lead.name }
            );
            return { success: true, jobId: job.id, event: 'appointment.scheduled' };
        } catch (err) {
            logger.error(`Failed to enqueue triggerSiteVisitScheduled: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    async triggerAppointmentScheduled(lead, appointment) {
        return this.triggerSiteVisitScheduled(lead, appointment);
    }

    async triggerStatusChange(lead, oldStatus, newStatus) {
        if (!lead || !lead._id) return { success: false, error: 'Invalid lead' };

        try {
            const job = await enqueueTriggerEvent(
                'lead.updated',
                lead._id,
                lead.organizationId,
                {
                    changes: { status: { old: oldStatus, new: newStatus } },
                    leadName: lead.name,
                }
            );
            return { success: true, jobId: job.id, event: 'lead.updated' };
        } catch (err) {
            logger.error(`Failed to enqueue triggerStatusChange: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // =========================================================================
    // Manual Trigger
    // =========================================================================

    async manualTrigger(automationId, leadId, context = {}) {
        try {
            const automation = await Automation.findById(automationId);
            if (!automation) throw new Error('Automation not found');

            const lead = await Lead.findById(leadId);
            if (!lead) throw new Error('Lead not found');

            // For manual triggers, we enqueue directly to ensure it runs
            const job = await enqueueTriggerEvent(
                automation.triggerType || 'manual',
                lead._id,
                lead.organizationId,
                {
                    context: { ...context, manualTrigger: true, triggeredAt: new Date() },
                    leadName: lead.name,
                    forceAutomationId: String(automation._id), // Force this specific automation
                }
            );

            return { success: true, jobId: job.id };
        } catch (err) {
            logger.error(`Manual trigger error: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // =========================================================================
    // Resume Methods — Delegate to resume module, route through BullMQ
    // =========================================================================

    /**
     * Create a BullMQ-compatible scheduleNode function for resume handlers.
     * The resume module expects: scheduleNode(run, automation, lead, node, edge, delay)
     */
    _makeScheduleNodeFn() {
        return async (run, automation, lead, node, edge, delay = 0) => {
            // Record in execution path
            run.executionPath.push({
                nodeId: node.id,
                nodeType: node.data?.type || node.type,
                nodeLabel: node.data?.label || node.id,
                label: node.data?.label || node.id,
                status: 'pending',
                scheduledFor: new Date(Date.now() + delay),
            });
            await run.save();

            // Record in AutomationJob for monitoring
            const jobRecord = new AutomationJob({
                automation: automation._id,
                automationRun: run._id,
                lead: lead._id,
                organizationId: run.organizationId,
                nodeId: node.id,
                nodeType: node.data?.type || node.type,
                nodeData: node.data,
                edgeId: edge?.id,
                status: 'pending',
                scheduledFor: new Date(Date.now() + delay),
                attempts: 0,
                maxAttempts: 3,
            });
            await jobRecord.save();

            // Enqueue in BullMQ
            await enqueueNodeExecution({
                runId: run._id,
                automationId: automation._id,
                leadId: lead._id,
                nodeId: node.id,
                nodeData: node.data,
                edgeId: edge?.id,
                organizationId: run.organizationId,
                delay,
            });
        };
    }

    async resumeFromResponse(run, parsedMessage) {
        return resume.resumeFromResponse(run, parsedMessage, this._makeScheduleNodeFn());
    }

    async resumeFromTimeout(run) {
        return resume.resumeFromTimeout(run, this._makeScheduleNodeFn());
    }

    async resumeFromCallResult(run, callResult) {
        return resume.resumeFromCallResult(run, callResult, this._makeScheduleNodeFn());
    }

    async resumeFromCallTimeout(run) {
        return resume.resumeFromCallTimeout(run, this._makeScheduleNodeFn());
    }

    async resumeFromTaskCompletion(task) {
        return resume.resumeFromTaskCompletion(task, this._makeScheduleNodeFn());
    }

    // =========================================================================
    // Recovery & Cleanup — Delegate to recovery module
    // =========================================================================

    async cleanupOldRuns(daysToKeep, failedDaysToKeep) {
        return recovery.cleanupOldRuns(daysToKeep, failedDaysToKeep);
    }

    async getCleanupStats(daysToKeep, failedDaysToKeep) {
        return recovery.getCleanupStats(daysToKeep, failedDaysToKeep);
    }

    async recoverStuckAutomations(stuckThresholdHours) {
        return recovery.recoverStuckAutomations(
            stuckThresholdHours,
            this.resumeFromTimeout.bind(this),
            this.resumeFromCallTimeout.bind(this)
        );
    }

    async getHealthStats() {
        const dbStats = await recovery.getHealthStats();
        const redisHealthy = await isRedisHealthy();
        const workerStatus = getWorkerStatus();

        return {
            ...dbStats,
            redis: {
                connected: redisHealthy,
            },
            workers: workerStatus,
            engine: {
                version: 2,
                mode: 'bullmq',
                running: this.isRunning,
            },
        };
    }
}

// Export as singleton
const workflowEngine = new WorkflowEngine();
module.exports = workflowEngine;

// Also export class for testing
module.exports.WorkflowEngine = WorkflowEngine;

// Re-export modules for direct access if needed
module.exports.triggers = triggers;
module.exports.conditions = conditions;
module.exports.executors = executors;
module.exports.resume = resume;
module.exports.recovery = recovery;
