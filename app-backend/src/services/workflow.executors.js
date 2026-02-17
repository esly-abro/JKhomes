/**
 * Workflow Executors
 * Node type execution handlers for workflow engine
 * 
 * Supported node types:
 * - whatsapp, whatsappWithResponse, waitForResponse
 * - aiCall, aiCallWithResponse
 * - humanCall (creates task for agent)
 * - email
 * - updateStatus, assignAgent, createTask
 * - condition, conditionTimeout
 * - delay, wait
 * - analytics
 */

const twilioService = require('../twilio/twilio.service');
const emailService = require('./email.service');
const elevenLabsService = require('./elevenLabs.service');
const Automation = require('../models/Automation');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { taskService } = require('../tasks');
const TenantConfig = require('../models/tenantConfig.model');
const { evaluateCondition, interpolateTemplate, calculateDelay, normalizePhoneNumber } = require('./workflow.conditions');

/**
 * Build tenant variables object for template interpolation.
 * Loads TenantConfig and optionally the assigned agent's info.
 */
async function buildTenantVars(lead) {
    const tenantConfig = await TenantConfig.getOrCreate(lead.organizationId);
    const vars = {
        organizationName: tenantConfig?.companyName || process.env.COMPANY_NAME || 'Our Team',
        companyName: tenantConfig?.companyName || process.env.COMPANY_NAME || 'Our Team',
        appointmentLabel: tenantConfig?.appointmentFieldLabel || 'appointment',
        appointmentFieldLabel: tenantConfig?.appointmentFieldLabel || 'appointment',
        catalogLabel: tenantConfig?.catalogModuleLabel || 'catalog',
        catalogModuleLabel: tenantConfig?.catalogModuleLabel || 'catalog',
        locationLabel: tenantConfig?.locationFieldLabel || 'location',
        locationFieldLabel: tenantConfig?.locationFieldLabel || 'location',
        categoryLabel: tenantConfig?.categoryFieldLabel || 'category',
        categoryFieldLabel: tenantConfig?.categoryFieldLabel || 'category'
    };
    // Load assigned agent info if available
    const agentId = lead.assignedTo || lead.assignedAgent;
    if (agentId) {
        try {
            const agent = await User.findById(agentId).select('name phone email');
            if (agent) {
                vars.agentName = agent.name || '';
                vars.agentPhone = agent.phone || '';
                vars.agentEmail = agent.email || '';
            }
        } catch (e) { /* ignore */ }
    }
    return vars;
}

/**
 * Execute WhatsApp action
 * Gracefully handles missing credentials
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
        
        // Check if WhatsApp is configured before attempting to send
        const credCheck = await whatsappService.checkCredentialsConfigured(userId);
        if (!credCheck.configured) {
            console.warn(`⚠️ WhatsApp not configured: ${credCheck.message}`);
            return { 
                success: false, 
                error: credCheck.message,
                needsSetup: true,
                skipped: true
            };
        }
        
        if (config.template) {
            const result = await whatsappService.sendTemplateMessage(
                lead.phone,
                config.template,
                config.languageCode || 'en',
                config.components,
                userId
            );
            
            console.log(`✅ WhatsApp template sent to ${lead.name}: ${result.messageId}`);
            try {
                await Activity.create({
                    leadId: lead._id?.toString(),
                    organizationId: lead.organizationId,
                    type: 'whatsapp',
                    title: `WhatsApp Template Sent`,
                    description: `Template "${config.template}" sent to ${lead.name}`,
                    userName: 'Automation',
                    metadata: { messageId: result.messageId, template: config.template, automated: true }
                });
            } catch (e) { /* ignore */ }
            return { success: true, messageId: result.messageId, method: 'meta' };
        } else {
            const tenantVars = await buildTenantVars(lead);
            const message = interpolateTemplate(config?.message || 'Hello {{name}}!', lead, context, tenantVars);
            const result = await whatsappService.sendTextMessage(
                lead.phone,
                message,
                userId
            );
            
            console.log(`✅ WhatsApp text sent to ${lead.name}: ${result.messageId}`);
            try {
                await Activity.create({
                    leadId: lead._id?.toString(),
                    organizationId: lead.organizationId,
                    type: 'whatsapp',
                    title: `WhatsApp Message Sent`,
                    description: `Text message sent to ${lead.name}`,
                    userName: 'Automation',
                    metadata: { messageId: result.messageId, automated: true }
                });
            } catch (e) { /* ignore */ }
            return { success: true, messageId: result.messageId, method: 'meta' };
        }
    } catch (error) {
        console.error('WhatsApp execution error:', error);
        // Check if it's a credentials error
        if (error.message?.includes('credentials') || error.message?.includes('not configured')) {
            return { success: false, error: error.message, needsSetup: true, skipped: true };
        }
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
    console.log(`📞 AI Call: lead=${lead.name} phone=${lead.phone}`);
    try {
        if (!lead.phone) {
            console.log(`⚠️ AI Call: No phone for ${lead.name}`);
            return { success: false, error: 'Lead has no phone number', status: 'skipped' };
        }

        let userId = lead.assignedTo || lead.assignedAgent;
        if (!userId && run?.automation) {
            const automation = await Automation.findById(run.automation);
            userId = automation?.createdBy;
        }
        
        console.log(`📞 Calling ElevenLabs for ${lead.name}...`);
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

        // Handle skipped/simulated calls — these are NOT successful completions
        if (result?.status === 'skipped' || result?.status === 'simulated') {
            console.log(`⚠️ AI Call ${result.status}: ${lead.name} — ${result.error || result.message}`);
            if (run) {
                if (!run.context) run.context = {};
                run.context.lastCallStatus = result.status;
                run.context.lastCallError = result.error || result.message;
                await run.save();
            }
            // Log activity so it shows in the lead timeline
            try {
                await Activity.create({
                    leadId: lead._id?.toString(),
                    organizationId: lead.organizationId,
                    type: 'call',
                    title: `AI Call ${result.status}`,
                    description: `AI Call ${result.status}: ${result.error || result.message}`,
                    userName: 'Automation',
                    metadata: { status: result.status, reason: result.error, automated: true }
                });
            } catch (e) { /* ignore activity log errors */ }
            return {
                success: false,
                error: result.error || result.message,
                status: result.status,
                automationRunId: run?._id
            };
        }

        if (run && result?.callId) {
            if (!run.context) run.context = {};
            run.context.lastCallId = result.callId;
            run.context.lastCallStatus = result.status;
            await run.save();
        }
        
        // Log activity for the actual call
        try {
            await Activity.create({
                leadId: lead._id?.toString(),
                organizationId: lead.organizationId,
                type: 'call',
                title: 'AI Call Initiated',
                description: `IVR Call Attempted to ${lead.name || 'lead'}`,
                userName: 'Automation',
                metadata: { callId: result?.callId, status: result?.status, automated: true }
            });
        } catch (e) { /* ignore activity log errors */ }
        
        console.log(`✅ AI Call initiated: callId=${result?.callId} status=${result?.status}`);
        return {
            success: true,
            callId: result?.callId,
            status: result?.status,
            automationRunId: run?._id
        };
    } catch (error) {
        console.error('❌ AI Call error:', error.message);
        return { success: false, error: error.message, status: 'error' };
    }
}

/**
 * Execute AI Call with response waiting
 */
async function executeAICallWithResponse(lead, config, run) {
    try {
        if (!lead.phone) {
            return { success: false, error: 'Lead has no phone number', status: 'skipped' };
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

        // Handle skipped/simulated calls — don't proceed to waiting state
        if (result?.status === 'skipped' || result?.status === 'simulated') {
            console.log(`⚠️ AI Call ${result.status}: ${lead.name} — ${result.error || result.message}`);
            return { success: false, error: result.error || result.message, status: result.status };
        }
        
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
 * Execute Human Call action (creates a task for agent + sends notification)
 * Uses the new Task system with automation sync
 * Auto-configured: uses lead's assigned agent, attaches all lead details
 */
async function executeHumanCall(lead, config, run = null) {
    try {
        console.log(`📞 Human Call: Creating task for lead ${lead.name}`);
        
        // Determine task type from config
        const taskType = config?.taskType || 'call_lead';
        const priority = config?.priority || 'high';
        
        // Calculate due date
        let dueDate = new Date();
        if (config?.dueIn) {
            const dueMs = calculateDelay(config.dueIn);
            dueDate = new Date(Date.now() + dueMs);
        } else {
            // Default: due in 1 hour for high priority calls
            dueDate = new Date(Date.now() + 60 * 60 * 1000);
        }

        // Get the assigned agent
        const assignedAgentId = lead.assignedTo || lead.assignedAgent;
        let assignedAgent = null;
        if (assignedAgentId) {
            assignedAgent = await User.findById(assignedAgentId).select('name email phone');
        }

        // Create task using task service with full lead context
        const task = await taskService.createTask({
            leadId: lead._id,
            automationRunId: run?._id,
            automationId: run?.automation,
            nodeId: run?.currentNodeId,
            assignedTo: assignedAgentId,
            type: taskType,
            title: config?.title || `Call lead: ${lead.name}`,
            description: config?.notes || config?.description || `Please call this lead. Phone: ${lead.phone || 'N/A'}`,
            priority,
            dueDate,
            context: {
                leadPhone: lead.phone,
                leadName: lead.name,
                leadEmail: lead.email,
                leadBudget: lead.budget,
                leadSource: lead.source,
                leadStatus: lead.status,
                leadCategory: lead.category || lead.propertyType,
                leadPropertyType: lead.category || lead.propertyType,  // backward compat
                leadLocation: lead.location,
                automationName: run?.automationName
            }
        });

        console.log(`✅ Task created: ${task._id} for agent ${assignedAgent?.name || 'unassigned'}`);

        // Log activity
        try {
            await Activity.create({
                leadId: lead._id?.toString(),
                organizationId: lead.organizationId,
                type: 'task_created',
                title: `Call Task Created`,
                description: `Call task assigned to ${assignedAgent?.name || 'unassigned agent'} — ${config?.title || 'Call lead'}`,
                userName: 'Automation',
                metadata: { taskId: task._id?.toString(), assignedTo: assignedAgent?.name, automated: true }
            });
        } catch (e) { /* ignore */ }

        // Load tenant config for dynamic field labels
        const tenantConfig = await TenantConfig.getOrCreate(lead.organizationId);
        const locationLabel = tenantConfig?.locationFieldLabel || 'Location';
        const categoryLabel = tenantConfig?.categoryFieldLabel || 'Category';

        // Send notification email to the assigned agent using org SMTP
        if (assignedAgent?.email) {
            try {
                await emailService.sendTaskAssignmentEmail(
                    assignedAgent.email,
                    assignedAgent.name || 'Agent',
                    { title: task.title, type: taskType, priority, dueDate, description: config?.notes || config?.description },
                    { name: lead.name, phone: lead.phone, email: lead.email, status: lead.status },
                    'Automation',
                    lead.organizationId
                );
                console.log(`📧 Task email sent to agent ${assignedAgent.name} (${assignedAgent.email})`);
            } catch (emailErr) {
                // Don't fail the task creation if email fails
                console.warn(`⚠️ Failed to send task email to agent: ${emailErr.message}`);
            }
        } else {
            console.warn(`⚠️ No email found for assigned agent - notification not sent`);
        }

        // Log activity on the lead
        try {
            await Activity.create({
                leadId: lead._id?.toString(),
                organizationId: lead.organizationId,
                type: 'task_created',
                title: `Task Created: ${taskType}`,
                description: `Call task created and assigned to ${assignedAgent?.name || 'unassigned agent'}`,
                userName: 'Automation',
                metadata: {
                    taskId: task._id,
                    taskType,
                    priority,
                    assignedTo: assignedAgent?.name,
                    automationRunId: run?._id,
                    automated: true
                }
            });
        } catch (actErr) {
            console.warn('Failed to create activity log:', actErr.message);
        }

        // Update run context
        if (run) {
            if (!run.context) run.context = {};
            run.context.lastTaskId = task._id;
            run.context.lastTaskType = taskType;
            run.context.notifiedAgent = assignedAgent?.name || null;
            
            // Pause automation until task is completed
            run.status = 'waiting_for_task';
            run.waitingForTask = {
                isWaiting: true,
                taskId: task._id,
                nodeId: run.currentNodeId,
                startedAt: new Date()
            };
            await run.save();
        }

        return {
            success: true,
            taskId: task._id,
            waiting: true,
            notifiedAgent: assignedAgent?.name || null,
            message: `Task created${assignedAgent ? ` and ${assignedAgent.name} notified` : ' (no agent assigned)'}`
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

        const tenantVars = await buildTenantVars(lead);
        const subject = interpolateTemplate(config?.subject || 'Hello from {{organizationName}}', lead, {}, tenantVars);
        const body = interpolateTemplate(config?.body || 'Hi {{name}}, thank you for your interest!', lead, {}, tenantVars);

        await emailService.sendEmail({
            to: lead.email,
            subject,
            html: body
        });

        try {
            await Activity.create({
                leadId: lead._id?.toString(),
                organizationId: lead.organizationId,
                type: 'email',
                title: `Email Sent`,
                description: `Email "${subject}" sent to ${lead.email}`,
                userName: 'Automation',
                metadata: { to: lead.email, subject, automated: true }
            });
        } catch (e) { /* ignore */ }

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
 * Execute Update Status action
 * Updates lead status in database and triggers auto-complete for related tasks
 */
async function executeUpdateStatus(lead, config, run = null) {
    try {
        const newStatus = config?.status || config?.value;
        if (!newStatus) {
            return { success: false, error: 'No status specified' };
        }

        const oldStatus = lead.status;
        lead.status = newStatus;
        lead.statusUpdatedAt = new Date();
        
        // Add to status history if exists
        if (lead.statusHistory) {
            lead.statusHistory.push({
                status: newStatus,
                changedAt: new Date(),
                changedBy: 'automation',
                automationRunId: run?._id
            });
        }
        
        await lead.save();

        console.log(`📊 Lead status updated: ${oldStatus} → ${newStatus}`);

        // Log activity
        await new Activity({
            leadId: lead._id?.toString(),
            organizationId: lead.organizationId,
            type: 'status_change',
            title: `Status changed to ${newStatus}`,
            description: `Automation updated status from ${oldStatus} to ${newStatus}`,
            userName: 'Automation',
            metadata: {
                oldStatus,
                newStatus,
                automationRunId: run?._id?.toString(),
                automated: true
            }
        }).save();

        // Check for task auto-completion based on status change
        await taskService.checkAutoCompleteForStatusChange(lead._id, newStatus);

        return {
            success: true,
            oldStatus,
            newStatus
        };
    } catch (error) {
        console.error('Update Status execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute Assign Agent action
 * Assigns lead to a specific agent or uses round-robin
 */
async function executeAssignAgent(lead, config, run = null) {
    try {
        let assigneeId = config?.agentId;

        // Round-robin assignment if no specific agent
        if (!assigneeId && config?.roundRobin) {
            const agents = await User.find({ 
                role: { $in: ['agent', 'manager'] },
                isActive: true,
                approvalStatus: 'approved'
            }).select('_id name');

            if (agents.length > 0) {
                // Simple round-robin based on lead count
                const leadCounts = await Lead.aggregate([
                    { $match: { assignedTo: { $in: agents.map(a => a._id) } } },
                    { $group: { _id: '$assignedTo', count: { $sum: 1 } } }
                ]);

                const countMap = new Map(leadCounts.map(lc => [lc._id.toString(), lc.count]));
                
                // Find agent with least leads
                let minCount = Infinity;
                let selectedAgent = agents[0];
                
                for (const agent of agents) {
                    const count = countMap.get(agent._id.toString()) || 0;
                    if (count < minCount) {
                        minCount = count;
                        selectedAgent = agent;
                    }
                }
                
                assigneeId = selectedAgent._id;
                console.log(`🔄 Round-robin assigned to ${selectedAgent.name}`);
            }
        }

        if (!assigneeId) {
            return { success: false, error: 'No agent to assign' };
        }

        const oldAssignee = lead.assignedTo;
        lead.assignedTo = assigneeId;
        lead.assignedAt = new Date();
        await lead.save();

        // Get agent name for logging
        const agent = await User.findById(assigneeId).select('name email');

        console.log(`👤 Lead assigned to ${agent?.name || assigneeId}`);

        // Send email to assigned agent (non-blocking)
        if (agent?.email) {
            emailService.sendLeadAssignmentEmail(
                agent.email,
                agent.name || agent.email,
                [{ name: lead.name, phone: lead.phone, status: lead.status, source: lead.source }],
                'Automation',
                lead.organizationId
            ).catch(err => console.warn('Auto-assign email failed:', err.message));
        }

        // Log activity
        await new Activity({
            leadId: lead._id?.toString(),
            organizationId: lead.organizationId,
            type: 'assignment',
            title: `Assigned to ${agent?.name || 'agent'}`,
            description: config?.reason || 'Automation assigned lead',
            userName: 'Automation',
            metadata: {
                oldAssignee: oldAssignee?.toString(),
                newAssignee: assigneeId.toString(),
                automationRunId: run?._id?.toString(),
                automated: true
            }
        }).save();

        return {
            success: true,
            assignedTo: assigneeId,
            agentName: agent?.name
        };
    } catch (error) {
        console.error('Assign Agent execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute Create Task action
 * Creates a manual task for agent and pauses automation until complete
 */
async function executeCreateTask(lead, config, run = null) {
    try {
        const task = await taskService.createTask({
            leadId: lead._id,
            automationRunId: run?._id,
            automationId: run?.automation,
            nodeId: run?.currentNodeId,
            assignedTo: config?.assignedTo || lead.assignedTo || lead.assignedAgent,
            type: config?.taskType || 'manual_action',
            title: config?.title || 'Task from automation',
            description: config?.description,
            priority: config?.priority || 'medium',
            dueDate: config?.dueDate ? new Date(config.dueDate) : undefined,
            context: {
                leadName: lead.name,
                leadPhone: lead.phone,
                automationName: run?.automationName
            }
        });

        // Pause automation if configured to wait
        if (config?.waitForCompletion !== false && run) {
            run.status = 'waiting_for_task';
            run.waitingForTask = {
                isWaiting: true,
                taskId: task._id,
                nodeId: run.currentNodeId,
                startedAt: new Date()
            };
            await run.save();
            
            return {
                success: true,
                taskId: task._id,
                waiting: true
            };
        }

        return {
            success: true,
            taskId: task._id,
            waiting: false
        };
    } catch (error) {
        console.error('Create Task execution error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Execute Analytics action
 * Logs metrics and performance data
 */
async function executeAnalytics(lead, config, run = null) {
    try {
        const eventType = config?.eventType || config?.type || 'automation_event';
        const eventData = config?.data || {};

        // Log activity for analytics
        await new Activity({
            leadId: lead._id?.toString(),
            organizationId: lead.organizationId,
            type: 'analytics',
            title: config?.title || `Analytics: ${eventType}`,
            description: config?.description || `Analytics event: ${eventType}`,
            userName: 'Automation',
            metadata: {
                eventType,
                eventData,
                automationRunId: run?._id?.toString(),
                automationId: run?.automation?.toString(),
                nodeId: run?.currentNodeId,
                timestamp: new Date(),
                leadStatus: lead.status,
                leadSource: lead.source,
                automated: true
            }
        }).save();

        console.log(`📈 Analytics logged: ${eventType}`);

        return {
            success: true,
            eventType,
            logged: true
        };
    } catch (error) {
        console.error('Analytics execution error:', error);
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
        case 'updateStatus':
            return await executeUpdateStatus(lead, config, run);
        case 'assignAgent':
            return await executeAssignAgent(lead, config, run);
        case 'createTask':
            return await executeCreateTask(lead, config, run);
        case 'analytics':
            return await executeAnalytics(lead, config, run);
        case 'condition':
        case 'conditionTimeout':
            return await evaluateCondition(lead, config);
        case 'delay':
        case 'wait':
            return { delayed: true };
        default:
            console.warn(`⚠️ Unknown node type: ${type}`);
            return { skipped: true, reason: `Unknown node type: ${type}` };
    }
}

/**
 * Check if node type waits for response or task
 */
function isWaitingNodeType(type) {
    return ['whatsappWithResponse', 'waitForResponse', 'aiCallWithResponse', 'humanCall', 'createTask'].includes(type);
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
    executeUpdateStatus,
    executeAssignAgent,
    executeCreateTask,
    executeAnalytics,
    executeNode,
    isWaitingNodeType,
    isConditionNodeType,
    parseExpectedResponses,
    buildExpectedOutcomes
};
