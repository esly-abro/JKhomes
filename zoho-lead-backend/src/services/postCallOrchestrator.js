/**
 * Post-Call Action Orchestrator
 * Central service that handles all post-call automation based on conversation analysis
 * 
 * This is the BRAIN of the post-call automation system:
 * 1. Receives webhook data from ElevenLabs after call ends
 * 2. Analyzes transcript using AI to extract intents
 * 3. Executes appropriate actions based on intents
 * 4. Updates CRM with results
 * 5. Sends notifications via WhatsApp/SMS
 * 
 * Flow:
 * ElevenLabs Call Ends → Webhook → Orchestrator → [Analyze → Act → Update CRM → Notify]
 */

const logger = require('../utils/logger');
const zohoClient = require('./zohoClient');
const whatsappService = require('./whatsappService');
const { IntentAnalyzerService, INTENT_TYPES, LEAD_QUALIFICATION } = require('./intentAnalyzer.service');

// Lead status mappings for Zoho CRM
const LEAD_STATUS = {
    NEW: 'New',
    AI_CALL_COMPLETED: 'AI Call Completed',
    INTERESTED: 'Interested',
    HOT_LEAD: 'Hot Lead - Follow Up',
    WARM_LEAD: 'Warm Lead - Nurture',
    COLD_LEAD: 'Cold Lead - Archive',
    SITE_VISIT_BOOKED: 'Site Visit Booked',
    SITE_VISIT_SCHEDULED: 'Site Visit Scheduled',
    WHATSAPP_SENT: 'Details Sent - WhatsApp',
    CALLBACK_SCHEDULED: 'Callback Scheduled',
    NOT_INTERESTED: 'Not Interested',
    BUSY_RETRY: 'Busy - Retry Later',
    NO_ANSWER: 'No Answer - Follow Up',
    CALL_FAILED: 'Call Failed',
    REVIEW_NEEDED: 'AI Call Completed - Review Needed'
};

// Action types that can be executed
const ACTION_TYPES = {
    SEND_WHATSAPP_DETAILS: 'send_whatsapp_details',
    SEND_BOOKING_LINK: 'send_booking_link',
    SCHEDULE_CALLBACK: 'schedule_callback',
    SEND_SITE_VISIT_CONFIRMATION: 'send_site_visit_confirmation',
    UPDATE_CRM_STATUS: 'update_crm_status',
    SEND_FOLLOW_UP: 'send_follow_up',
    FLAG_FOR_REVIEW: 'flag_for_review'
};

class PostCallOrchestrator {
    constructor() {
        this.mediaBaseUrl = process.env.SERVER_URL || 'https://jkconstruction.com';
        this.defaultBrochureUrl = `${this.mediaBaseUrl}/brochures/jk-properties-brochure.pdf`;
        
        logger.info('Post-Call Orchestrator initialized');
    }

    /**
     * Main entry point - Process post-call webhook data
     * @param {object} webhookData - ElevenLabs post-call webhook payload
     * @returns {Promise<object>} Processing result with actions taken
     */
    async processPostCallWebhook(webhookData) {
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
            // Extract data based on webhook type
            const { type, data, event_timestamp } = webhookData;

            logger.info('Processing post-call webhook', {
                type,
                conversationId: data?.conversation_id,
                eventTimestamp: event_timestamp
            });

            // Handle different webhook types
            if (type === 'call_initiation_failure') {
                return await this.handleCallInitiationFailure(data);
            }

            if (type === 'post_call_audio') {
                // Audio webhook - just log it, no action needed
                logger.info('Received post-call audio webhook', {
                    conversationId: data?.conversation_id,
                    hasAudio: !!data?.full_audio
                });
                return { success: true, type: 'audio_received', actionsExecuted: [] };
            }

            // Main flow: post_call_transcription
            if (type !== 'post_call_transcription') {
                logger.warn('Unknown webhook type', { type });
                return { success: false, error: 'Unknown webhook type' };
            }

            result.conversationId = data.conversation_id;

            // Extract lead information from webhook data
            const leadInfo = this.extractLeadInfo(data);
            result.leadId = leadInfo.leadId;

            if (!leadInfo.leadId && !leadInfo.phoneNumber) {
                logger.warn('No lead identifier in webhook data');
                result.errors.push('No lead identifier found');
            }

            // Step 1: Analyze the conversation
            const analysis = await this.analyzeConversation(data);
            result.analysis = {
                intents: analysis.intents.map(i => i.type),
                qualification: analysis.leadQualification,
                confidence: analysis.overallConfidence
            };

            // Step 2: Determine actions based on analysis
            const actions = this.determineActions(analysis, leadInfo);
            result.plannedActions = actions.map(a => a.type);

            // Step 3: Execute actions
            for (const action of actions) {
                try {
                    const actionResult = await this.executeAction(action, analysis, leadInfo, data);
                    result.actionsExecuted.push({
                        type: action.type,
                        success: actionResult.success,
                        details: actionResult.details
                    });
                } catch (actionError) {
                    logger.error('Action execution failed', {
                        action: action.type,
                        error: actionError.message
                    });
                    result.errors.push(`${action.type}: ${actionError.message}`);
                }
            }

            // Step 4: Update CRM with comprehensive data
            await this.updateCRM(leadInfo, analysis, data, result.actionsExecuted);

            result.success = result.errors.length === 0;
            result.processingTimeMs = Date.now() - startTime;

            logger.info('Post-call processing completed', {
                conversationId: result.conversationId,
                leadId: result.leadId,
                actionsExecuted: result.actionsExecuted.length,
                processingTimeMs: result.processingTimeMs
            });

            return result;

        } catch (error) {
            logger.error('Post-call orchestration failed', {
                error: error.message,
                stack: error.stack
            });
            result.errors.push(error.message);
            result.processingTimeMs = Date.now() - startTime;
            return result;
        }
    }

    /**
     * Handle call initiation failure webhook
     * @private
     */
    async handleCallInitiationFailure(data) {
        const { agent_id, conversation_id, failure_reason, metadata } = data;

        logger.warn('Call initiation failed', {
            conversationId: conversation_id,
            failureReason: failure_reason
        });

        // Extract phone number from metadata
        let phoneNumber = null;
        let leadId = null;

        if (metadata?.type === 'twilio' && metadata?.body) {
            phoneNumber = metadata.body.To || metadata.body.Called;
        } else if (metadata?.type === 'sip' && metadata?.body) {
            phoneNumber = metadata.body.to_number;
        }

        // Map failure reason to lead status
        let status = LEAD_STATUS.CALL_FAILED;
        if (failure_reason === 'busy') {
            status = LEAD_STATUS.BUSY_RETRY;
        } else if (failure_reason === 'no-answer') {
            status = LEAD_STATUS.NO_ANSWER;
        }

        // Try to update CRM if we have a phone number
        if (phoneNumber) {
            try {
                const lead = await zohoClient.searchLeadsByPhone(phoneNumber);
                if (lead) {
                    await zohoClient.updateLead(lead.id, {
                        Lead_Status: status,
                        AI_Call_Status: failure_reason,
                        Last_AI_Call_Date: new Date().toISOString(),
                        Description: `AI call initiation failed: ${failure_reason}`
                    });
                    leadId = lead.id;
                }
            } catch (error) {
                logger.error('Failed to update CRM for failed call', { error: error.message });
            }
        }

        return {
            success: true,
            type: 'call_failure_handled',
            conversationId: conversation_id,
            leadId,
            failureReason: failure_reason,
            status,
            actionsExecuted: ['update_crm_status']
        };
    }

    /**
     * Extract lead information from webhook data
     * @private
     */
    extractLeadInfo(data) {
        const leadInfo = {
            leadId: null,
            phoneNumber: null,
            leadName: null,
            email: null
        };

        // Check conversation_initiation_client_data for dynamic variables
        const clientData = data.conversation_initiation_client_data;
        if (clientData?.dynamic_variables) {
            const vars = clientData.dynamic_variables;
            leadInfo.leadId = vars.lead_id || vars.leadId;
            leadInfo.leadName = vars.lead_name || vars.leadName || vars.user_name;
            leadInfo.phoneNumber = vars.phone_number || vars.phoneNumber;
            leadInfo.email = vars.email;
        }

        // Check metadata for phone details (Twilio integration)
        if (data.metadata?.phone) {
            leadInfo.phoneNumber = leadInfo.phoneNumber || data.metadata.phone;
        }

        // Check custom_data (older format)
        if (data.custom_data) {
            leadInfo.leadId = leadInfo.leadId || data.custom_data.lead_id;
            leadInfo.leadName = leadInfo.leadName || data.custom_data.lead_name;
            leadInfo.phoneNumber = leadInfo.phoneNumber || data.custom_data.phone;
        }

        return leadInfo;
    }

    /**
     * Analyze conversation using Intent Analyzer
     * @private
     */
    async analyzeConversation(data) {
        const context = {
            leadName: this.extractLeadInfo(data).leadName,
            duration: data.metadata?.call_duration_secs
        };

        return await IntentAnalyzerService.analyzeConversation(
            data.transcript,
            data.analysis,
            context
        );
    }

    /**
     * Determine actions to execute based on analysis
     * @private
     */
    determineActions(analysis, leadInfo) {
        const actions = [];
        const intentTypes = analysis.intents.map(i => i.type);

        // Priority 1: Site visit booking
        if (intentTypes.includes(INTENT_TYPES.BOOK_SITE_VISIT)) {
            actions.push({
                type: ACTION_TYPES.SEND_BOOKING_LINK,
                priority: 1,
                reason: 'Customer requested site visit'
            });
        }

        // Priority 2: WhatsApp details request
        if (intentTypes.includes(INTENT_TYPES.SEND_WHATSAPP)) {
            actions.push({
                type: ACTION_TYPES.SEND_WHATSAPP_DETAILS,
                priority: 2,
                reason: 'Customer requested details via WhatsApp'
            });
        }

        // Priority 3: Callback request
        if (intentTypes.includes(INTENT_TYPES.REQUEST_CALLBACK)) {
            actions.push({
                type: ACTION_TYPES.SCHEDULE_CALLBACK,
                priority: 3,
                reason: 'Customer requested callback'
            });
        }

        // Priority 4: Interested but no specific request
        if (intentTypes.includes(INTENT_TYPES.INTERESTED) && actions.length === 0) {
            actions.push({
                type: ACTION_TYPES.SEND_FOLLOW_UP,
                priority: 4,
                reason: 'Customer showed interest'
            });
        }

        // Always update CRM
        actions.push({
            type: ACTION_TYPES.UPDATE_CRM_STATUS,
            priority: 10,
            reason: 'Update CRM with call results'
        });

        // Flag for review if low confidence or no clear intents
        if (analysis.overallConfidence < 0.6 || analysis.intents.length === 0) {
            actions.push({
                type: ACTION_TYPES.FLAG_FOR_REVIEW,
                priority: 11,
                reason: 'Low confidence or unclear intents'
            });
        }

        // Sort by priority
        return actions.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Execute a single action
     * @private
     */
    async executeAction(action, analysis, leadInfo, webhookData) {
        const { phoneNumber, leadId, leadName } = leadInfo;

        switch (action.type) {
            case ACTION_TYPES.SEND_BOOKING_LINK:
                return await this.sendBookingLink(phoneNumber, leadId, leadName, analysis);

            case ACTION_TYPES.SEND_WHATSAPP_DETAILS:
                return await this.sendWhatsAppDetails(phoneNumber, leadId, leadName, analysis);

            case ACTION_TYPES.SCHEDULE_CALLBACK:
                return await this.scheduleCallback(phoneNumber, leadId, leadName, analysis);

            case ACTION_TYPES.SEND_FOLLOW_UP:
                return await this.sendFollowUp(phoneNumber, leadId, leadName, analysis, webhookData);

            case ACTION_TYPES.UPDATE_CRM_STATUS:
                // Handled separately in updateCRM method
                return { success: true, details: 'CRM update handled separately' };

            case ACTION_TYPES.FLAG_FOR_REVIEW:
                return { success: true, details: 'Flagged for manual review' };

            default:
                return { success: false, details: `Unknown action type: ${action.type}` };
        }
    }

    /**
     * Send booking link via WhatsApp
     * @private
     */
    async sendBookingLink(phoneNumber, leadId, leadName, analysis) {
        if (!phoneNumber) {
            return { success: false, details: 'No phone number available' };
        }

        if (!whatsappService.isAvailable()) {
            // Fallback to SMS
            const twilioService = require('./twilioElevenLabsService');
            const bookingUrl = `${this.mediaBaseUrl}/book-visit?id=${leadId}`;
            const message = `Hello ${leadName || 'there'}! 🏠\n\nBook your site visit: ${bookingUrl}\n\nJK Construction`;
            
            const sent = await twilioService.sendSms(phoneNumber, message);
            return { 
                success: sent, 
                details: sent ? 'Booking link sent via SMS (WhatsApp not configured)' : 'Failed to send SMS'
            };
        }

        const result = await whatsappService.sendBookingLink(phoneNumber, leadId, leadName);
        return {
            success: result.success,
            details: result.success ? 'Booking link sent via WhatsApp' : result.error,
            messageSid: result.messageSid
        };
    }

    /**
     * Send property details via WhatsApp
     * @private
     */
    async sendWhatsAppDetails(phoneNumber, leadId, leadName, analysis) {
        if (!phoneNumber) {
            return { success: false, details: 'No phone number available' };
        }

        // Extract property preferences from analysis
        const propertyDetails = {
            propertyName: 'JK Premium Villas & Apartments',
            location: analysis.entities?.location_preference || 'Chennai',
            priceRange: analysis.entities?.budget || '₹50L - ₹2Cr',
            amenities: ['24/7 Security', 'Swimming Pool', 'Gym', 'Children\'s Play Area', 'Landscaped Gardens'],
            brochureUrl: this.defaultBrochureUrl
        };

        if (!whatsappService.isAvailable()) {
            // Fallback to SMS with basic info
            const twilioService = require('./twilioElevenLabsService');
            const message = `Hello ${leadName || 'there'}! 🏠\n\nThank you for your interest in JK Construction!\n\n📍 ${propertyDetails.location}\n💰 ${propertyDetails.priceRange}\n\nCall us for details: ${process.env.TWILIO_PHONE_NUMBER}\n\nJK Construction`;
            
            const sent = await twilioService.sendSms(phoneNumber, message);
            return {
                success: sent,
                details: sent ? 'Details sent via SMS (WhatsApp not configured)' : 'Failed to send SMS'
            };
        }

        const result = await whatsappService.sendPropertyDetails(phoneNumber, propertyDetails);
        return {
            success: result.success,
            details: result.success ? 'Property details sent via WhatsApp' : result.error,
            messageSid: result.messageSid
        };
    }

    /**
     * Schedule callback and send confirmation
     * @private
     */
    async scheduleCallback(phoneNumber, leadId, leadName, analysis) {
        // Extract preferred callback time from analysis
        const preferredTime = analysis.entities?.preferred_time || 'tomorrow';
        const preferredDate = analysis.entities?.preferred_date || null;

        // Calculate next business hour callback time
        const callbackTime = this.calculateCallbackTime(preferredDate, preferredTime);

        if (phoneNumber && whatsappService.isAvailable()) {
            const message = `Hello ${leadName || 'there'}! 👋\n\n` +
                `As requested, we've scheduled a callback for:\n` +
                `📅 ${callbackTime.date}\n` +
                `⏰ ${callbackTime.time}\n\n` +
                `Our team will call you then. If you'd like to reschedule, just reply to this message.\n\n` +
                `_JK Construction_`;

            await whatsappService.sendMessage(phoneNumber, message);
        }

        return {
            success: true,
            details: `Callback scheduled for ${callbackTime.date} ${callbackTime.time}`,
            callbackTime
        };
    }

    /**
     * Send follow-up message after call
     * @private
     */
    async sendFollowUp(phoneNumber, leadId, leadName, analysis, webhookData) {
        if (!phoneNumber) {
            return { success: false, details: 'No phone number available' };
        }

        const followUpDetails = {
            customerName: leadName || 'Valued Customer',
            callSummary: analysis.summary || webhookData.analysis?.transcript_summary || '',
            nextSteps: [],
            brochureUrl: this.defaultBrochureUrl
        };

        // Add next steps based on qualification
        if (analysis.leadQualification === LEAD_QUALIFICATION.HOT) {
            followUpDetails.nextSteps = [
                'Schedule a site visit at your convenience',
                'Connect with our property consultant',
                'Get a personalized quote'
            ];
        } else if (analysis.leadQualification === LEAD_QUALIFICATION.WARM) {
            followUpDetails.nextSteps = [
                'Review the property details in the brochure',
                'Let us know your specific requirements',
                'We\'ll follow up in a few days'
            ];
        }

        if (!whatsappService.isAvailable()) {
            return { success: true, details: 'Follow-up skipped (WhatsApp not configured)' };
        }

        const result = await whatsappService.sendFollowUpMessage(phoneNumber, followUpDetails);
        return {
            success: result.success,
            details: result.success ? 'Follow-up message sent via WhatsApp' : result.error
        };
    }

    /**
     * Update Zoho CRM with comprehensive call data
     * @private
     */
    async updateCRM(leadInfo, analysis, webhookData, actionsExecuted) {
        const { leadId, phoneNumber } = leadInfo;

        // Find lead by ID or phone number
        let lead = null;
        if (leadId) {
            lead = { id: leadId };
        } else if (phoneNumber) {
            lead = await zohoClient.searchLeadsByPhone(phoneNumber);
        }

        if (!lead) {
            logger.warn('Could not find lead to update CRM', { leadId, phoneNumber });
            return;
        }

        // Determine lead status based on intents and qualification
        const status = this.determineLeadStatus(analysis, actionsExecuted);

        // Prepare update data
        const updateData = {
            Lead_Status: status,
            AI_Call_Status: 'Completed',
            AI_Call_Duration: webhookData.metadata?.call_duration_secs,
            Last_AI_Call_Date: new Date().toISOString(),
            AI_Conversation_Summary: analysis.summary || webhookData.analysis?.transcript_summary,
            AI_Lead_Qualification: analysis.leadQualification,
            AI_Confidence_Score: Math.round((analysis.overallConfidence || 0) * 100)
        };

        // Add transcript (truncated for Zoho field limit)
        if (webhookData.transcript) {
            const transcriptText = typeof webhookData.transcript === 'string' 
                ? webhookData.transcript 
                : JSON.stringify(webhookData.transcript);
            updateData.AI_Call_Transcript = transcriptText.substring(0, 32000);
        }

        // Add extracted entities
        if (analysis.entities) {
            if (analysis.entities.budget) updateData.Budget = analysis.entities.budget;
            if (analysis.entities.location_preference) updateData.Preferred_Location = analysis.entities.location_preference;
            if (analysis.entities.property_type) updateData.Property_Interest = analysis.entities.property_type;
            if (analysis.entities.preferred_date) updateData.Preferred_Visit_Date = analysis.entities.preferred_date;
        }

        // Add actions taken
        const actionsSummary = actionsExecuted
            .filter(a => a.success)
            .map(a => a.type)
            .join(', ');
        if (actionsSummary) {
            updateData.AI_Actions_Taken = actionsSummary;
        }

        // Add key concerns if any
        if (analysis.keyConcerns && analysis.keyConcerns.length > 0) {
            updateData.Customer_Concerns = analysis.keyConcerns.join('; ');
        }

        // Update lead
        try {
            await zohoClient.updateLead(lead.id, updateData);
            logger.info('CRM updated successfully', {
                leadId: lead.id,
                status,
                qualification: analysis.leadQualification
            });
        } catch (error) {
            logger.error('Failed to update CRM', {
                leadId: lead.id,
                error: error.message
            });
        }
    }

    /**
     * Determine lead status based on analysis and actions
     * @private
     */
    determineLeadStatus(analysis, actionsExecuted) {
        const intentTypes = analysis.intents.map(i => i.type);
        const successfulActions = actionsExecuted.filter(a => a.success).map(a => a.type);

        // Check intents in priority order
        if (intentTypes.includes(INTENT_TYPES.NOT_INTERESTED)) {
            return LEAD_STATUS.NOT_INTERESTED;
        }

        if (intentTypes.includes(INTENT_TYPES.BOOK_SITE_VISIT)) {
            if (successfulActions.includes(ACTION_TYPES.SEND_BOOKING_LINK)) {
                return LEAD_STATUS.SITE_VISIT_BOOKED;
            }
            return LEAD_STATUS.SITE_VISIT_SCHEDULED;
        }

        if (intentTypes.includes(INTENT_TYPES.SEND_WHATSAPP)) {
            if (successfulActions.includes(ACTION_TYPES.SEND_WHATSAPP_DETAILS)) {
                return LEAD_STATUS.WHATSAPP_SENT;
            }
        }

        if (intentTypes.includes(INTENT_TYPES.REQUEST_CALLBACK)) {
            return LEAD_STATUS.CALLBACK_SCHEDULED;
        }

        // Based on qualification
        switch (analysis.leadQualification) {
            case LEAD_QUALIFICATION.HOT:
                return LEAD_STATUS.HOT_LEAD;
            case LEAD_QUALIFICATION.WARM:
                return LEAD_STATUS.WARM_LEAD;
            case LEAD_QUALIFICATION.COLD:
                return LEAD_STATUS.COLD_LEAD;
            default:
                return LEAD_STATUS.REVIEW_NEEDED;
        }
    }

    /**
     * Calculate callback time based on preferences
     * @private
     */
    calculateCallbackTime(preferredDate, preferredTime) {
        const now = new Date();
        let callbackDate = new Date(now);

        // Parse preferred time
        const timeKeywords = {
            'morning': { hour: 10, minute: 0 },
            'afternoon': { hour: 14, minute: 0 },
            'evening': { hour: 17, minute: 0 },
            'tomorrow': { addDays: 1, hour: 10, minute: 0 }
        };

        let timeConfig = timeKeywords['tomorrow']; // Default

        if (preferredTime) {
            const lowerTime = preferredTime.toLowerCase();
            for (const [keyword, config] of Object.entries(timeKeywords)) {
                if (lowerTime.includes(keyword)) {
                    timeConfig = config;
                    break;
                }
            }
        }

        // Apply configuration
        if (timeConfig.addDays) {
            callbackDate.setDate(callbackDate.getDate() + timeConfig.addDays);
        }
        callbackDate.setHours(timeConfig.hour, timeConfig.minute, 0, 0);

        // Skip weekends
        const day = callbackDate.getDay();
        if (day === 0) callbackDate.setDate(callbackDate.getDate() + 1);
        if (day === 6) callbackDate.setDate(callbackDate.getDate() + 2);

        return {
            date: callbackDate.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            time: callbackDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
            timestamp: callbackDate.toISOString()
        };
    }

    /**
     * Process a simple call status update (for backwards compatibility)
     * @param {object} callData - Basic call data
     */
    async processCallStatus(callData) {
        const { status, phoneNumber, leadId, duration } = callData;

        let leadStatus = LEAD_STATUS.AI_CALL_COMPLETED;

        switch (status) {
            case 'busy':
                leadStatus = LEAD_STATUS.BUSY_RETRY;
                break;
            case 'no-answer':
                leadStatus = LEAD_STATUS.NO_ANSWER;
                break;
            case 'failed':
                leadStatus = LEAD_STATUS.CALL_FAILED;
                break;
        }

        // Find and update lead
        let lead = null;
        if (leadId) {
            lead = { id: leadId };
        } else if (phoneNumber) {
            lead = await zohoClient.searchLeadsByPhone(phoneNumber);
        }

        if (lead) {
            await zohoClient.updateLead(lead.id, {
                Lead_Status: leadStatus,
                AI_Call_Status: status,
                AI_Call_Duration: duration,
                Last_AI_Call_Date: new Date().toISOString()
            });
        }

        return { success: true, status: leadStatus };
    }
}

// Export singleton and constants
module.exports = {
    PostCallOrchestrator: new PostCallOrchestrator(),
    LEAD_STATUS,
    ACTION_TYPES
};
