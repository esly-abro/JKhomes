/**
 * Workflow Recovery
 * Handles error recovery, cleanup, and stuck automation handling
 */

const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const Automation = require('../models/Automation');
const Lead = require('../models/Lead');
const emailService = require('./email.service');
const { calculateDelay } = require('./workflow.conditions');

/**
 * Clean up old automation runs to prevent database bloat
 * 
 * @param {number} daysToKeep - Days to keep completed runs (default: 30)
 * @param {number} failedDaysToKeep - Days to keep failed runs (default: 90)
 */
async function cleanupOldRuns(daysToKeep = 30, failedDaysToKeep = 90) {
    try {
        const now = new Date();
        const completedCutoff = new Date(now - daysToKeep * 24 * 60 * 60 * 1000);
        const failedCutoff = new Date(now - failedDaysToKeep * 24 * 60 * 60 * 1000);

        console.log(`🧹 Starting cleanup: Completed runs older than ${daysToKeep} days, Failed runs older than ${failedDaysToKeep} days`);

        const completedResult = await AutomationRun.deleteMany({
            status: 'completed',
            completedAt: { $lt: completedCutoff }
        });
        console.log(`   Deleted ${completedResult.deletedCount} completed runs`);

        const failedResult = await AutomationRun.deleteMany({
            status: 'failed',
            updatedAt: { $lt: failedCutoff }
        });
        console.log(`   Deleted ${failedResult.deletedCount} failed runs`);

        const cancelledResult = await AutomationRun.deleteMany({
            status: 'cancelled',
            updatedAt: { $lt: completedCutoff }
        });
        console.log(`   Deleted ${cancelledResult.deletedCount} cancelled runs`);

        const existingRunIds = await AutomationRun.find({}, '_id').distinct('_id');
        const orphanJobsResult = await AutomationJob.deleteMany({
            automationRun: { $nin: existingRunIds }
        });
        console.log(`   Deleted ${orphanJobsResult.deletedCount} orphan jobs`);

        const jobsCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const oldJobsResult = await AutomationJob.deleteMany({
            status: 'completed',
            completedAt: { $lt: jobsCutoff }
        });
        console.log(`   Deleted ${oldJobsResult.deletedCount} old completed jobs`);

        const totalDeleted = completedResult.deletedCount + failedResult.deletedCount + 
                            cancelledResult.deletedCount + orphanJobsResult.deletedCount + 
                            oldJobsResult.deletedCount;
        
        console.log(`🧹 Cleanup complete: ${totalDeleted} total records deleted`);

        return {
            success: true,
            deleted: {
                completedRuns: completedResult.deletedCount,
                failedRuns: failedResult.deletedCount,
                cancelledRuns: cancelledResult.deletedCount,
                orphanJobs: orphanJobsResult.deletedCount,
                oldJobs: oldJobsResult.deletedCount,
                total: totalDeleted
            }
        };

    } catch (error) {
        console.error('Error during cleanup:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get cleanup statistics without deleting
 */
async function getCleanupStats(daysToKeep = 30, failedDaysToKeep = 90) {
    const now = new Date();
    const completedCutoff = new Date(now - daysToKeep * 24 * 60 * 60 * 1000);
    const failedCutoff = new Date(now - failedDaysToKeep * 24 * 60 * 60 * 1000);

    const completedCount = await AutomationRun.countDocuments({
        status: 'completed',
        completedAt: { $lt: completedCutoff }
    });

    const failedCount = await AutomationRun.countDocuments({
        status: 'failed',
        updatedAt: { $lt: failedCutoff }
    });

    const cancelledCount = await AutomationRun.countDocuments({
        status: 'cancelled',
        updatedAt: { $lt: completedCutoff }
    });

    return {
        wouldDelete: {
            completedRuns: completedCount,
            failedRuns: failedCount,
            cancelledRuns: cancelledCount,
            total: completedCount + failedCount + cancelledCount
        },
        cutoffDates: {
            completed: completedCutoff,
            failed: failedCutoff
        }
    };
}

/**
 * Skip a failed node and continue to next nodes
 */
async function skipFailedNode(job, error, scheduleNodeFn) {
    try {
        console.log(`⏭️ Skipping failed node: ${job.nodeData?.label || job.nodeId}`);
        
        const run = await AutomationRun.findById(job.automationRun);
        const automation = await Automation.findById(job.automation);
        const lead = await Lead.findById(job.lead);

        if (!run || !automation || !lead) {
            throw new Error('Missing run, automation, or lead');
        }

        const pathIndex = run.executionPath.findIndex(
            p => p.nodeId === job.nodeId && p.status === 'running'
        );
        if (pathIndex >= 0) {
            run.executionPath[pathIndex].status = 'skipped';
            run.executionPath[pathIndex].error = error.message;
            run.executionPath[pathIndex].completedAt = new Date();
        }
        await run.save();

        job.status = 'completed';
        job.result = { skipped: true, error: error.message };
        job.completedAt = new Date();
        await job.save();

        const nextNodes = automation.getNextNodes(job.nodeId);
        for (const { node, edge } of nextNodes) {
            let delay = 0;
            if (node.data?.type === 'delay' || node.data?.type === 'wait') {
                delay = calculateDelay(node.data.config);
            }
            await scheduleNodeFn(run, automation, lead, node, edge, delay);
        }

        return { success: true, skipped: true };

    } catch (err) {
        console.error('Error skipping failed node:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Take the failure path when a node fails
 */
async function takeFailurePath(job, error, scheduleNodeFn) {
    try {
        console.log(`🔀 Taking failure path for: ${job.nodeData?.label || job.nodeId}`);
        
        const run = await AutomationRun.findById(job.automationRun);
        const automation = await Automation.findById(job.automation);
        const lead = await Lead.findById(job.lead);

        if (!run || !automation || !lead) {
            throw new Error('Missing run, automation, or lead');
        }

        const pathIndex = run.executionPath.findIndex(
            p => p.nodeId === job.nodeId && p.status === 'running'
        );
        if (pathIndex >= 0) {
            run.executionPath[pathIndex].status = 'failed';
            run.executionPath[pathIndex].error = error.message;
            run.executionPath[pathIndex].completedAt = new Date();
        }
        
        if (!run.context) run.context = {};
        run.context.lastError = error.message;
        run.context.failedNodeId = job.nodeId;
        run.context.failedNodeType = job.nodeType;
        await run.save();

        job.status = 'completed';
        job.result = { failed: true, error: error.message, tookFailurePath: true };
        job.completedAt = new Date();
        await job.save();

        let nextNodes = automation.getNextNodes(job.nodeId, 'failure');
        if (nextNodes.length === 0) {
            nextNodes = automation.getNextNodes(job.nodeId, 'error');
        }

        if (nextNodes.length === 0) {
            console.log('⚠️ No failure path found, stopping automation');
            run.status = 'failed';
            run.error = error.message;
            await run.save();
            return { success: false, reason: 'No failure path found' };
        }

        for (const { node, edge } of nextNodes) {
            let delay = 0;
            if (node.data?.type === 'delay' || node.data?.type === 'wait') {
                delay = calculateDelay(node.data.config);
            }
            await scheduleNodeFn(run, automation, lead, node, edge, delay);
        }

        return { success: true, tookFailurePath: true, nextNodes: nextNodes.length };

    } catch (err) {
        console.error('Error taking failure path:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Notify admin of critical automation failure
 */
async function notifyAdminOfFailure(job, error) {
    try {
        const run = await AutomationRun.findById(job.automationRun);
        const automation = await Automation.findById(job.automation);
        const lead = await Lead.findById(job.lead);

        const notification = {
            type: 'automation_failure',
            severity: 'critical',
            timestamp: new Date(),
            details: {
                automationId: automation?._id,
                automationName: automation?.name,
                runId: run?._id,
                leadId: lead?._id,
                leadName: lead?.name,
                leadPhone: lead?.phone,
                nodeId: job.nodeId,
                nodeType: job.nodeType,
                nodeLabel: job.nodeData?.label,
                error: error.message,
                attempts: job.attempts,
                maxAttempts: job.maxAttempts
            }
        };

        console.log(`🚨 ADMIN NOTIFICATION:`, JSON.stringify(notification, null, 2));

        try {
            const adminEmail = process.env.ADMIN_EMAIL;
            if (adminEmail) {
                await emailService.sendEmail({
                    to: adminEmail,
                    subject: `🚨 Automation Failure: ${automation?.name || 'Unknown'}`,
                    text: `
Automation Failure Alert
========================

Automation: ${automation?.name || 'Unknown'}
Lead: ${lead?.name || 'Unknown'} (${lead?.phone || 'No phone'})
Failed Node: ${job.nodeData?.label || job.nodeId}
Error: ${error.message}
Attempts: ${job.attempts}/${job.maxAttempts}

Run ID: ${run?._id}
Time: ${new Date().toISOString()}

Please check the automation dashboard for details.
                    `.trim()
                });
                console.log(`📧 Admin notification email sent to ${adminEmail}`);
            }
        } catch (emailError) {
            console.error('Failed to send admin email:', emailError.message);
        }

        // Store notification as activity
        const Activity = require('../models/Activity');
        await Activity.create({
            leadId: lead?._id?.toString() || 'system',
            type: 'note',
            title: `⚠️ Automation Failed: ${automation?.name}`,
            description: `Error in "${job.nodeData?.label}": ${error.message}`,
            metadata: notification.details
        });

        return notification;

    } catch (err) {
        console.error('Error sending admin notification:', err);
        return null;
    }
}

/**
 * Recover stuck automations
 */
async function recoverStuckAutomations(stuckThresholdHours = 24, resumeTimeoutFn, resumeCallTimeoutFn) {
    try {
        const threshold = new Date(Date.now() - stuckThresholdHours * 60 * 60 * 1000);
        
        console.log(`🔧 Looking for automations stuck since ${threshold.toISOString()}`);

        const stuckRuns = await AutomationRun.find({
            status: { $in: ['running', 'waiting_for_response'] },
            updatedAt: { $lt: threshold }
        }).populate('lead').populate('automation');

        console.log(`   Found ${stuckRuns.length} stuck automations`);

        let recovered = 0;
        let failed = 0;

        for (const run of stuckRuns) {
            try {
                const pendingJobs = await AutomationJob.countDocuments({
                    automationRun: run._id,
                    status: 'pending'
                });

                if (pendingJobs > 0) {
                    console.log(`   Run ${run._id}: ${pendingJobs} pending jobs, attempting to process`);
                    
                    await AutomationJob.updateMany(
                        { automationRun: run._id, status: 'processing' },
                        { status: 'pending', scheduledFor: new Date() }
                    );
                    recovered++;
                } else if (run.status === 'waiting_for_response') {
                    console.log(`   Run ${run._id}: Timeout on waiting_for_response`);
                    
                    if (run.waitingForResponse?.isWaiting && resumeTimeoutFn) {
                        await resumeTimeoutFn(run);
                    } else if (run.waitingForCall?.isWaiting && resumeCallTimeoutFn) {
                        await resumeCallTimeoutFn(run);
                    } else {
                        run.status = 'failed';
                        run.error = 'Stuck in waiting state with no pending response';
                        await run.save();
                        failed++;
                    }
                    recovered++;
                } else {
                    console.log(`   Run ${run._id}: No pending jobs, marking as failed`);
                    run.status = 'failed';
                    run.error = 'Automation stuck with no pending jobs';
                    await run.save();
                    failed++;
                }
            } catch (err) {
                console.error(`   Error recovering run ${run._id}:`, err);
                failed++;
            }
        }

        console.log(`🔧 Recovery complete: ${recovered} recovered, ${failed} failed`);

        return {
            success: true,
            found: stuckRuns.length,
            recovered,
            failed
        };

    } catch (error) {
        console.error('Error recovering stuck automations:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get automation health statistics
 */
async function getHealthStats() {
    const now = new Date();
    const lastHour = new Date(now - 60 * 60 * 1000);
    const last24Hours = new Date(now - 24 * 60 * 60 * 1000);

    const stats = {
        totalRuns: await AutomationRun.countDocuments(),
        runningRuns: await AutomationRun.countDocuments({ status: 'running' }),
        waitingRuns: await AutomationRun.countDocuments({ status: 'waiting_for_response' }),
        failedLast24h: await AutomationRun.countDocuments({ 
            status: 'failed', 
            updatedAt: { $gte: last24Hours } 
        }),
        completedLast24h: await AutomationRun.countDocuments({ 
            status: 'completed', 
            completedAt: { $gte: last24Hours } 
        }),
        pendingJobs: await AutomationJob.countDocuments({ status: 'pending' }),
        processingJobs: await AutomationJob.countDocuments({ status: 'processing' }),
        failedJobsLastHour: await AutomationJob.countDocuments({ 
            status: 'failed', 
            updatedAt: { $gte: lastHour } 
        })
    };

    stats.healthScore = calculateHealthScore(stats);
    
    return stats;
}

/**
 * Calculate health score (0-100)
 */
function calculateHealthScore(stats) {
    let score = 100;
    
    // Deduct for failed runs
    if (stats.failedLast24h > 10) score -= 20;
    else if (stats.failedLast24h > 5) score -= 10;
    else if (stats.failedLast24h > 0) score -= 5;
    
    // Deduct for stuck jobs
    if (stats.processingJobs > 10) score -= 15;
    else if (stats.processingJobs > 5) score -= 10;
    
    // Deduct for recent job failures
    if (stats.failedJobsLastHour > 5) score -= 20;
    else if (stats.failedJobsLastHour > 0) score -= 10;
    
    // Deduct for too many pending jobs
    if (stats.pendingJobs > 100) score -= 10;
    else if (stats.pendingJobs > 50) score -= 5;
    
    return Math.max(0, score);
}

module.exports = {
    cleanupOldRuns,
    getCleanupStats,
    skipFailedNode,
    takeFailurePath,
    notifyAdminOfFailure,
    recoverStuckAutomations,
    getHealthStats,
    calculateHealthScore
};
