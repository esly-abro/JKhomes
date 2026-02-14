/**
 * Workflow Worker
 * 
 * BullMQ workers that process workflow execution jobs.
 * This replaces the old setInterval + MongoDB polling approach.
 *
 * Workers:
 *   1. Trigger Worker   — Receives events, finds matching workflows, creates execution instances
 *   2. Execute Worker   — Processes individual node execution steps
 *   3. Timeout Worker   — Handles waiting run timeouts
 *
 * Design principles:
 *   - Each lead gets its own execution instance (1000 leads → 1000 executions)
 *   - Delay nodes use BullMQ delayed jobs (survives restart, no setTimeout)
 *   - All execution state stored in MongoDB (AutomationRun)
 *   - Workers are stateless — can scale horizontally
 *   - Failed jobs retry with exponential backoff (3 attempts)
 *   - Dead letter queue for unrecoverable failures
 */

const { Worker } = require('bullmq');
const { getRedisConnection, getRedisSubscriber } = require('../config/redis');
const { QUEUE_NAMES, enqueueNodeExecution, enqueueTimeoutCheck } = require('./workflow.queue');
const logger = require('../utils/logger');

// MongoDB models
const Automation = require('../models/Automation');
const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const Lead = require('../models/Lead');

// Existing modular engine components (reuse all of them)
const triggers = require('./workflow.triggers');
const conditions = require('./workflow.conditions');
const executors = require('./workflow.executors');
const resume = require('./workflow.resume');
const recovery = require('./workflow.recovery');

// ─── Concurrency Config ─────────────────────────────────────────

const TRIGGER_CONCURRENCY = parseInt(process.env.WORKFLOW_TRIGGER_CONCURRENCY, 10) || 5;
const EXECUTE_CONCURRENCY = parseInt(process.env.WORKFLOW_EXECUTE_CONCURRENCY, 10) || 10;
const TIMEOUT_CONCURRENCY = parseInt(process.env.WORKFLOW_TIMEOUT_CONCURRENCY, 10) || 3;

// ─── Worker Instances ───────────────────────────────────────────

let _triggerWorker = null;
let _executeWorker = null;
let _timeoutWorker = null;

// ─── Helper: Schedule Next Nodes ────────────────────────────────

/**
 * Given a completed node, find its downstream nodes and enqueue them.
 * This is the BullMQ replacement for the old engine's scheduleNextNodes.
 */
async function scheduleNextNodes(run, automation, lead, currentNodeId, handle = null, extraDelay = 0) {
    let nextNodes = automation.getNextNodes(currentNodeId, handle);

    // Fallback: if handle-specific lookup returned nothing, try without handle
    if (nextNodes.length === 0 && handle) {
        nextNodes = automation.getNextNodes(currentNodeId);
    }

    if (nextNodes.length === 0) {
        // Check if there are any pending BullMQ jobs for this run
        // If not, the run is complete
        const pendingJobs = await AutomationJob.countDocuments({
            automationRun: run._id,
            status: 'pending',
        });

        if (pendingJobs === 0) {
            run.status = 'completed';
            run.completedAt = new Date();
            await run.save();

            automation.successCount = (automation.successCount || 0) + 1;
            await automation.save();

            logger.info(`✅ Workflow run completed: ${automation.name} (run ${run._id})`);
        }
        return 0;
    }

    for (const { node, edge } of nextNodes) {
        let delay = extraDelay;

        // If next node IS a delay/wait, calculate its delay and pass it
        if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = conditions.calculateDelay(node.data.config);
        }

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

        // Also record in AutomationJob for backwards compatibility / monitoring
        const jobRecord = new AutomationJob({
            automation: automation._id,
            automationRun: run._id,
            lead: lead._id,
            organizationId: lead.organizationId,
            nodeId: node.id,
            nodeType: node.data?.type || node.type,
            nodeData: node.data,
            edgeId: edge?.id,
            status: 'pending',
            scheduledFor: new Date(Date.now() + delay),
            attempts: 0,
            maxAttempts: node.data?.config?.maxRetries || 3,
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
            organizationId: lead.organizationId,
            delay,
        });
    }

    return nextNodes.length;
}

// ─── Helper: Update Execution Path Status ───────────────────────

function updateExecutionPathStatus(run, nodeId, status, result = null) {
    const pathIndex = run.executionPath.findIndex(
        (p) => p.nodeId === nodeId && (p.status === 'pending' || p.status === 'running')
    );
    if (pathIndex >= 0) {
        run.executionPath[pathIndex].status = status;
        if (status === 'completed' || status === 'failed') {
            run.executionPath[pathIndex].completedAt = new Date();
        }
        if (result) {
            run.executionPath[pathIndex].result = result;
        }
    }
}

// ═════════════════════════════════════════════════════════════════
// TRIGGER WORKER
// ═════════════════════════════════════════════════════════════════

/**
 * Process a trigger event:
 *   1. Load the lead
 *   2. Find all active automations matching the trigger + org
 *   3. For each, create an AutomationRun and enqueue the first node(s)
 */
async function processTriggerJob(job) {
    const { event, leadId, organizationId, changes, context, forceAutomationId } = job.data;

    logger.info(`🔔 Processing trigger: ${event} for lead ${leadId}`);

    const lead = await Lead.findById(leadId);
    if (!lead) {
        logger.warn(`Lead ${leadId} not found, skipping trigger`);
        return { skipped: true, reason: 'lead_not_found' };
    }

    // Map event names to triggerType enum values
    const eventToTriggerType = {
        'lead.created': 'newLead',
        'lead.updated': 'leadUpdated',
        'appointment.scheduled': 'siteVisitScheduled',
        'siteVisit.scheduled': 'siteVisitScheduled',
    };

    const triggerType = eventToTriggerType[event] || event;

    // Find all active automations matching this trigger and organization
    let automations;
    if (forceAutomationId) {
        // Manual trigger — only run the specified automation
        const forced = await Automation.findById(forceAutomationId);
        automations = forced ? [forced] : [];
    } else {
        const query = {
            isActive: true,
            triggerType,
        };
        if (organizationId) {
            query.organizationId = organizationId;
        }
        automations = await Automation.find(query);
    }

    if (automations.length === 0) {
        logger.info(`No active automations for trigger ${triggerType} (org: ${organizationId})`);
        return { matched: 0 };
    }

    logger.info(`Found ${automations.length} automation(s) for trigger ${triggerType}`);

    const results = [];

    for (const automation of automations) {
        try {
            // ── Trigger condition filtering ─────────────
            if (automation.triggerConditions) {
                const passes = triggers.matchesTriggerConditions
                    ? triggers.matchesTriggerConditions(lead, automation.triggerConditions)
                    : true;
                if (!passes) {
                    logger.info(`Lead ${lead.name} does not match trigger conditions for ${automation.name}`);
                    results.push({ automationId: automation._id, skipped: true, reason: 'conditions_not_met' });
                    continue;
                }
            }

            // ── Duplicate prevention ────────────────────
            if (automation.preventDuplicates || automation.runOncePerLead) {
                const existingRun = await AutomationRun.findOne({
                    automation: automation._id,
                    lead: lead._id,
                    status: { $in: ['running', 'waiting_for_response', 'pending'] },
                });
                if (existingRun) {
                    logger.info(`Skipping duplicate run for lead ${lead.name} on ${automation.name}`);
                    results.push({ automationId: automation._id, skipped: true, reason: 'duplicate' });
                    continue;
                }
            }

            // ── Cooldown check ──────────────────────────
            if (automation.cooldownPeriod) {
                const cooldownMs = automation.cooldownPeriod * 60 * 1000;
                const recentRun = await AutomationRun.findOne({
                    automation: automation._id,
                    lead: lead._id,
                    startedAt: { $gt: new Date(Date.now() - cooldownMs) },
                });
                if (recentRun) {
                    logger.info(`Lead ${lead.name} in cooldown for ${automation.name}`);
                    results.push({ automationId: automation._id, skipped: true, reason: 'cooldown' });
                    continue;
                }
            }

            // ── Create execution instance ───────────────
            const run = new AutomationRun({
                organizationId: lead.organizationId || organizationId,
                automation: automation._id,
                lead: lead._id,
                status: 'running',
                startedAt: new Date(),
                triggeredBy: context?.manualTrigger ? 'manual' : 'system',
                context: {
                    lead: {
                        _id: lead._id,
                        name: lead.name,
                        phone: lead.phone,
                        email: lead.email,
                        status: lead.status,
                        source: lead.source,
                        budget: lead.budget,
                        location: lead.location,
                        assignedTo: lead.assignedTo,
                    },
                    previousResults: {},
                    triggerEvent: event,
                    ...(changes ? { changes } : {}),
                },
                executionPath: [],
            });
            await run.save();

            // Update automation stats
            automation.runsCount = (automation.runsCount || 0) + 1;
            automation.lastRunAt = new Date();
            await automation.save();

            // ── Find start nodes & enqueue first steps ──
            const startNodes =
                automation.findNodesByType('trigger').length > 0
                    ? automation.findNodesByType('trigger')
                    : automation.findNodesByType('start');

            if (startNodes.length === 0) {
                logger.error(`No trigger/start node in automation ${automation.name}`);
                run.status = 'failed';
                run.error = 'No trigger or start node found';
                await run.save();
                results.push({ automationId: automation._id, error: 'no_start_node' });
                continue;
            }

            let nodesEnqueued = 0;
            for (const startNode of startNodes) {
                const nextNodes = automation.getNextNodes(startNode.id);
                for (const { node, edge } of nextNodes) {
                    let delay = 0;
                    if (node.data?.type === 'delay' || node.data?.type === 'wait') {
                        delay = conditions.calculateDelay(node.data.config);
                    }

                    // Record in execution path
                    run.executionPath.push({
                        nodeId: node.id,
                        nodeType: node.data?.type || node.type,
                        nodeLabel: node.data?.label || node.id,
                        label: node.data?.label || node.id,
                        status: 'pending',
                        scheduledFor: new Date(Date.now() + delay),
                    });

                    // Record in AutomationJob for monitoring
                    const jobRecord = new AutomationJob({
                        automation: automation._id,
                        automationRun: run._id,
                        lead: lead._id,
                        organizationId: lead.organizationId,
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
                        organizationId: lead.organizationId,
                        delay,
                    });

                    nodesEnqueued++;
                }
            }

            await run.save();

            logger.info(`▶️ Started automation "${automation.name}" for lead "${lead.name}" — ${nodesEnqueued} node(s) enqueued (run ${run._id})`);
            results.push({ automationId: automation._id, runId: run._id, nodesEnqueued });

        } catch (err) {
            logger.error(`Error starting automation ${automation.name}: ${err.message}`);
            results.push({ automationId: automation._id, error: err.message });
        }
    }

    return { matched: automations.length, results };
}

// ═════════════════════════════════════════════════════════════════
// EXECUTE WORKER
// ═════════════════════════════════════════════════════════════════

/**
 * Process a single node execution step:
 *   1. Load run, automation, lead
 *   2. Verify run is still active
 *   3. Execute the node via existing executors module
 *   4. Handle result (success → next nodes, waiting → pause, condition → branch, delay → delayed job)
 *   5. On failure → retry or dead-letter
 */
async function processExecuteJob(job) {
    const { runId, automationId, leadId, nodeId, nodeData, edgeId } = job.data;
    const nodeLabel = nodeData?.label || nodeData?.type || nodeId;

    logger.info(`⚙️  Executing node: "${nodeLabel}" (${nodeData?.type}) [run ${runId}]`);

    // Load entities
    const [run, automation, lead] = await Promise.all([
        AutomationRun.findById(runId),
        Automation.findById(automationId),
        Lead.findById(leadId),
    ]);

    // ── Guard checks ────────────────────────────
    if (!run) {
        logger.warn(`Run ${runId} not found, discarding job`);
        return { discarded: true, reason: 'run_not_found' };
    }
    if (run.status === 'cancelled' || run.status === 'completed') {
        logger.info(`Run ${runId} already ${run.status}, skipping node "${nodeLabel}"`);
        return { discarded: true, reason: `run_${run.status}` };
    }
    if (!automation) {
        logger.error(`Automation ${automationId} not found`);
        run.status = 'failed';
        run.error = 'Automation not found';
        await run.save();
        return { failed: true, reason: 'automation_not_found' };
    }
    if (!lead) {
        logger.error(`Lead ${leadId} not found`);
        run.status = 'failed';
        run.error = 'Lead not found';
        await run.save();
        return { failed: true, reason: 'lead_not_found' };
    }

    // Update execution path → running
    updateExecutionPathStatus(run, nodeId, 'running');
    run.currentNodeId = nodeId;
    await run.save();

    // Update corresponding AutomationJob record
    await AutomationJob.findOneAndUpdate(
        { automationRun: run._id, nodeId, status: 'pending' },
        { status: 'processing', lastAttemptAt: new Date(), attempts: job.attemptsMade + 1 }
    );

    // ── Build a minimal job-like object for the executors ────────
    // The existing executors expect a job object with these fields
    const pseudoJob = {
        _id: job.id,
        automation: automation._id,
        automationRun: run._id,
        lead: lead._id,
        nodeId,
        nodeType: nodeData?.type || 'unknown',
        nodeData,
        edgeId,
        attempts: job.attemptsMade + 1,
        maxAttempts: 3,
    };

    // ── Execute the node ────────────────────────
    const result = await executors.executeNode(nodeData, lead, run, automation, pseudoJob);

    // ── Handle waiting nodes (WhatsApp response, AI call result) ─
    if (result.waiting) {
        logger.info(`⏸️  Node "${nodeLabel}" is waiting (${result.waitingFor || 'response'}) [run ${runId}]`);

        updateExecutionPathStatus(run, nodeId, 'waiting', result);
        await run.save();

        // Update AutomationJob
        await AutomationJob.findOneAndUpdate(
            { automationRun: run._id, nodeId, status: 'processing' },
            { status: 'waiting', result }
        );

        // Schedule timeout check if there's a timeout configured
        if (result.timeoutAt) {
            const timeoutDelay = new Date(result.timeoutAt).getTime() - Date.now();
            if (timeoutDelay > 0) {
                const timeoutType = result.waitingFor === 'call' ? 'call' : 'response';
                await enqueueTimeoutCheck(run._id, timeoutType, timeoutDelay);
            }
        }

        return { waiting: true, nodeId };
    }

    // ── Handle condition nodes ───────────────────
    if (executors.isConditionNodeType(nodeData?.type)) {
        const handle = result.passed ? 'true' : 'false';

        logger.info(`🔀 Condition "${nodeLabel}" evaluated → ${handle} [run ${runId}]`);

        updateExecutionPathStatus(run, nodeId, 'completed', result);
        await run.save();

        // Update AutomationJob
        await AutomationJob.findOneAndUpdate(
            { automationRun: run._id, nodeId, status: 'processing' },
            { status: 'completed', result, completedAt: new Date() }
        );

        // Branch: enqueue the correct downstream path
        await scheduleNextNodes(run, automation, lead, nodeId, handle);
        return { condition: true, handle, nodeId };
    }

    // ── Handle delay nodes ──────────────────────
    if (result.delayed) {
        const delayMs = conditions.calculateDelay(nodeData?.config);

        logger.info(`⏱️  Delay node "${nodeLabel}": ${delayMs}ms [run ${runId}]`);

        updateExecutionPathStatus(run, nodeId, 'completed', result);
        await run.save();

        // Update AutomationJob
        await AutomationJob.findOneAndUpdate(
            { automationRun: run._id, nodeId, status: 'processing' },
            { status: 'completed', result, completedAt: new Date() }
        );

        // Schedule next nodes with the delay
        await scheduleNextNodes(run, automation, lead, nodeId, null, delayMs);
        return { delayed: true, delayMs, nodeId };
    }

    // ── Handle success ──────────────────────────
    if (result.success || result.skipped) {
        logger.info(`✅ Node "${nodeLabel}" completed [run ${runId}]`);

        // Store result in execution context for downstream nodes
        if (result.data || result.messageId || result.callId) {
            run.context = run.context || {};
            run.context.previousResults = run.context.previousResults || {};
            run.context.previousResults[nodeId] = {
                type: nodeData?.type,
                label: nodeLabel,
                ...(result.data || {}),
                messageId: result.messageId,
                callId: result.callId,
                completedAt: new Date().toISOString(),
            };
        }

        updateExecutionPathStatus(run, nodeId, 'completed', result);
        await run.save();

        // Update AutomationJob
        await AutomationJob.findOneAndUpdate(
            { automationRun: run._id, nodeId, status: 'processing' },
            { status: 'completed', result, completedAt: new Date() }
        );

        // Enqueue next nodes
        await scheduleNextNodes(run, automation, lead, nodeId);
        return { success: true, nodeId };
    }

    // ── Handle explicit failure from executor ───
    const errMsg = result.error || 'Unknown executor error';
    logger.error(`❌ Node "${nodeLabel}" failed: ${errMsg} [run ${runId}]`);

    // Update AutomationJob
    await AutomationJob.findOneAndUpdate(
        { automationRun: run._id, nodeId, status: 'processing' },
        { status: 'failed', lastError: errMsg, completedAt: new Date() }
    );

    // Throw to trigger BullMQ retry
    throw new Error(errMsg);
}

// ═════════════════════════════════════════════════════════════════
// TIMEOUT WORKER
// ═════════════════════════════════════════════════════════════════

async function processTimeoutJob(job) {
    const { runId, type } = job.data;

    logger.info(`⏰ Processing ${type} timeout for run ${runId}`);

    const run = await AutomationRun.findById(runId).populate('lead').populate('automation');
    if (!run) {
        logger.warn(`Run ${runId} not found for timeout processing`);
        return { discarded: true };
    }

    // Only process if still waiting
    if (run.status !== 'waiting_for_response') {
        logger.info(`Run ${runId} is no longer waiting (status: ${run.status}), skipping timeout`);
        return { skipped: true, reason: `not_waiting` };
    }

    // Use the BullMQ-compatible scheduleNode function
    const scheduleNodeFn = async (run, automation, lead, node, edge, delay = 0) => {
        run.executionPath.push({
            nodeId: node.id,
            nodeType: node.data?.type || node.type,
            nodeLabel: node.data?.label || node.id,
            label: node.data?.label || node.id,
            status: 'pending',
            scheduledFor: new Date(Date.now() + delay),
        });
        await run.save();

        await enqueueNodeExecution({
            runId: run._id,
            automationId: run.automation._id || run.automation,
            leadId: run.lead._id || run.lead,
            nodeId: node.id,
            nodeData: node.data,
            edgeId: edge?.id,
            organizationId: run.organizationId,
            delay,
        });
    };

    if (type === 'response') {
        await resume.resumeFromTimeout(run, scheduleNodeFn);
    } else if (type === 'call') {
        await resume.resumeFromCallTimeout(run, scheduleNodeFn);
    }

    return { processed: true, type };
}

// ═════════════════════════════════════════════════════════════════
// FAILED JOB HANDLER
// ═════════════════════════════════════════════════════════════════

async function handleFailedExecuteJob(job, err) {
    const { runId, nodeId, nodeData } = job.data || {};
    const nodeLabel = nodeData?.label || nodeData?.type || nodeId;

    // If this was the final attempt (all retries exhausted), mark run as failed
    if (job.attemptsMade >= (job.opts?.attempts || 3)) {
        logger.error(`💀 Node "${nodeLabel}" exhausted all retries [run ${runId}]: ${err.message}`);

        try {
            const run = await AutomationRun.findById(runId);
            if (run && run.status === 'running') {
                // Try failure path first
                const failResult = await recovery.takeFailurePath(
                    { nodeId, nodeData, automationRun: run._id, automation: run.automation },
                    err,
                    async (r, auto, lead, node, edge, delay) => {
                        await enqueueNodeExecution({
                            runId: r._id,
                            automationId: auto._id,
                            leadId: lead._id,
                            nodeId: node.id,
                            nodeData: node.data,
                            edgeId: edge?.id,
                            organizationId: r.organizationId,
                            delay,
                        });
                    }
                );

                if (!failResult || !failResult.success) {
                    run.status = 'failed';
                    run.error = `Node "${nodeLabel}" failed after ${job.attemptsMade} attempts: ${err.message}`;
                    updateExecutionPathStatus(run, nodeId, 'failed', { error: err.message });
                    await run.save();

                    // Notify admin
                    await recovery.notifyAdminOfFailure(
                        { nodeId, nodeData, automationRun: run._id },
                        err
                    ).catch(() => {});
                }
            }

            // Update AutomationJob record
            await AutomationJob.findOneAndUpdate(
                { automationRun: runId, nodeId, status: { $in: ['pending', 'processing'] } },
                { status: 'failed', lastError: err.message, completedAt: new Date() }
            );
        } catch (e) {
            logger.error(`Error in failed job handler: ${e.message}`);
        }
    } else {
        logger.warn(`⚠️ Node "${nodeLabel}" failed (attempt ${job.attemptsMade}/${job.opts?.attempts || 3}): ${err.message} — retrying`);
    }
}

// ═════════════════════════════════════════════════════════════════
// START / STOP WORKERS
// ═════════════════════════════════════════════════════════════════

function startWorkers() {
    const connection = getRedisConnection();

    // ── Trigger Worker ──────────────────────────
    _triggerWorker = new Worker(
        QUEUE_NAMES.TRIGGER,
        processTriggerJob,
        {
            connection,
            concurrency: TRIGGER_CONCURRENCY,
            limiter: { max: 20, duration: 1000 }, // max 20 triggers/sec
        }
    );

    _triggerWorker.on('completed', (job, result) => {
        logger.info(`✅ Trigger job completed: ${job.name} (matched ${result?.matched || 0})`);
    });

    _triggerWorker.on('failed', (job, err) => {
        logger.error(`❌ Trigger job failed: ${job?.name} — ${err.message}`);
    });

    // ── Execute Worker ──────────────────────────
    _executeWorker = new Worker(
        QUEUE_NAMES.EXECUTE,
        processExecuteJob,
        {
            connection,
            concurrency: EXECUTE_CONCURRENCY,
        }
    );

    _executeWorker.on('completed', (job, result) => {
        const label = job.data?.nodeData?.label || job.data?.nodeId;
        if (result?.delayed) {
            logger.info(`⏱️  Execute job scheduled delay: "${label}" (${result.delayMs}ms)`);
        }
    });

    _executeWorker.on('failed', (job, err) => {
        handleFailedExecuteJob(job, err);
    });

    // ── Timeout Worker ──────────────────────────
    _timeoutWorker = new Worker(
        QUEUE_NAMES.TIMEOUT,
        processTimeoutJob,
        {
            connection,
            concurrency: TIMEOUT_CONCURRENCY,
        }
    );

    _timeoutWorker.on('completed', (job, result) => {
        logger.info(`⏰ Timeout job completed: ${job.name}`);
    });

    _timeoutWorker.on('failed', (job, err) => {
        logger.error(`❌ Timeout job failed: ${job?.name} — ${err.message}`);
    });

    logger.info(`🏭 BullMQ Workers started — trigger(${TRIGGER_CONCURRENCY}) execute(${EXECUTE_CONCURRENCY}) timeout(${TIMEOUT_CONCURRENCY})`);
}

async function stopWorkers() {
    const promises = [];
    if (_triggerWorker) promises.push(_triggerWorker.close());
    if (_executeWorker) promises.push(_executeWorker.close());
    if (_timeoutWorker) promises.push(_timeoutWorker.close());
    await Promise.allSettled(promises);
    _triggerWorker = null;
    _executeWorker = null;
    _timeoutWorker = null;
    logger.info('BullMQ Workers stopped');
}

function getWorkerStatus() {
    return {
        trigger: _triggerWorker ? 'running' : 'stopped',
        execute: _executeWorker ? 'running' : 'stopped',
        timeout: _timeoutWorker ? 'running' : 'stopped',
    };
}

// ─── Exports ────────────────────────────────────────────────────

module.exports = {
    startWorkers,
    stopWorkers,
    getWorkerStatus,
    // Expose for resume/webhook handlers that need to schedule nodes via BullMQ
    scheduleNextNodes,
    updateExecutionPathStatus,
};
