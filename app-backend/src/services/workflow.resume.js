/**
 * Workflow Resume Handlers
 * Handles resumption of paused workflows from responses, timeouts, etc.
 */

const AutomationRun = require('../models/AutomationRun');
const { calculateDelay } = require('./workflow.conditions');

/**
 * Resume automation from a WhatsApp response
 */
async function resumeFromResponse(run, parsedMessage, scheduleNodeFn) {
    try {
        console.log(`▶️ Resuming automation ${run._id} from response`);
        
        const automation = run.automation;
        const lead = run.lead;
        
        if (!automation || !lead) {
            throw new Error('Missing automation or lead data');
        }
        
        // Store the response in run context
        run.lastResponse = {
            type: parsedMessage.type === 'interactive' || parsedMessage.buttonPayload ? 'button' : parsedMessage.type,
            value: parsedMessage.value,
            rawPayload: parsedMessage.raw,
            receivedAt: new Date()
        };
        
        if (!run.context) run.context = {};
        run.context.lastResponse = run.lastResponse;
        run.context.responseText = parsedMessage.text || parsedMessage.buttonText;
        run.context.responsePayload = parsedMessage.buttonPayload || parsedMessage.value;
        
        // Determine which handle to use
        const nextHandle = matchResponseToHandle(parsedMessage, run.waitingForResponse?.expectedResponses || []);
        
        console.log(`   Response matched handle: ${nextHandle}`);
        
        // Update execution path
        updateExecutionPathCompleted(run, run.waitingForResponse?.nodeId, {
            responseReceived: true,
            responseType: run.lastResponse.type,
            responseValue: run.lastResponse.value,
            matchedHandle: nextHandle
        });
        
        // Clear waiting state
        const waitingNodeId = run.waitingForResponse.nodeId;
        run.status = 'running';
        run.waitingForResponse.isWaiting = false;
        await run.save();
        
        // Update lead status
        lead.whatsappStatus = 'replied';
        lead.lastWhatsappAt = new Date();
        lead.lastContactAt = new Date();
        await lead.save();
        
        // Schedule next nodes
        const scheduled = await scheduleNextNodes(run, automation, lead, waitingNodeId, nextHandle, scheduleNodeFn);
        
        return {
            success: true,
            handle: nextHandle,
            nextNodesScheduled: scheduled
        };
        
    } catch (error) {
        console.error('Error resuming from response:', error);
        
        run.status = 'failed';
        run.error = error.message;
        await run.save();
        
        return { success: false, error: error.message };
    }
}

/**
 * Resume automation after timeout (no response received)
 */
async function resumeFromTimeout(run, scheduleNodeFn) {
    try {
        console.log(`⏰ Resuming automation ${run._id} from timeout`);
        
        const automation = run.automation;
        const lead = run.lead;
        
        if (!automation || !lead) {
            throw new Error('Missing automation or lead data');
        }
        
        if (!run.context) run.context = {};
        run.context.timedOut = true;
        run.context.timeoutAt = new Date();
        
        updateExecutionPathCompleted(run, run.waitingForResponse?.nodeId, {
            timedOut: true,
            timeoutAt: new Date()
        });
        
        const timeoutHandle = run.waitingForResponse?.timeoutHandle || 'timeout';
        const waitingNodeId = run.waitingForResponse.nodeId;
        
        run.status = 'running';
        run.waitingForResponse.isWaiting = false;
        await run.save();
        
        lead.whatsappStatus = 'not_responding';
        await lead.save();
        
        const scheduled = await scheduleNextNodes(run, automation, lead, waitingNodeId, timeoutHandle, scheduleNodeFn);
        
        if (scheduled === 0) {
            run.status = 'completed';
            run.completedAt = new Date();
            await run.save();
            console.log(`✅ Automation run completed (timeout, no timeout path): ${automation.name}`);
        } else {
            console.log(`⏰ Timeout path scheduled: ${scheduled} nodes`);
        }
        
        return { success: true, timedOut: true, nextNodesScheduled: scheduled };
        
    } catch (error) {
        console.error('Error resuming from timeout:', error);
        
        run.status = 'failed';
        run.error = error.message;
        await run.save();
        
        return { success: false, error: error.message };
    }
}

/**
 * Resume automation from AI call result
 */
async function resumeFromCallResult(run, callResult, scheduleNodeFn) {
    try {
        console.log(`📞 Resuming automation ${run._id} from call result: ${callResult.outcome}`);
        
        const automation = run.automation;
        const lead = run.lead;
        
        if (!automation || !lead) {
            throw new Error('Missing automation or lead data');
        }
        
        // Store the call result
        run.lastCallResult = {
            outcome: callResult.outcome,
            status: callResult.status,
            duration: callResult.duration,
            transcriptSummary: callResult.transcriptSummary,
            analysis: callResult.analysis,
            evaluationResults: callResult.evaluationResults,
            sentiment: callResult.analysis?.sentiment,
            intent: callResult.analysis?.intent,
            receivedAt: new Date()
        };
        
        if (!run.context) run.context = {};
        run.context.lastCallResult = run.lastCallResult;
        run.context.callOutcome = callResult.outcome;
        run.context.callDuration = callResult.duration;
        run.context.callSummary = callResult.transcriptSummary;
        run.context.isInterested = callResult.evaluationResults?.interested === 'true' || 
                                   callResult.evaluationResults?.interested === true;
        run.context.callbackRequested = callResult.evaluationResults?.callback_requested === 'true' ||
                                        callResult.evaluationResults?.callback_requested === true;
        
        // Determine handle from call outcome
        const nextHandle = matchCallOutcomeToHandle(callResult.outcome, run.waitingForCall?.expectedOutcomes || []);
        
        console.log(`   Call outcome matched handle: ${nextHandle}`);
        
        updateExecutionPathCompleted(run, run.waitingForCall?.nodeId, {
            callCompleted: true,
            outcome: callResult.outcome,
            duration: callResult.duration,
            matchedHandle: nextHandle,
            transcriptSummary: callResult.transcriptSummary
        });
        
        const waitingNodeId = run.waitingForCall.nodeId;
        run.status = 'running';
        run.waitingForCall.isWaiting = false;
        await run.save();
        
        // Update lead based on call outcome
        lead.lastContactedAt = new Date();
        lead.lastCallAt = new Date();
        if (callResult.outcome === 'interested') {
            lead.status = 'Interested';
        } else if (callResult.outcome === 'answered' && 
                   (lead.status === 'New' || lead.status === 'No Response')) {
            lead.status = 'Call Attended';
        }
        await lead.save();
        
        const scheduled = await scheduleNextNodes(run, automation, lead, waitingNodeId, nextHandle, scheduleNodeFn);
        
        return {
            success: true,
            outcome: callResult.outcome,
            handle: nextHandle,
            nextNodesScheduled: scheduled
        };
        
    } catch (error) {
        console.error('Error resuming from call result:', error);
        
        run.status = 'failed';
        run.error = error.message;
        await run.save();
        
        return { success: false, error: error.message };
    }
}

/**
 * Resume automation after call timeout
 */
async function resumeFromCallTimeout(run, scheduleNodeFn) {
    try {
        console.log(`⏰ Resuming automation ${run._id} from call timeout`);
        
        const automation = run.automation;
        const lead = run.lead;
        
        if (!automation || !lead) {
            throw new Error('Missing automation or lead data');
        }
        
        if (!run.context) run.context = {};
        run.context.callTimedOut = true;
        run.context.callTimeoutAt = new Date();
        
        updateExecutionPathCompleted(run, run.waitingForCall?.nodeId, {
            timedOut: true,
            timeoutAt: new Date()
        });
        
        const timeoutHandle = run.waitingForCall?.timeoutHandle || 'timeout';
        const waitingNodeId = run.waitingForCall.nodeId;
        
        run.status = 'running';
        run.waitingForCall.isWaiting = false;
        await run.save();
        
        const scheduled = await scheduleNextNodes(run, automation, lead, waitingNodeId, timeoutHandle, scheduleNodeFn);
        
        if (scheduled === 0) {
            run.status = 'completed';
            run.completedAt = new Date();
            await run.save();
            console.log(`✅ Automation run completed (call timeout, no timeout path): ${automation.name}`);
        } else {
            console.log(`⏰ Call timeout path scheduled: ${scheduled} nodes`);
        }
        
        return { success: true, timedOut: true, nextNodesScheduled: scheduled };
        
    } catch (error) {
        console.error('Error resuming from call timeout:', error);
        
        run.status = 'failed';
        run.error = error.message;
        await run.save();
        
        return { success: false, error: error.message };
    }
}

/**
 * Resume automation when an agent completes a task
 * Works with the new Task model structure
 */
async function resumeFromTaskCompletion(task, scheduleNodeFn) {
    try {
        // Support both new Task model and old Activity metadata
        const automationRunId = task.automationRun || task.metadata?.automationRunId;
        const nodeId = task.nodeId || task.metadata?.nodeId;
        
        if (!automationRunId) {
            console.log('⚠️ Task has no automation run ID, skipping resume');
            return { success: false, reason: 'No automation run ID' };
        }

        const run = await AutomationRun.findById(automationRunId)
            .populate('lead')
            .populate('automation');
        
        if (!run) {
            console.log(`⚠️ Automation run ${automationRunId} not found`);
            return { success: false, reason: 'Run not found' };
        }

        // Accept waiting_for_task status as well
        if (!['waiting_for_response', 'waiting_for_task', 'running'].includes(run.status)) {
            console.log(`⚠️ Run ${automationRunId} is in ${run.status} state, cannot resume`);
            return { success: false, reason: `Run is ${run.status}` };
        }

        console.log(`📋 Resuming automation ${run._id} from task completion`);
        
        const automation = run.automation;
        const lead = run.lead;

        if (!run.context) run.context = {};
        run.context.taskCompleted = true;
        run.context.taskCompletedAt = new Date();
        run.context.taskResult = task.completionResult || 'completed';
        run.context.taskNotes = task.completionNotes;
        run.context.taskType = task.type;

        updateExecutionPathCompleted(run, nodeId, {
            taskCompleted: true,
            result: task.completionResult,
            completedAt: task.completedAt,
            taskType: task.type
        });

        // Determine handle based on task result
        let nextHandle = 'completed';
        if (task.completionResult === 'success') nextHandle = 'success';
        else if (task.completionResult === 'failed') nextHandle = 'failed';
        else if (task.completionResult === 'rescheduled') nextHandle = 'rescheduled';
        else if (task.completionResult === 'no_answer') nextHandle = 'no_answer';
        
        // Clear all waiting states
        run.status = 'running';
        if (run.waitingForResponse) run.waitingForResponse.isWaiting = false;
        if (run.waitingForCall) run.waitingForCall.isWaiting = false;
        if (run.waitingForTask) run.waitingForTask.isWaiting = false;
        await run.save();

        // Get the scheduleNodeFn from workflow engine if not provided
        if (!scheduleNodeFn) {
            const workflowEngine = require('./workflow.engine');
            scheduleNodeFn = workflowEngine.scheduleNode?.bind(workflowEngine);
        }

        const scheduled = await scheduleNextNodes(run, automation, lead, nodeId, nextHandle, scheduleNodeFn);

        if (scheduled === 0) {
            run.status = 'completed';
            run.completedAt = new Date();
            await run.save();
            console.log(`✅ Automation completed after task completion`);
        }

        return {
            success: true,
            handle: nextHandle,
            nextNodesScheduled: scheduled
        };

    } catch (error) {
        console.error('Error resuming from task completion:', error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Match response to expected handle
 */
function matchResponseToHandle(parsedMessage, expectedResponses) {
    for (const expected of expectedResponses) {
        if (expected.type === 'any') {
            return expected.nextHandle;
        }
        
        if (expected.type === 'button' && parsedMessage.buttonPayload) {
            if (parsedMessage.buttonPayload === expected.value || 
                parsedMessage.buttonText?.toLowerCase() === expected.value?.toLowerCase()) {
                return expected.nextHandle;
            }
        }
        
        if (expected.type === 'text' && parsedMessage.text) {
            const pattern = new RegExp(expected.value, 'i');
            if (pattern.test(parsedMessage.text)) {
                return expected.nextHandle;
            }
        }
    }
    
    return 'default';
}

/**
 * Match call outcome to expected handle
 */
function matchCallOutcomeToHandle(outcome, expectedOutcomes) {
    for (const expected of expectedOutcomes) {
        if (expected.outcome === outcome) {
            return expected.nextHandle;
        }
    }
    
    // Fallback mapping
    const fallbackMap = {
        'interested': 'interested',
        'not_interested': 'not_interested',
        'callback_requested': 'callback',
        'answered': 'answered',
        'no_answer': 'no_answer',
        'voicemail': 'voicemail',
        'busy': 'busy',
        'failed': 'failed'
    };
    
    return fallbackMap[outcome] || 'default';
}

/**
 * Update execution path to completed status
 */
function updateExecutionPathCompleted(run, nodeId, result) {
    const waitingNodeIndex = run.executionPath.findIndex(
        p => p.nodeId === nodeId && (p.status === 'waiting' || p.status === 'running')
    );
    if (waitingNodeIndex >= 0) {
        run.executionPath[waitingNodeIndex].status = 'completed';
        run.executionPath[waitingNodeIndex].completedAt = new Date();
        run.executionPath[waitingNodeIndex].result = result;
    }
}

/**
 * Schedule next nodes after resume
 */
async function scheduleNextNodes(run, automation, lead, currentNodeId, handle, scheduleNodeFn) {
    let nextNodes = automation.getNextNodes(currentNodeId, handle);
    
    if (nextNodes.length === 0) {
        console.log(`   No next nodes found for handle "${handle}", trying default`);
        nextNodes = automation.getNextNodes(currentNodeId);
    }
    
    if (nextNodes.length === 0) {
        // No more nodes - complete the run
        run.status = 'completed';
        run.completedAt = new Date();
        await run.save();
        
        automation.successCount += 1;
        await automation.save();
        
        console.log(`✅ Automation run completed: ${automation.name}`);
        return 0;
    }
    
    for (const { node, edge } of nextNodes) {
        let delay = 0;
        if (node.data?.type === 'delay' || node.data?.type === 'wait') {
            delay = calculateDelay(node.data.config);
        }
        await scheduleNodeFn(run, automation, lead, node, edge, delay);
    }
    
    return nextNodes.length;
}

module.exports = {
    resumeFromResponse,
    resumeFromTimeout,
    resumeFromCallResult,
    resumeFromCallTimeout,
    resumeFromTaskCompletion,
    matchResponseToHandle,
    matchCallOutcomeToHandle,
    updateExecutionPathCompleted,
    scheduleNextNodes
};
