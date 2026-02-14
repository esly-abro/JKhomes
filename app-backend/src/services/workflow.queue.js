/**
 * Workflow Queue
 * 
 * BullMQ-based job queue for workflow execution.
 * Replaces the old MongoDB-polling + setInterval approach.
 *
 * Queue names:
 *   workflow:execute   – Execute a single workflow node
 *   workflow:trigger   – Process a trigger event (find matching workflows, start executions)
 *   workflow:timeout   – Check for timed-out waiting runs
 *
 * Job data shapes:
 *   workflow:execute  → { runId, automationId, leadId, nodeId, nodeData, edgeId, organizationId }
 *   workflow:trigger  → { event, leadId, organizationId, changes?, context? }
 *   workflow:timeout  → { type: 'response' | 'call', runId }
 */

const { Queue, QueueEvents } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const logger = require('../utils/logger');

// ─── Queue Names ────────────────────────────────────────────────

const QUEUE_NAMES = {
    EXECUTE: 'workflow:execute',
    TRIGGER: 'workflow:trigger',
    TIMEOUT: 'workflow:timeout',
};

// ─── Queue Instances ────────────────────────────────────────────

let _executeQueue = null;
let _triggerQueue = null;
let _timeoutQueue = null;

function getExecuteQueue() {
    if (!_executeQueue) {
        _executeQueue = new Queue(QUEUE_NAMES.EXECUTE, {
            connection: getRedisConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
                removeOnComplete: { count: 500, age: 7 * 24 * 3600 },  // keep 500 or 7 days
                removeOnFail: { count: 1000, age: 14 * 24 * 3600 },    // keep 1000 or 14 days
            },
        });
    }
    return _executeQueue;
}

function getTriggerQueue() {
    if (!_triggerQueue) {
        _triggerQueue = new Queue(QUEUE_NAMES.TRIGGER, {
            connection: getRedisConnection(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: { count: 200, age: 24 * 3600 },
                removeOnFail: { count: 500, age: 7 * 24 * 3600 },
            },
        });
    }
    return _triggerQueue;
}

function getTimeoutQueue() {
    if (!_timeoutQueue) {
        _timeoutQueue = new Queue(QUEUE_NAMES.TIMEOUT, {
            connection: getRedisConnection(),
            defaultJobOptions: {
                attempts: 2,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 200 },
            },
        });
    }
    return _timeoutQueue;
}

// ─── Enqueue Helpers ────────────────────────────────────────────

/**
 * Enqueue a trigger event. Called when a lead is created/updated/etc.
 * The worker will find matching workflows and start executions.
 */
async function enqueueTriggerEvent(event, leadId, organizationId, extra = {}) {
    const queue = getTriggerQueue();
    const jobId = `trigger:${event}:${leadId}:${Date.now()}`;

    const job = await queue.add(
        event,                      // job name
        {
            event,
            leadId: String(leadId),
            organizationId: String(organizationId),
            ...extra,               // changes, context, etc.
            enqueuedAt: new Date().toISOString(),
        },
        { jobId }
    );

    logger.info(`📨 Enqueued trigger event: ${event} for lead ${leadId} (job ${job.id})`);
    return job;
}

/**
 * Enqueue a node execution step.
 * @param {Object} opts
 * @param {string} opts.runId           - AutomationRun._id
 * @param {string} opts.automationId    - Automation._id
 * @param {string} opts.leadId          - Lead._id
 * @param {string} opts.nodeId          - Node id within the workflow
 * @param {Object} opts.nodeData        - Full node data
 * @param {string} [opts.edgeId]        - Edge that led here
 * @param {string} [opts.organizationId]
 * @param {number} [opts.delay=0]       - Delay in milliseconds (BullMQ delayed job)
 */
async function enqueueNodeExecution(opts) {
    const {
        runId,
        automationId,
        leadId,
        nodeId,
        nodeData,
        edgeId,
        organizationId,
        delay = 0,
    } = opts;

    const queue = getExecuteQueue();
    const jobId = `exec:${runId}:${nodeId}:${Date.now()}`;
    const nodeLabel = nodeData?.label || nodeData?.type || nodeId;

    const jobOpts = { jobId };

    // BullMQ delayed job — the clean replacement for scheduledFor + MongoDB poll
    if (delay > 0) {
        jobOpts.delay = delay;
        logger.info(`⏱️  Scheduling node "${nodeLabel}" with ${delay}ms delay (job ${jobId})`);
    } else {
        logger.info(`📋 Enqueuing node "${nodeLabel}" for immediate execution (job ${jobId})`);
    }

    const job = await queue.add(
        nodeData?.type || 'unknown',  // job name = node type
        {
            runId: String(runId),
            automationId: String(automationId),
            leadId: String(leadId),
            nodeId,
            nodeData,
            edgeId,
            organizationId: organizationId ? String(organizationId) : undefined,
            enqueuedAt: new Date().toISOString(),
        },
        jobOpts
    );

    return job;
}

/**
 * Enqueue a timeout check for a waiting run.
 */
async function enqueueTimeoutCheck(runId, type, delayMs) {
    const queue = getTimeoutQueue();
    const jobId = `timeout:${type}:${runId}:${Date.now()}`;

    const job = await queue.add(
        `timeout:${type}`,
        {
            runId: String(runId),
            type,
            enqueuedAt: new Date().toISOString(),
        },
        { jobId, delay: delayMs }
    );

    logger.info(`⏰ Enqueued ${type} timeout check for run ${runId} in ${delayMs}ms`);
    return job;
}

// ─── Drain & Close ──────────────────────────────────────────────

async function closeQueues() {
    const promises = [];
    if (_executeQueue) promises.push(_executeQueue.close());
    if (_triggerQueue) promises.push(_triggerQueue.close());
    if (_timeoutQueue) promises.push(_timeoutQueue.close());
    await Promise.allSettled(promises);
    _executeQueue = null;
    _triggerQueue = null;
    _timeoutQueue = null;
    logger.info('BullMQ queues closed');
}

// ─── Exports ────────────────────────────────────────────────────

module.exports = {
    QUEUE_NAMES,
    getExecuteQueue,
    getTriggerQueue,
    getTimeoutQueue,
    enqueueTriggerEvent,
    enqueueNodeExecution,
    enqueueTimeoutCheck,
    closeQueues,
};
