/**
 * Workflow Executors
 * Node type execution handlers for workflow engine
 */

const twilioService = require('../twilio/twilio.service');
const emailService = require('./email.service');
const elevenLabsService = require('./elevenLabs.service');
const Automation = require('../models/Automation');
const { evaluateCondition, interpolateTemplate, calculateDelay, normalizePhoneNumber } = require('./workflow.conditions');

/**
 * Execute WhatsApp action
 */
async function executeWhatsApp(lead, config, context = {}) {
    try {
        console.log(`📱 Executing WhatsApp action for lead ${lead.name}`);
        
        if (!lead.phone) {
            console.warn(`No phone number for lead ${lead.name}`);
            return { success: false, error: 'No phone number' };
        }
        
        const userId = context.userId || lead.assignedTo || lead.assignedAgent;
        const whatsappService = require('./whatsapp.service');
        
        if (config.template) {
            const result = await whatsappService.sendTemplateMessage(
                lead.phone,
                config.template,
                config.languageCode || 'en',
                config.components,
                userId
            );
            
            console.log(`✅ WhatsApp template sent to ${lead.name}: ${result.messageId}`);
            return { success: true, messageId: result.messageId, method: 'meta' };
        } else {
            const message = interpolateTemplate(config?.message || 'Hello {{name}}!', lead);
            const result = await whatsappService.sendTextMessage(
                lead.phone,
                message,
                userId
            );
            
            console.log(`✅ WhatsApp text sent to ${lead.name}: ${result.messageId}`);
            return { success: true, messageId: result.messageId, method: 'meta' };
        }
    } catch (error) {
        console.error('WhatsApp execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute WhatsApp with response waiting
 */
async function executeWhatsAppWithResponse(lead, config, run, automation, job) {
    try {
        console.log(`📱 Executing WhatsApp with response wait for lead ${lead.name}`);
        
        const sendResult = await executeWhatsApp(lead, config, { userId: lead.assignedTo });
        
        if (!sendResult.success) {
            return sendResult;
        }
        
        const timeoutDuration = calculateDelay(config.timeout || { duration: 24, unit: 'hours' });
        const timeoutAt = new Date(Date.now() + timeoutDuration);
        
        const expectedResponses = parseExpectedResponses(config);
        const normalizedPhone = normalizePhoneNumber(lead.phone);
        
        // Update run to waiting state
        run.status = 'waiting_for_response';
        run.waitingForResponse = {
            isWaiting: true,
            nodeId: job.nodeId,
            messageId: sendResult.messageId,
            phoneNumber: normalizedPhone,
            expectedResponses,
            timeoutAt,
            timeoutHandle: config.timeoutHandle || 'timeout',
            startedAt: new Date()
        };
        await run.save();
        
        console.log(`⏸️ Automation paused, waiting for response from ${normalizedPhone}`);
        
        return {
            success: true,
            messageId: sendResult.messageId,
            waiting: true,
            timeoutAt,
            expectedResponses
        };
    } catch (error) {
        console.error('WhatsApp with response execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute wait for response node
 */
async function executeWaitForResponse(lead, config, run, automation, job) {
    try {
        console.log(`⏸️ Setting up wait for response for lead ${lead.name}`);
        
        const timeoutDuration = calculateDelay(config.timeout || { duration: 24, unit: 'hours' });
        const timeoutAt = new Date(Date.now() + timeoutDuration);
        
        const expectedResponses = parseExpectedResponses(config);
        const normalizedPhone = normalizePhoneNumber(lead.phone);
        
        run.status = 'waiting_for_response';
        run.waitingForResponse = {
            isWaiting: true,
            nodeId: job.nodeId,
            messageId: null,
            phoneNumber: normalizedPhone,
            expectedResponses,
            timeoutAt,
            timeoutHandle: config.timeoutHandle || 'timeout',
            startedAt: new Date()
        };
        await run.save();
        
        console.log(`⏸️ Automation paused at wait node, expecting response from ${normalizedPhone}`);
        
        return {
            success: true,
            waiting: true,
            timeoutAt,
            expectedResponses
        };
    } catch (error) {
        console.error('Wait for response execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Parse expected responses from config
 */
function parseExpectedResponses(config) {
    const expectedResponses = (config.expectedResponses || []).map(resp => ({
        type: resp.type || 'any',
        value: resp.value || resp.payload,
        nextHandle: resp.nextHandle || resp.handle || 'default'
    }));
    
    // Extract from buttons if no explicit responses
    if (expectedResponses.length === 0 && config.buttons && Array.isArray(config.buttons)) {
        config.buttons.forEach((btn, idx) => {
            expectedResponses.push({
                type: 'button',
                value: btn.payload || btn.text,
                nextHandle: btn.handle || `option${idx + 1}`
            });
        });
    }
    
    return expectedResponses;
}

/**
 * Execute AI Call action
 */
async function executeAICall(lead, config, run = null) {
    try {
        if (!lead.phone) {
            return { success: false, error: 'Lead has no phone number' };
        }

        let userId = lead.assignedTo || lead.assignedAgent;
        if (!userId && run?.automation) {
            const automation = await Automation.findById(run.automation);
            userId = automation?.createdBy;
        }

        const result = await elevenLabsService.makeCall(lead.phone, {
            script: config?.script,
            voiceId: config?.voiceId,
            leadName: lead.name,
            leadData: lead,
            userId: userId,
            metadata: {
                automationRunId: run?._id?.toString(),
                leadId: lead._id?.toString(),
                automationId: run?.automation?.toString(),
                nodeId: run?.currentNodeId
            }
        });

        if (run && result?.callId) {
            if (!run.context) run.context = {};
            run.context.lastCallId = result.callId;
            run.context.lastCallStatus = result.status;
            await run.save();
        }

        return {
            success: true,
            callId: result?.callId,
            status: result?.status,
            automationRunId: run?._id
        };
    } catch (error) {
        console.error('AI Call execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute AI Call with response waiting
 */
async function executeAICallWithResponse(lead, config, run) {
    try {
        if (!lead.phone) {
            return { success: false, error: 'Lead has no phone number' };
        }

        console.log(`📞 Executing AI call with response for lead ${lead.name}`);
        
        let userId = lead.assignedTo || lead.assignedAgent;
        if (!userId && run?.automation) {
            const automation = await Automation.findById(run.automation);
            userId = automation?.createdBy;
        }
        
        const result = await elevenLabsService.makeCall(lead.phone, {
            script: config?.script,
            voiceId: config?.voiceId,
            leadName: lead.name,
            leadData: lead,
            userId: userId,
            metadata: {
                automationRunId: run._id.toString(),
                leadId: lead._id.toString(),
                automationId: run.automation.toString(),
                nodeId: run.currentNodeId
            }
        });
        
        if (!result?.success && !result?.callId) {
            return { success: false, error: result?.error || 'Failed to initiate call' };
        }

        const timeoutMinutes = config?.timeout || 10;
        const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
        const expectedOutcomes = buildExpectedOutcomes(config);

        run.status = 'waiting_for_response';
        run.waitingForCall = {
            isWaiting: true,
            nodeId: run.currentNodeId,
            callId: result.callId,
            conversationId: result.conversationId,
            phoneNumber: lead.phone,
            expectedOutcomes: expectedOutcomes,
            timeoutAt: timeoutAt,
            timeoutHandle: config?.timeoutHandle || 'timeout',
            startedAt: new Date()
        };
        
        const currentPathIndex = run.executionPath.findIndex(
            p => p.nodeId === run.currentNodeId && p.status === 'running'
        );
        if (currentPathIndex >= 0) {
            run.executionPath[currentPathIndex].status = 'waiting';
            run.executionPath[currentPathIndex].result = {
                callInitiated: true,
                callId: result.callId,
                conversationId: result.conversationId,
                waitingForResult: true
            };
        }
        
        if (!run.context) run.context = {};
        run.context.lastCallId = result.callId;
        run.context.lastCallConversationId = result.conversationId;
        run.context.lastCallStatus = 'initiated';
        
        await run.save();
        
        console.log(`📞 Call initiated, waiting for result. CallID: ${result.callId}`);
        
        return {
            success: true,
            waiting: true,
            callId: result.callId,
            conversationId: result.conversationId,
            timeoutAt: timeoutAt
        };
        
    } catch (error) {
        console.error('AI Call with response error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Build expected outcomes from config
 */
function buildExpectedOutcomes(config) {
    const expectedOutcomes = [];
    
    if (config?.onInterested) expectedOutcomes.push({ outcome: 'interested', nextHandle: 'interested' });
    if (config?.onNotInterested) expectedOutcomes.push({ outcome: 'not_interested', nextHandle: 'not_interested' });
    if (config?.onCallbackRequested) expectedOutcomes.push({ outcome: 'callback_requested', nextHandle: 'callback' });
    if (config?.onAnswered) expectedOutcomes.push({ outcome: 'answered', nextHandle: 'answered' });
    if (config?.onNoAnswer) expectedOutcomes.push({ outcome: 'no_answer', nextHandle: 'no_answer' });
    if (config?.onVoicemail) expectedOutcomes.push({ outcome: 'voicemail', nextHandle: 'voicemail' });
    if (config?.onBusy) expectedOutcomes.push({ outcome: 'busy', nextHandle: 'busy' });
    if (config?.onFailed) expectedOutcomes.push({ outcome: 'failed', nextHandle: 'failed' });
    
    return expectedOutcomes;
}

/**
 * Execute Human Call action (creates a task for agent)
 */
async function executeHumanCall(lead, config, run = null) {
    try {
        const Activity = require('../models/Activity');
        
        const activity = new Activity({
            lead: lead._id,
            type: 'call_scheduled',
            title: `Call lead: ${lead.name}`,
            description: config?.notes || 'Automated call task from workflow',
            assignedTo: lead.assignedAgent || lead.assignedTo,
            dueDate: new Date(),
            priority: config?.priority || 'high',
            status: 'pending',
            metadata: {
                automationRunId: run?._id?.toString(),
                automationTriggered: true,
                nodeId: run?.currentNodeId
            }
        });
        await activity.save();

        if (run) {
            if (!run.context) run.context = {};
            run.context.lastTaskId = activity._id;
            run.context.lastTaskType = 'human_call';
            await run.save();
        }

        return {
            success: true,
            activityId: activity._id,
            message: 'Call task created for agent',
            automationRunId: run?._id
        };
    } catch (error) {
        console.error('Human Call execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute Email action
 */
async function executeEmail(lead, config) {
    try {
        if (!lead.email) {
            return { success: false, error: 'Lead has no email address' };
        }

        const subject = interpolateTemplate(config?.subject || 'Hello from JK Construction', lead);
        const body = interpolateTemplate(config?.body || 'Hi {{name}}, thank you for your interest!', lead);

        await emailService.sendEmail({
            to: lead.email,
            subject,
            html: body
        });

        return {
            success: true,
            to: lead.email,
            subject
        };
    } catch (error) {
        console.error('Email execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute a node based on its type
 */
async function executeNode(nodeData, lead, run, automation, job) {
    const type = nodeData?.type;
    const config = nodeData?.config;
    
    switch (type) {
        case 'whatsapp':
            return await executeWhatsApp(lead, config, run);
        case 'whatsappWithResponse':
            return await executeWhatsAppWithResponse(lead, config, run, automation, job);
        case 'waitForResponse':
            return await executeWaitForResponse(lead, config, run, automation, job);
        case 'aiCall':
            return await executeAICall(lead, config, run);
        case 'aiCallWithResponse':
            return await executeAICallWithResponse(lead, config, run);
        case 'humanCall':
            return await executeHumanCall(lead, config, run);
        case 'email':
            return await executeEmail(lead, config);
        case 'condition':
        case 'conditionTimeout':
            return await evaluateCondition(lead, config);
        case 'delay':
        case 'wait':
            return { delayed: true };
        default:
            return { skipped: true, reason: `Unknown node type: ${type}` };
    }
}

/**
 * Check if node type waits for response
 */
function isWaitingNodeType(type) {
    return ['whatsappWithResponse', 'waitForResponse', 'aiCallWithResponse'].includes(type);
}

/**
 * Check if node type is a condition
 */
function isConditionNodeType(type) {
    return ['condition', 'conditionTimeout'].includes(type);
}

module.exports = {
    executeWhatsApp,
    executeWhatsAppWithResponse,
    executeWaitForResponse,
    executeAICall,
    executeAICallWithResponse,
    executeHumanCall,
    executeEmail,
    executeNode,
    isWaitingNodeType,
    isConditionNodeType,
    parseExpectedResponses,
    buildExpectedOutcomes
};
