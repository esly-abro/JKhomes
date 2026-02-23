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
const { startWorkers, stopWorkers, getWorkerStatus, processTriggerJob, processExecuteJob } = require('./workflow.worker');
const { closeRedis, isRedisHealthy } = require('../config/redis');

const logger = require('../utils/logger');

class WorkflowEngine {
    constructor() {
        this.isRunning = false;
        this.useQueue = true; // Always true in v2
        this.bullmqAvailable = true; // Will be set to false if Redis version is too old
    }

    // =========================================================================
    // Lifecycle Management
    // =========================================================================

    /**
     * Start the workflow engine.
     * Initializes BullMQ workers that listen on Redis queues.
     * Falls back to direct/inline execution if Redis version < 5.0.
     * @param {number} _interval - Ignored (kept for API compat with v1)
     */
    async start(_interval) {
        if (this.isRunning) {
            logger.warn('⚠️ Workflow engine already running');
            return;
        }

        logger.info('🚀 Starting workflow engine (BullMQ v2)...');

        // Check Redis version — BullMQ requires >= 5.0.0
        let redisVersionOk = true;
        try {
            const IORedis = require('ioredis');
            const { getRedisConfig } = require('../config/redis');
            const testConn = new IORedis({ ...getRedisConfig(), lazyConnect: true });
            testConn.on('error', () => {});
            await testConn.connect();
            const info = await testConn.info('server');
            const versionMatch = info.match(/redis_version:(\S+)/);
            if (versionMatch) {
                const ver = versionMatch[1];
                const major = parseInt(ver.split('.')[0], 10);
                if (major < 5) {
                    logger.warn(`⚠️ Redis version ${ver} detected — BullMQ requires >= 5.0.0`);
                    redisVersionOk = false;
                } else {
                    logger.info(`✅ Redis version ${ver} — BullMQ compatible`);
                }
            }
            await testConn.quit().catch(() => {});
        } catch (err) {
            logger.warn(`⚠️ Redis version check failed: ${err.message}`);
            redisVersionOk = false;
        }

        if (redisVersionOk) {
            try {
                startWorkers();
                this.bullmqAvailable = true;
                logger.info('✅ Workflow engine started (BullMQ mode)');
            } catch (err) {
                logger.warn(`⚠️ BullMQ workers failed to start: ${err.message}`);
                this.bullmqAvailable = false;
            }
        } else {
            this.bullmqAvailable = false;
            logger.info('🔄 Workflow engine running in DIRECT execution mode (no BullMQ)');
            logger.info('   Automations will execute inline when triggered.');
            logger.info('   To enable BullMQ mode, upgrade Redis to >= 5.0.0');
        }

        this.isRunning = true;
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

        // Try BullMQ first, fallback to direct execution
        if (this.bullmqAvailable) {
            try {
                const job = await enqueueTriggerEvent(
                    'lead.created',
                    lead._id,
                    lead.organizationId,
                    { leadName: lead.name }
                );
                return { success: true, jobId: job.id, event: 'lead.created' };
            } catch (err) {
                logger.warn(`BullMQ enqueue failed, falling back to direct execution: ${err.message}`);
                this.bullmqAvailable = false;
            }
        }

        // Direct/inline execution fallback
        return this._directTrigger('lead.created', lead, { leadName: lead.name });
    }

    /**
     * Trigger automations for a lead update.
     */
    async triggerLeadUpdated(lead, changes) {
        if (!lead || !lead._id) return { success: false, error: 'Invalid lead' };

        if (this.bullmqAvailable) {
            try {
                const job = await enqueueTriggerEvent(
                    'lead.updated',
                    lead._id,
                    lead.organizationId,
                    { changes, leadName: lead.name }
                );
                return { success: true, jobId: job.id, event: 'lead.updated' };
            } catch (err) {
                logger.warn(`BullMQ enqueue failed, falling back to direct execution: ${err.message}`);
                this.bullmqAvailable = false;
            }
        }

        return this._directTrigger('lead.updated', lead, { changes, leadName: lead.name });
    }

    /**
     * Trigger automations for a site visit / appointment scheduled.
     */
    async triggerSiteVisitScheduled(lead, siteVisit) {
        if (!lead || !lead._id) return { success: false, error: 'Invalid lead' };

        if (this.bullmqAvailable) {
            try {
                const job = await enqueueTriggerEvent(
                    'appointment.scheduled',
                    lead._id,
                    lead.organizationId,
                    { siteVisit, leadName: lead.name }
                );
                return { success: true, jobId: job.id, event: 'appointment.scheduled' };
            } catch (err) {
                logger.warn(`BullMQ enqueue failed, falling back to direct execution: ${err.message}`);
                this.bullmqAvailable = false;
            }
        }

        return this._directTrigger('appointment.scheduled', lead, { siteVisit, leadName: lead.name });
    }

    async triggerAppointmentScheduled(lead, appointment) {
        return this.triggerSiteVisitScheduled(lead, appointment);
    }

    async triggerStatusChange(lead, oldStatus, newStatus) {
        if (!lead || !lead._id) return { success: false, error: 'Invalid lead' };

        const extra = {
            changes: { status: { old: oldStatus, new: newStatus } },
            leadName: lead.name,
        };

        if (this.bullmqAvailable) {
            try {
                const job = await enqueueTriggerEvent(
                    'lead.updated',
                    lead._id,
                    lead.organizationId,
                    extra
                );
                return { success: true, jobId: job.id, event: 'lead.updated' };
            } catch (err) {
                logger.warn(`BullMQ enqueue failed, falling back to direct execution: ${err.message}`);
                this.bullmqAvailable = false;
            }
        }

        return this._directTrigger('lead.updated', lead, extra);
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

            const extra = {
                context: { ...context, manualTrigger: true, triggeredAt: new Date() },
                leadName: lead.name,
                forceAutomationId: String(automation._id),
            };

            if (this.bullmqAvailable) {
                try {
                    const job = await enqueueTriggerEvent(
                        automation.triggerType || 'manual',
                        lead._id,
                        lead.organizationId,
                        extra
                    );
                    return { success: true, jobId: job.id };
                } catch (err) {
                    logger.warn(`BullMQ enqueue failed, falling back to direct execution: ${err.message}`);
                    this.bullmqAvailable = false;
                }
            }

            return this._directTrigger(automation.triggerType || 'manual', lead, extra);
        } catch (err) {
            logger.error(`Manual trigger error: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    // =========================================================================
    // Direct Execution Fallback — When BullMQ is unavailable (Redis < 5.0)
    // =========================================================================

    /**
     * Execute a trigger event directly (inline, no BullMQ).
     * Calls the same processTriggerJob logic that BullMQ workers would use.
     */
    async _directTrigger(event, lead, extra = {}) {
        try {
            logger.info(`🔄 Direct trigger: ${event} for lead ${lead.name} (${lead._id})`);

            // Build a mock job.data object matching what processTriggerJob expects
            const jobData = {
                event,
                leadId: String(lead._id),
                organizationId: String(lead.organizationId),
                ...extra,
                enqueuedAt: new Date().toISOString(),
            };

            // Call processTriggerJob directly with a mock job object
            const result = await processTriggerJob({ data: jobData, id: `direct-${Date.now()}` });
            
            logger.info(`✅ Direct trigger completed: ${event}`, result);

            // If automations matched, execute their first nodes inline too
            if (result && result.results) {
                for (const r of result.results) {
                    if (r.runId && r.nodesEnqueued > 0) {
                        // The processTriggerJob already called enqueueNodeExecution,
                        // but since BullMQ is unavailable, those calls would have failed.
                        // We need to execute the first nodes directly.
                        await this._executeRunNodesDirectly(r.runId, r.automationId);
                    }
                }
            }

            return { success: true, mode: 'direct', event, result };
        } catch (err) {
            logger.error(`❌ Direct trigger failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }

    /**
     * Execute pending nodes for a run directly (inline, no BullMQ).
     * Used when BullMQ cannot enqueue jobs.
     */
    async _executeRunNodesDirectly(runId, automationId) {
        try {
            const run = await AutomationRun.findById(runId);
            const automation = await Automation.findById(automationId || run?.automation);
            if (!run || !automation) return;

            const lead = await Lead.findById(run.lead);
            if (!lead) return;

            // Find pending nodes from the run's execution path
            const pendingNodes = (run.executionPath || []).filter(p => p.status === 'pending');

            for (const pending of pendingNodes) {
                const nodeObj = automation.nodes.find(n => n.id === pending.nodeId);
                if (!nodeObj) continue;

                const nodeData = nodeObj.data || {};

                logger.info(`⚙️ Direct executing node: "${pending.nodeLabel}" (${nodeData.type}) [run ${runId}]`);

                // Build mock job for processExecuteJob
                const mockJob = {
                    data: {
                        runId: String(run._id),
                        automationId: String(automation._id),
                        leadId: String(lead._id),
                        nodeId: pending.nodeId,
                        nodeData,
                        organizationId: String(run.organizationId),
                    },
                    id: `direct-exec-${Date.now()}`,
                    attemptsMade: 0,
                    opts: { attempts: 3 },
                };

                try {
                    const result = await processExecuteJob(mockJob);
                    logger.info(`✅ Direct node execution result:`, result);

                    // If the node scheduled next nodes (via scheduleNextNodes which calls enqueueNodeExecution),
                    // those would also fail with BullMQ unavailable. So we recursively execute them.
                    if (result && (result.success || result.condition || result.delayed || result.skipped)) {
                        // Reload run to get updated execution path
                        await this._executeRunNodesDirectly(runId, automationId);
                        return; // Recursive call handles remaining nodes
                    }
                } catch (execErr) {
                    logger.error(`❌ Direct node execution failed for "${pending.nodeLabel}": ${execErr.message}`);
                    // Don't stop the workflow — mark node as failed and continue
                }
            }
        } catch (err) {
            logger.error(`❌ _executeRunNodesDirectly error: ${err.message}`);
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
        const result = await resume.resumeFromResponse(run, parsedMessage, this._makeScheduleNodeFn());
        // In direct mode, after scheduling next nodes we need to execute them inline
        if (!this.bullmqAvailable && result?.success && result?.nextNodesScheduled > 0) {
            logger.info(`🔄 Direct mode: executing resumed nodes for run ${run._id}`);
            await this._executeRunNodesDirectly(String(run._id), String(run.automation?._id || run.automation));
        }
        return result;
    }

    async resumeFromTimeout(run) {
        const result = await resume.resumeFromTimeout(run, this._makeScheduleNodeFn());
        if (!this.bullmqAvailable && result?.success && result?.nextNodesScheduled > 0) {
            logger.info(`🔄 Direct mode: executing timed-out nodes for run ${run._id}`);
            await this._executeRunNodesDirectly(String(run._id), String(run.automation?._id || run.automation));
        }
        return result;
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
