/**
 * Workflow Engine
 * Core orchestration for workflow execution, job scheduling, and lifecycle management
 * 
 * Modular architecture:
 * - workflow.triggers.js    - Trigger matching and automation discovery
 * - workflow.conditions.js  - Condition evaluation and templating
 * - workflow.executors.js   - Node type execution handlers
 * - workflow.resume.js      - Response/timeout resumption logic
 * - workflow.recovery.js    - Error recovery and cleanup
 */

const Automation = require('../models/Automation');
const AutomationRun = require('../models/AutomationRun');
const AutomationJob = require('../models/AutomationJob');
const Lead = require('../models/Lead');

// Import modular components
const triggers = require('./workflow.triggers');
const conditions = require('./workflow.conditions');
const executors = require('./workflow.executors');
const resume = require('./workflow.resume');
const recovery = require('./workflow.recovery');

class WorkflowEngine {
    constructor() {
        this.isRunning = false;
        this.jobInterval = null;
        this.timeoutInterval = null;
        this.callTimeoutInterval = null;
        this.processIntervalMs = 5000; // Process jobs every 5 seconds
        this.timeoutCheckIntervalMs = 60000; // Check timeouts every minute
    }

    // =========================================================================
    // Lifecycle Management
    // =========================================================================
    
    start() {
        if (this.isRunning) {
            console.log('⚠️ Workflow engine already running');
            return;
        }
        
        console.log('🚀 Starting workflow engine...');
        this.isRunning = true;
        
        this.jobInterval = setInterval(
            () => this.processJobs(), 
            this.processIntervalMs
        );
        
        this.timeoutInterval = setInterval(
            () => this.processWaitingTimeouts(), 
            this.timeoutCheckIntervalMs
        );
        
        this.callTimeoutInterval = setInterval(
            () => this.processCallTimeouts(), 
            this.timeoutCheckIntervalMs
        );
        
        console.log('✅ Workflow engine started');
    }
    
    stop() {
        if (!this.isRunning) return;
        
        console.log('🛑 Stopping workflow engine...');
        this.isRunning = false;
        
        if (this.jobInterval) clearInterval(this.jobInterval);
        if (this.timeoutInterval) clearInterval(this.timeoutInterval);
        if (this.callTimeoutInterval) clearInterval(this.callTimeoutInterval);
        
        this.jobInterval = null;
        this.timeoutInterval = null;
        this.callTimeoutInterval = null;
        
        console.log('✅ Workflow engine stopped');
    }

    // =========================================================================
    // Trigger Methods - Delegate to triggers module
    // =========================================================================
    
    async triggerNewLead(lead) {
        return triggers.triggerNewLead(lead, this.startAutomation.bind(this));
    }
    
    async triggerLeadUpdated(lead, changes) {
        return triggers.triggerLeadUpdated(lead, changes, this.startAutomation.bind(this));
    }
    
    async triggerSiteVisitScheduled(lead, siteVisit) {
        return triggers.triggerSiteVisitScheduled(lead, siteVisit, this.startAutomation.bind(this));
    }
    
    async triggerStatusChange(lead, oldStatus, newStatus) {
        return triggers.triggerStatusChange(lead, oldStatus, newStatus, this.startAutomation.bind(this));
    }

    // =========================================================================
    // Automation Execution
    // =========================================================================
    
    async startAutomation(automation, lead, context = {}) {
        try {
            // Duplicate prevention
            if (automation.preventDuplicates || automation.runOncePerLead) {
                const existingRun = await AutomationRun.findOne({
                    automation: automation._id,
                    lead: lead._id,
                    status: { $in: ['running', 'waiting_for_response', 'pending'] }
                });
                
                if (existingRun) {
                    console.log(`⚠️ Skipping duplicate run for lead ${lead.name} on automation ${automation.name}`);
                    return { skipped: true, reason: 'duplicate', existingRunId: existingRun._id };
                }
            }
            
            // Cooldown period check
            if (automation.cooldownPeriod) {
                const cooldownMs = automation.cooldownPeriod * 60 * 1000;
                const recentRun = await AutomationRun.findOne({
                    automation: automation._id,
                    lead: lead._id,
                    startedAt: { $gt: new Date(Date.now() - cooldownMs) }
                });
                
                if (recentRun) {
                    console.log(`⚠️ Lead ${lead.name} in cooldown for automation ${automation.name}`);
                    return { skipped: true, reason: 'cooldown' };
                }
            }
            
            console.log(`▶️ Starting automation: ${automation.name} for lead: ${lead.name}`);
            
            // Create automation run
            const run = new AutomationRun({
                automation: automation._id,
                lead: lead._id,
                status: 'running',
                startedAt: new Date(),
                context: context,
                executionPath: []
            });
            await run.save();
            
            // Update automation stats
            automation.runCount = (automation.runCount || 0) + 1;
            automation.lastRunAt = new Date();
            await automation.save();
            
            // Find and schedule trigger/start nodes
            const startNodes = automation.findNodesByType('trigger').length > 0 
                ? automation.findNodesByType('trigger')
                : automation.findNodesByType('start');
            
            if (startNodes.length === 0) {
                throw new Error('No trigger or start node found in automation');
            }
            
            for (const startNode of startNodes) {
                const nextNodes = automation.getNextNodes(startNode.id);
                for (const { node, edge } of nextNodes) {
                    let delay = 0;
                    if (node.data?.type === 'delay' || node.data?.type === 'wait') {
                        delay = conditions.calculateDelay(node.data.config);
                    }
                    await this.scheduleNode(run, automation, lead, node, edge, delay);
                }
            }
            
            return { success: true, runId: run._id };
            
        } catch (error) {
            console.error(`Error starting automation: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // Manual Trigger
    // =========================================================================
    
    async manualTrigger(automationId, leadId, context = {}) {
        try {
            const automation = await Automation.findById(automationId);
            if (!automation) {
                throw new Error('Automation not found');
            }
            
            const lead = await Lead.findById(leadId);
            if (!lead) {
                throw new Error('Lead not found');
            }
            
            return await this.startAutomation(automation, lead, { 
                ...context, 
                manualTrigger: true,
                triggeredAt: new Date()
            });
            
        } catch (error) {
            console.error('Manual trigger error:', error);
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // Job Scheduling
    // =========================================================================
    
    async scheduleNode(run, automation, lead, node, edge, delay = 0) {
        const scheduledFor = new Date(Date.now() + delay);
        
        console.log(`📋 Scheduling node: ${node.data?.label || node.id} for ${scheduledFor.toISOString()}`);
        
        const job = new AutomationJob({
            automation: automation._id,
            automationRun: run._id,
            lead: lead._id,
            nodeId: node.id,
            nodeType: node.data?.type || node.type,
            nodeData: node.data,
            edgeId: edge?.id,
            status: 'pending',
            scheduledFor,
            attempts: 0,
            maxAttempts: node.data?.config?.maxRetries || 3
        });
        
        await job.save();
        
        run.executionPath.push({
            nodeId: node.id,
            nodeType: node.data?.type || node.type,
            label: node.data?.label || node.id,
            status: 'pending',
            scheduledFor
        });
        await run.save();
        
        return job;
    }

    // =========================================================================
    // Job Processing
    // =========================================================================
    
    async processJobs() {
        if (!this.isRunning) return;
        
        try {
            const jobs = await AutomationJob.find({
                status: 'pending',
                scheduledFor: { $lte: new Date() }
            })
            .sort({ scheduledFor: 1 })
            .limit(10);
            
            for (const job of jobs) {
                await this.executeJob(job);
            }
        } catch (error) {
            console.error('Error processing jobs:', error);
        }
    }
    
    async executeJob(job) {
        try {
            job.status = 'processing';
            job.attempts += 1;
            job.lastAttemptAt = new Date();
            await job.save();
            
            const [run, automation, lead] = await Promise.all([
                AutomationRun.findById(job.automationRun),
                Automation.findById(job.automation),
                Lead.findById(job.lead)
            ]);
            
            if (!run || run.status === 'cancelled' || run.status === 'completed') {
                job.status = 'cancelled';
                job.result = { reason: 'Run cancelled or completed' };
                await job.save();
                return;
            }
            
            if (!automation || !lead) {
                throw new Error('Missing automation or lead');
            }
            
            // Update execution path to running
            this.updateExecutionPathStatus(run, job.nodeId, 'running');
            run.currentNodeId = job.nodeId;
            await run.save();
            
            console.log(`⚙️ Executing node: ${job.nodeData?.label || job.nodeId} (${job.nodeType})`);
            
            // Execute the node using executors module
            const result = await executors.executeNode(
                job.nodeData, 
                lead, 
                run, 
                automation, 
                job
            );
            
            // Handle waiting nodes
            if (result.waiting) {
                job.status = 'waiting';
                job.result = result;
                await job.save();
                return;
            }
            
            // Handle conditions
            if (executors.isConditionNodeType(job.nodeType)) {
                await this.handleConditionResult(job, run, automation, lead, result);
                return;
            }
            
            // Handle delays
            if (result.delayed) {
                job.status = 'completed';
                job.result = result;
                job.completedAt = new Date();
                await job.save();
                
                this.updateExecutionPathStatus(run, job.nodeId, 'completed', result);
                await run.save();
                
                // Schedule next nodes with delay
                const delay = conditions.calculateDelay(job.nodeData?.config);
                await this.scheduleNextNodes(run, automation, lead, job.nodeId, null, delay);
                return;
            }
            
            // Handle success
            if (result.success || result.skipped) {
                job.status = 'completed';
                job.result = result;
                job.completedAt = new Date();
                await job.save();
                
                this.updateExecutionPathStatus(run, job.nodeId, 'completed', result);
                await run.save();
                
                await this.scheduleNextNodes(run, automation, lead, job.nodeId);
            } else {
                await this.handleJobFailure(job, run, new Error(result.error || 'Unknown error'));
            }
            
        } catch (error) {
            console.error(`Error executing job ${job._id}:`, error);
            await this.handleJobFailure(job, await AutomationRun.findById(job.automationRun), error);
        }
    }

    // =========================================================================
    // Condition Handling
    // =========================================================================
    
    async handleConditionResult(job, run, automation, lead, result) {
        job.status = 'completed';
        job.result = result;
        job.completedAt = new Date();
        await job.save();
        
        this.updateExecutionPathStatus(run, job.nodeId, 'completed', result);
        await run.save();
        
        const handle = result.passed ? 'true' : 'false';
        await this.scheduleNextNodes(run, automation, lead, job.nodeId, handle);
    }

    // =========================================================================
    // Failure Handling
    // =========================================================================
    
    async handleJobFailure(job, run, error) {
        console.error(`❌ Job failed: ${job.nodeData?.label || job.nodeId}`, error.message);
        
        if (job.attempts < job.maxAttempts) {
            // Retry with exponential backoff
            const retryDelay = Math.pow(2, job.attempts) * 1000;
            job.status = 'pending';
            job.scheduledFor = new Date(Date.now() + retryDelay);
            job.error = error.message;
            await job.save();
            console.log(`🔄 Retrying job in ${retryDelay}ms (attempt ${job.attempts}/${job.maxAttempts})`);
            return;
        }
        
        // Max retries exceeded
        job.status = 'failed';
        job.error = error.message;
        job.completedAt = new Date();
        await job.save();
        
        // Try failure path
        const failureResult = await recovery.takeFailurePath(
            job, 
            error, 
            this.scheduleNode.bind(this)
        );
        
        if (!failureResult.success) {
            // No failure path - notify admin and fail run
            await recovery.notifyAdminOfFailure(job, error);
            
            if (run) {
                run.status = 'failed';
                run.error = error.message;
                this.updateExecutionPathStatus(run, job.nodeId, 'failed', { error: error.message });
                await run.save();
            }
        }
    }

    // =========================================================================
    // Timeout Processing
    // =========================================================================
    
    async processWaitingTimeouts() {
        if (!this.isRunning) return;
        
        try {
            const timedOutRuns = await AutomationRun.find({
                status: 'waiting_for_response',
                'waitingForResponse.isWaiting': true,
                'waitingForResponse.timeoutAt': { $lte: new Date() }
            }).populate('lead').populate('automation');
            
            for (const run of timedOutRuns) {
                console.log(`⏰ Processing timeout for run ${run._id}`);
                await resume.resumeFromTimeout(run, this.scheduleNode.bind(this));
            }
        } catch (error) {
            console.error('Error processing waiting timeouts:', error);
        }
    }
    
    async processCallTimeouts() {
        if (!this.isRunning) return;
        
        try {
            const timedOutRuns = await AutomationRun.find({
                status: 'waiting_for_response',
                'waitingForCall.isWaiting': true,
                'waitingForCall.timeoutAt': { $lte: new Date() }
            }).populate('lead').populate('automation');
            
            for (const run of timedOutRuns) {
                console.log(`⏰ Processing call timeout for run ${run._id}`);
                await resume.resumeFromCallTimeout(run, this.scheduleNode.bind(this));
            }
        } catch (error) {
            console.error('Error processing call timeouts:', error);
        }
    }

    // =========================================================================
    // Resume Methods - Delegate to resume module
    // =========================================================================
    
    async resumeFromResponse(run, parsedMessage) {
        return resume.resumeFromResponse(run, parsedMessage, this.scheduleNode.bind(this));
    }
    
    async resumeFromTimeout(run) {
        return resume.resumeFromTimeout(run, this.scheduleNode.bind(this));
    }
    
    async resumeFromCallResult(run, callResult) {
        return resume.resumeFromCallResult(run, callResult, this.scheduleNode.bind(this));
    }
    
    async resumeFromCallTimeout(run) {
        return resume.resumeFromCallTimeout(run, this.scheduleNode.bind(this));
    }
    
    async resumeFromTaskCompletion(task) {
        return resume.resumeFromTaskCompletion(task, this.scheduleNode.bind(this));
    }

    // =========================================================================
    // Recovery & Cleanup - Delegate to recovery module
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
        return recovery.getHealthStats();
    }

    // =========================================================================
    // Helper Methods
    // =========================================================================
    
    updateExecutionPathStatus(run, nodeId, status, result = null) {
        const pathIndex = run.executionPath.findIndex(
            p => p.nodeId === nodeId && (p.status === 'pending' || p.status === 'running')
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
    
    async scheduleNextNodes(run, automation, lead, currentNodeId, handle = null, delay = 0) {
        let nextNodes = automation.getNextNodes(currentNodeId, handle);
        
        if (nextNodes.length === 0 && handle) {
            nextNodes = automation.getNextNodes(currentNodeId);
        }
        
        if (nextNodes.length === 0) {
            // Check for other pending jobs
            const pendingJobs = await AutomationJob.countDocuments({
                automationRun: run._id,
                status: 'pending'
            });
            
            if (pendingJobs === 0) {
                run.status = 'completed';
                run.completedAt = new Date();
                await run.save();
                
                automation.successCount = (automation.successCount || 0) + 1;
                await automation.save();
                
                console.log(`✅ Automation run completed: ${automation.name}`);
            }
            return 0;
        }
        
        for (const { node, edge } of nextNodes) {
            let nodeDelay = delay;
            if (node.data?.type === 'delay' || node.data?.type === 'wait') {
                nodeDelay = conditions.calculateDelay(node.data.config);
            }
            await this.scheduleNode(run, automation, lead, node, edge, nodeDelay);
        }
        
        return nextNodes.length;
    }

    // =========================================================================
    // Execute with Recovery Wrapper
    // =========================================================================
    
    async executeJobWithRecovery(job, options = {}) {
        const { skipOnFailure = false, useFailurePath = true } = options;
        
        try {
            await this.executeJob(job);
        } catch (error) {
            console.error(`Job execution failed with recovery: ${error.message}`);
            
            if (skipOnFailure) {
                await recovery.skipFailedNode(job, error, this.scheduleNode.bind(this));
            } else if (useFailurePath) {
                await recovery.takeFailurePath(job, error, this.scheduleNode.bind(this));
            } else {
                throw error;
            }
        }
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
