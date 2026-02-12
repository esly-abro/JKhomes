/**
 * Post-Call Orchestrator Service
 * Central service that handles all post-call automation based on conversation analysis
 * 
 * Migrated from zoho-lead-backend for single backend architecture
 * 
 * Flow:
 * ElevenLabs Call Ends → Webhook → Orchestrator → [Analyze → Act → Update CRM → Notify]
 */

const Lead = require('../models/Lead');
const zohoClient = require('../clients/zoho.client');
const dataLayer = require('../leads/lead.dataLayer');

// Lead status mappings for CRM
const LEAD_STATUS = {
    NEW: 'New',
    CALL_ATTENDED: 'Call Attended',
    NO_RESPONSE: 'No Response',
    NOT_INTERESTED: 'Not Interested',
    APPOINTMENT_BOOKED: 'Appointment Booked',
    APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
    // Backward compat aliases
    SITE_VISIT_BOOKED: 'Appointment Booked',
    SITE_VISIT_SCHEDULED: 'Appointment Scheduled',
    INTERESTED: 'Interested'
};

// Action types that can be executed
const ACTION_TYPES = {
    SEND_WHATSAPP_DETAILS: 'send_whatsapp_details',
    SEND_BOOKING_LINK: 'send_booking_link',
    SCHEDULE_CALLBACK: 'schedule_callback',
    SEND_APPOINTMENT_CONFIRMATION: 'send_appointment_confirmation',
    SEND_SITE_VISIT_CONFIRMATION: 'send_appointment_confirmation', // backward compat alias
    UPDATE_CRM_STATUS: 'update_crm_status',
    SEND_FOLLOW_UP: 'send_follow_up',
    FLAG_FOR_REVIEW: 'flag_for_review'
};

// Intent types (from intent analyzer)
const INTENT_TYPES = {
    SEND_WHATSAPP: 'send_whatsapp',
    BOOK_APPOINTMENT: 'book_appointment',
    BOOK_SITE_VISIT: 'book_appointment', // backward compat alias
    REQUEST_CALLBACK: 'request_callback',
    INTERESTED: 'interested',
    NOT_INTERESTED: 'not_interested',
    NEED_MORE_INFO: 'need_more_info',
    PRICE_INQUIRY: 'price_inquiry',
    LOCATION_INQUIRY: 'location_inquiry',
    SCHEDULE_LATER: 'schedule_later',
    URGENT: 'urgent'
};

class PostCallOrchestrator {
    /**
     * Main entry point - Process post-call webhook data
     * 
     * @param {Object} webhookData - ElevenLabs post-call webhook payload
     * @returns {Promise<Object>} Processing result with actions taken
     */
    static async processPostCallWebhook(webhookData) {
        const startTime = Date.now();
        const result = {
            success: false,
            conversationId: null,
            leadId: null,
            actionsExecuted: [],
            errors: [],
            processingTimeMs: 0
        };

        try {
            const { type, data, event_timestamp } = webhookData;

            console.log('🎯 Processing post-call webhook', {
                type,
                conversationId: data?.conversation_id,
                eventTimestamp: event_timestamp
            });

            // Handle call initiation failure
            if (type === 'call_initiation_failure') {
                return await this.handleCallInitiationFailure(data);
            }

            // Audio webhook - just acknowledge
            if (type === 'post_call_audio') {
                console.log('🎵 Received post-call audio webhook', {
                    conversationId: data?.conversation_id
                });
                return { success: true, type: 'audio_received', actionsExecuted: [] };
            }

            // Main flow: post_call_transcription
            if (type !== 'post_call_transcription') {
                console.warn('Unknown webhook type:', type);
                return { success: false, error: 'Unknown webhook type' };
            }

            result.conversationId = data.conversation_id;

            // Extract lead information
            const leadInfo = this.extractLeadInfo(data);
            result.leadId = leadInfo.leadId;

            if (!leadInfo.leadId && !leadInfo.phoneNumber) {
                console.warn('No lead identifier in webhook data');
                result.errors.push('No lead identifier found');
            }

            // Analyze conversation using ElevenLabs analysis data
            const analysis = this.analyzeConversation(data);
            result.analysis = {
                intents: analysis.intents.map(i => i.type),
                qualification: analysis.leadQualification,
                confidence: analysis.overallConfidence
            };

            // Determine actions
            const actions = this.determineActions(analysis, leadInfo);
            result.plannedActions = actions.map(a => a.type);

            // Execute actions
            for (const action of actions) {
                try {
                    const actionResult = await this.executeAction(action, analysis, leadInfo, data);
                    result.actionsExecuted.push({
                        type: action.type,
                        success: actionResult.success,
                        details: actionResult.details
                    });
                } catch (actionError) {
                    console.error('Action execution failed:', action.type, actionError.message);
                    result.errors.push(`${action.type}: ${actionError.message}`);
                }
            }

            // Update CRM
            await this.updateCRM(leadInfo, analysis, data, result.actionsExecuted);

            result.success = result.errors.length === 0;
            result.processingTimeMs = Date.now() - startTime;

            console.log('✅ Post-call processing completed', {
                conversationId: result.conversationId,
                actionsExecuted: result.actionsExecuted.length,
                processingTimeMs: result.processingTimeMs
            });

            return result;

        } catch (error) {
            console.error('Post-call orchestration failed:', error);
            result.errors.push(error.message);
            result.processingTimeMs = Date.now() - startTime;
            return result;
        }
    }

    /**
     * Extract lead information from webhook data
     */
    static extractLeadInfo(data) {
        const dynamicVars = data.conversation_initiation_client_data?.dynamic_variables || {};
        const metadata = data.metadata || {};

        return {
            leadId: dynamicVars.lead_id || metadata.leadId || null,
            leadName: dynamicVars.lead_name || metadata.leadName || 'Customer',
            phoneNumber: dynamicVars.phone_number || metadata.phoneNumber || null,
            automationRunId: dynamicVars.automation_run_id || metadata.automationRunId || null,
            automationId: dynamicVars.automation_id || metadata.automationId || null,
            nodeId: dynamicVars.node_id || metadata.nodeId || null
        };
    }

    /**
     * Analyze conversation using ElevenLabs analysis data
     * Falls back to keyword matching if AI analysis unavailable
     */
    static analyzeConversation(data) {
        const analysis = {
            intents: [],
            entities: {},
            leadQualification: 'unknown',
            sentiment: 'neutral',
            overallConfidence: 0.5,
            summary: '',
            source: 'elevenlabs'
        };

        // Extract from ElevenLabs evaluation criteria
        const criteria = data.analysis?.evaluation_criteria_results || {};
        
        if (criteria['user_interested'] === 'success' || criteria['interested'] === true) {
            analysis.intents.push({
                type: INTENT_TYPES.INTERESTED,
                confidence: 0.95,
                evidence: 'ElevenLabs evaluation: interested'
            });
            analysis.leadQualification = 'warm';
        }

        if (criteria['site_visit_requested'] === 'success' || criteria['book_site_visit'] === true || criteria['book_appointment'] === true) {
            analysis.intents.push({
                type: INTENT_TYPES.BOOK_APPOINTMENT,
                confidence: 0.95,
                evidence: 'ElevenLabs evaluation: appointment/site visit requested'
            });
            analysis.leadQualification = 'hot';
        }

        if (criteria['whatsapp_requested'] === 'success' || criteria['send_details_requested'] === 'success') {
            analysis.intents.push({
                type: INTENT_TYPES.SEND_WHATSAPP,
                confidence: 0.95,
                evidence: 'ElevenLabs evaluation: WhatsApp requested'
            });
        }

        if (criteria['callback_requested'] === 'success') {
            analysis.intents.push({
                type: INTENT_TYPES.REQUEST_CALLBACK,
                confidence: 0.95,
                evidence: 'ElevenLabs evaluation: callback requested'
            });
        }

        if (criteria['not_interested'] === 'success') {
            analysis.intents.push({
                type: INTENT_TYPES.NOT_INTERESTED,
                confidence: 0.95,
                evidence: 'ElevenLabs evaluation: not interested'
            });
            analysis.leadQualification = 'cold';
        }

        // Get summary from ElevenLabs
        if (data.analysis?.transcript_summary) {
            analysis.summary = data.analysis.transcript_summary;
        }

        // Calculate overall confidence
        if (analysis.intents.length > 0) {
            analysis.overallConfidence = analysis.intents.reduce((sum, i) => sum + i.confidence, 0) / analysis.intents.length;
        }

        return analysis;
    }

    /**
     * Determine actions to take based on analysis
     */
    static determineActions(analysis, leadInfo) {
        const actions = [];
        const intentTypes = analysis.intents.map(i => i.type);

        // WhatsApp requested
        if (intentTypes.includes(INTENT_TYPES.SEND_WHATSAPP)) {
            actions.push({
                type: ACTION_TYPES.SEND_WHATSAPP_DETAILS,
                priority: 1
            });
        }

        // Appointment/site visit requested
        if (intentTypes.includes(INTENT_TYPES.BOOK_APPOINTMENT)) {
            actions.push({
                type: ACTION_TYPES.SEND_BOOKING_LINK,
                priority: 1
            });
        }

        // Callback requested
        if (intentTypes.includes(INTENT_TYPES.REQUEST_CALLBACK)) {
            actions.push({
                type: ACTION_TYPES.SCHEDULE_CALLBACK,
                priority: 2
            });
        }

        // Always update CRM
        actions.push({
            type: ACTION_TYPES.UPDATE_CRM_STATUS,
            priority: 3
        });

        // Sort by priority
        return actions.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Execute a single action
     */
    static async executeAction(action, analysis, leadInfo, webhookData) {
        switch (action.type) {
            case ACTION_TYPES.SEND_WHATSAPP_DETAILS:
                return await this.sendWhatsAppDetails(leadInfo, analysis);

            case ACTION_TYPES.SEND_BOOKING_LINK:
                return await this.sendBookingLink(leadInfo, analysis);

            case ACTION_TYPES.SCHEDULE_CALLBACK:
                return await this.scheduleCallback(leadInfo, analysis);

            case ACTION_TYPES.UPDATE_CRM_STATUS:
                // Handled separately in updateCRM
                return { success: true, details: 'CRM update queued' };

            default:
                return { success: false, details: `Unknown action type: ${action.type}` };
        }
    }

    /**
     * Send property details via WhatsApp
     */
    static async sendWhatsAppDetails(leadInfo, analysis) {
        try {
            if (!leadInfo.phoneNumber) {
                return { success: false, details: 'No phone number available' };
            }

            const whatsappService = require('./whatsapp.service');
            
            // Get lead details for personalized message
            let lead = null;
            if (leadInfo.leadId) {
                lead = await Lead.findById(leadInfo.leadId);
            }

            const message = this.buildWhatsAppMessage(lead, leadInfo, analysis);
            
            await whatsappService.sendTextMessage(
                leadInfo.phoneNumber,
                message,
                lead?.assignedTo
            );

            return { success: true, details: 'WhatsApp details sent' };
        } catch (error) {
            console.error('Failed to send WhatsApp details:', error);
            return { success: false, details: error.message };
        }
    }

    /**
     * Build personalized WhatsApp message
     */
    static buildWhatsAppMessage(lead, leadInfo, analysis) {
        const name = lead?.name || leadInfo.leadName || 'there';
        
        return `Hi ${name}! 👋

Thank you for your interest in JK Construction properties!

Here are the details you requested:
🏠 Premium 2/3 BHK apartments
📍 Prime locations in Chennai
💰 Starting from ₹45 Lakhs

📞 For more information or to schedule a site visit, reply to this message or call us.

Visit our website: https://jkconstruction.com

Best regards,
JK Construction Team`;
    }

    /**
     * Send site visit booking link
     */
    static async sendBookingLink(leadInfo, analysis) {
        try {
            if (!leadInfo.phoneNumber) {
                return { success: false, details: 'No phone number available' };
            }

            const whatsappService = require('./whatsapp.service');
            
            let lead = null;
            if (leadInfo.leadId) {
                lead = await Lead.findById(leadInfo.leadId);
            }

            const name = lead?.name || leadInfo.leadName || 'there';
            const message = `Hi ${name}! 🏠

Great to hear you'd like to visit our properties!

Click here to book your site visit:
🔗 https://jkconstruction.com/book-visit?lead=${leadInfo.leadId || 'new'}

Or reply with your preferred date and time, and we'll arrange everything for you.

See you soon!
JK Construction Team`;

            await whatsappService.sendTextMessage(
                leadInfo.phoneNumber,
                message,
                lead?.assignedTo
            );

            return { success: true, details: 'Booking link sent' };
        } catch (error) {
            console.error('Failed to send booking link:', error);
            return { success: false, details: error.message };
        }
    }

    /**
     * Schedule callback task
     */
    static async scheduleCallback(leadInfo, analysis) {
        try {
            if (!leadInfo.leadId) {
                return { success: false, details: 'No lead ID for callback scheduling' };
            }

            const Activity = require('../models/Activity');
            
            // Create callback task
            const callbackTask = new Activity({
                leadId: leadInfo.leadId,
                type: 'task',
                title: 'Callback requested from AI call',
                description: `Customer requested callback. Summary: ${analysis.summary || 'No summary available'}`,
                scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
                isCompleted: false,
                metadata: {
                    priority: 'high',
                    source: 'ai_call',
                    conversationSummary: analysis.summary
                }
            });

            await callbackTask.save();

            return { success: true, details: 'Callback scheduled', taskId: callbackTask._id };
        } catch (error) {
            console.error('Failed to schedule callback:', error);
            return { success: false, details: error.message };
        }
    }

    /**
     * Update CRM with call results
     * Uses data layer to ensure Zoho is updated first (source of truth)
     */
    static async updateCRM(leadInfo, analysis, webhookData, actionsExecuted) {
        try {
            if (!leadInfo.leadId) {
                console.warn('No lead ID for CRM update');
                return;
            }

            // Determine lead status based on analysis
            let status = LEAD_STATUS.CALL_ATTENDED;
            const intentTypes = analysis.intents.map(i => i.type);

            if (intentTypes.includes(INTENT_TYPES.BOOK_APPOINTMENT)) {
                status = LEAD_STATUS.APPOINTMENT_BOOKED;
            } else if (intentTypes.includes(INTENT_TYPES.INTERESTED)) {
                status = LEAD_STATUS.INTERESTED;
            } else if (intentTypes.includes(INTENT_TYPES.NOT_INTERESTED)) {
                status = LEAD_STATUS.NOT_INTERESTED;
            }

            // Get the lead to find zohoId
            const lead = await Lead.findById(leadInfo.leadId);
            
            // Update status via data layer - syncs to Zoho FIRST
            if (lead?.zohoId) {
                try {
                    await dataLayer.updateLeadStatus(lead.zohoId, status, {
                        reason: 'post_call_analysis'
                    });
                    console.log('✅ Status synced to Zoho via data layer');
                } catch (statusError) {
                    console.error('Data layer status update failed:', statusError.message);
                }
            }

            // Update local-only fields via data layer
            if (lead?.zohoId) {
                const noteDate = new Date().toLocaleString();
                const newNote = `\n\n--- AI Call Summary (${noteDate}) ---\n` +
                    `Status: ${status}\n` +
                    `Intents: ${intentTypes.join(', ') || 'None detected'}\n` +
                    `Summary: ${analysis.summary || 'No summary'}\n` +
                    `Actions: ${actionsExecuted.map(a => a.type).join(', ') || 'None'}`;
                
                await dataLayer.updateLocalFields(lead.zohoId, {
                    notes: (lead.notes || '') + newNote,
                    lastCallAt: new Date(),
                    callCount: (lead.callCount || 0) + 1
                });
            }

            // Also update MongoDB-only fields directly
            if (lead) {
                lead.callStatus = 'answered';
                lead.callAttempts = (lead.callAttempts || 0) + 1;
                await lead.save();
            }

            console.log('✅ CRM updated', { leadId: leadInfo.leadId, status });
        } catch (error) {
            console.error('CRM update failed:', error);
        }
    }

    /**
     * Handle call initiation failure
     */
    static async handleCallInitiationFailure(data) {
        const { conversation_id, failure_reason, metadata } = data;

        console.warn('Call initiation failed', {
            conversationId: conversation_id,
            failureReason: failure_reason
        });

        // Determine status based on failure reason
        let status = LEAD_STATUS.NO_RESPONSE;
        if (failure_reason === 'busy') {
            status = LEAD_STATUS.NO_RESPONSE;
        } else if (failure_reason === 'no-answer') {
            status = LEAD_STATUS.NO_RESPONSE;
        }

        // Try to update lead if we have metadata
        const leadId = metadata?.leadId || metadata?.body?.leadId;
        if (leadId) {
            try {
                const lead = await Lead.findById(leadId);
                if (lead?.zohoId) {
                    // Update status via data layer (Zoho first)
                    await dataLayer.updateLeadStatus(lead.zohoId, status, {
                        reason: `call_failure_${failure_reason}`
                    });
                }
                
                // Update local-only fields
                await Lead.findByIdAndUpdate(leadId, {
                    callStatus: failure_reason === 'busy' ? 'busy' : 'not_answered',
                    lastCallAt: new Date()
                });
            } catch (error) {
                console.error('Failed to update lead after call failure:', error);
            }
        }

        return {
            success: true,
            type: 'call_failure_handled',
            status,
            actionsExecuted: []
        };
    }

    /**
     * Process Twilio call status update
     */
    static async processCallStatus(callStatusData) {
        const { callSid, status, phoneNumber, duration, leadId } = callStatusData;

        console.log('Processing call status', { callSid, status, leadId });

        // Map Twilio status to our status
        let leadStatus = LEAD_STATUS.CALL_ATTENDED;
        let callStatus = 'answered';

        switch (status) {
            case 'busy':
                leadStatus = LEAD_STATUS.NO_RESPONSE;
                callStatus = 'busy';
                break;
            case 'no-answer':
                leadStatus = LEAD_STATUS.NO_RESPONSE;
                callStatus = 'not_answered';
                break;
            case 'failed':
                leadStatus = LEAD_STATUS.NO_RESPONSE;
                callStatus = 'not_answered';
                break;
        }

        if (leadId) {
            try {
                const lead = await Lead.findById(leadId);
                if (lead?.zohoId) {
                    // Update status via data layer (Zoho first)
                    await dataLayer.updateLeadStatus(lead.zohoId, leadStatus, {
                        reason: `twilio_call_${status}`
                    });
                }
                
                // Update local-only fields
                await Lead.findByIdAndUpdate(leadId, {
                    callStatus,
                    lastCallAt: new Date(),
                    $inc: { callAttempts: 1 }
                });
            } catch (error) {
                console.error('Failed to update lead from call status:', error);
            }
        }

        return { success: true, status: leadStatus };
    }
}

module.exports = {
    PostCallOrchestrator,
    LEAD_STATUS,
    ACTION_TYPES,
    INTENT_TYPES
};
