/**
 * AI Call Webhook Routes - Enhanced Version
 * Handles callbacks from ElevenLabs AI conversations with full automation
 * 
 * WEBHOOK TYPES HANDLED:
 * 1. post_call_transcription - Main webhook with transcript and analysis
 * 2. post_call_audio - Audio recording webhook
 * 3. call_initiation_failure - Call failed to connect
 * 4. Legacy Twilio status callbacks
 * 
 * AUTOMATION FLOW:
 * ElevenLabs Call Ends → Webhook → Intent Analysis → Actions (WhatsApp/CRM) → Done
 * 
 * SETUP:
 * Configure webhook URL in ElevenLabs Dashboard: https://yourserver.com/webhook/elevenlabs
 * Enable HMAC authentication for security
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const logger = require('../utils/logger');
const config = require('../config/config');
const { PostCallOrchestrator, LEAD_STATUS } = require('../services/postCallOrchestrator');
const zohoClient = require('../services/zohoClient');

// ============================================================================
// ELEVENLABS POST-CALL WEBHOOK (Main Entry Point)
// ============================================================================

/**
 * POST /webhook/elevenlabs
 * Main webhook endpoint for ElevenLabs post-call webhooks
 * Handles: post_call_transcription, post_call_audio, call_initiation_failure
 */
router.post('/elevenlabs', async (req, res) => {
    const startTime = Date.now();

    try {
        // Validate HMAC signature if configured
        if (config.server?.webhookSecret) {
            const isValid = validateHmacSignature(req);
            if (!isValid) {
                logger.warn('Invalid webhook signature', {
                    ip: req.ip,
                    path: req.path
                });
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }

        const webhookData = req.body;
        const { type, data, event_timestamp } = webhookData;

        logger.info('📥 ElevenLabs webhook received', {
            type,
            conversationId: data?.conversation_id,
            eventTimestamp: event_timestamp,
            hasTranscript: !!data?.transcript,
            hasAnalysis: !!data?.analysis
        });

        // Respond immediately to acknowledge receipt (ElevenLabs expects 200)
        res.status(200).json({ 
            status: 'received',
            conversationId: data?.conversation_id 
        });

        // Process webhook asynchronously
        setImmediate(async () => {
            try {
                const result = await PostCallOrchestrator.processPostCallWebhook(webhookData);

                logger.info('✅ Webhook processing completed', {
                    conversationId: data?.conversation_id,
                    success: result.success,
                    actionsExecuted: result.actionsExecuted?.length || 0,
                    processingTimeMs: Date.now() - startTime
                });

                if (result.errors && result.errors.length > 0) {
                    logger.warn('Webhook processing had errors', {
                        conversationId: data?.conversation_id,
                        errors: result.errors
                    });
                }
            } catch (asyncError) {
                logger.error('Async webhook processing failed', {
                    error: asyncError.message,
                    conversationId: data?.conversation_id
                });
            }
        });

    } catch (error) {
        logger.error('Webhook handler error', {
            error: error.message,
            stack: error.stack
        });
        // Still return 200 to prevent ElevenLabs from disabling webhook
        res.status(200).json({ 
            status: 'error',
            error: 'Processing error' 
        });
    }
});

// ============================================================================
// LEGACY WEBHOOK ENDPOINTS (Backwards Compatibility)
// ============================================================================

/**
 * POST /ai-call-webhook
 * Legacy endpoint for Twilio call status callbacks
 */
router.post('/ai-call-webhook', async (req, res) => {
    try {
        const {
            CallSid,
            CallStatus,
            From,
            To,
            Duration,
            RecordingUrl,
            lead_id,
            lead_name
        } = req.body;

        logger.info('Legacy AI call webhook received', {
            callSid: CallSid,
            status: CallStatus,
            from: From,
            duration: Duration,
            leadId: lead_id
        });

        // Handle call completion statuses
        if (['completed', 'busy', 'no-answer', 'failed'].includes(CallStatus)) {
            await PostCallOrchestrator.processCallStatus({
                callSid: CallSid,
                status: CallStatus,
                phoneNumber: From,
                duration: Duration,
                recordingUrl: RecordingUrl,
                leadId: lead_id,
                leadName: lead_name
            });
        }

        res.status(200).send('OK');

    } catch (error) {
        logger.error('Legacy webhook processing failed', {
            error: error.message,
            body: req.body
        });
        res.status(200).send('OK'); // Still return 200
    }
});

/**
 * POST /ai-conversation-webhook
 * Legacy endpoint for conversation analysis (now routes to orchestrator)
 */
router.post('/ai-conversation-webhook', async (req, res) => {
    try {
        const webhookData = req.body;

        logger.info('Legacy conversation webhook received', {
            conversationId: webhookData.conversation_id,
            hasTranscript: !!webhookData.transcript
        });

        // Convert to ElevenLabs format and process
        const normalizedData = {
            type: 'post_call_transcription',
            event_timestamp: Math.floor(Date.now() / 1000),
            data: {
                conversation_id: webhookData.conversation_id,
                agent_id: webhookData.agent_id,
                transcript: webhookData.transcript,
                analysis: webhookData.analysis,
                metadata: {
                    call_duration_secs: webhookData.duration_seconds
                },
                conversation_initiation_client_data: {
                    dynamic_variables: webhookData.custom_data || {}
                }
            }
        };

        res.status(200).json({ success: true });

        // Process asynchronously
        setImmediate(async () => {
            await PostCallOrchestrator.processPostCallWebhook(normalizedData);
        });

    } catch (error) {
        logger.error('Legacy conversation webhook failed', {
            error: error.message
        });
        res.status(200).json({ success: false, error: error.message });
    }
});

// ============================================================================
// TESTING ENDPOINTS
// ============================================================================

/**
 * POST /webhook/test
 * Test endpoint to simulate webhook processing
 * Use this to verify the setup is working
 */
router.post('/test', async (req, res) => {
    try {
        const testData = req.body || getTestWebhookPayload();

        logger.info('🧪 Test webhook triggered', {
            type: testData.type,
            conversationId: testData.data?.conversation_id
        });

        const result = await PostCallOrchestrator.processPostCallWebhook(testData);

        res.json({
            success: result.success,
            message: 'Test webhook processed',
            result: {
                conversationId: result.conversationId,
                leadId: result.leadId,
                analysis: result.analysis,
                actionsExecuted: result.actionsExecuted,
                errors: result.errors,
                processingTimeMs: result.processingTimeMs
            }
        });

    } catch (error) {
        logger.error('Test webhook failed', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /webhook/health
 * Health check endpoint for monitoring
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'ai-webhook-handler',
        timestamp: new Date().toISOString(),
        config: {
            webhookSecretConfigured: !!config.server?.webhookSecret,
            openaiConfigured: !!config.openai?.apiKey,
            twilioConfigured: !!config.twilio?.accountSid
        }
    });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate HMAC signature from ElevenLabs webhook
 * @param {Request} req - Express request object
 * @returns {boolean} Whether signature is valid
 */
function validateHmacSignature(req) {
    const signature = req.headers['elevenlabs-signature'];
    if (!signature) return false;

    try {
        // Parse signature: t=timestamp,v0=hash
        const parts = signature.split(',');
        const timestamp = parts[0].substring(2); // Remove 't='
        const hash = parts[1]; // Keep 'v0=' prefix for comparison

        // Check timestamp is within 30 minutes
        const timestampInt = parseInt(timestamp);
        const now = Math.floor(Date.now() / 1000);
        if (now - timestampInt > 30 * 60) {
            logger.warn('Webhook signature timestamp expired', { timestamp, now });
            return false;
        }

        // Compute expected signature
        const payload = JSON.stringify(req.body);
        const fullPayload = `${timestamp}.${payload}`;
        const expectedHash = 'v0=' + crypto
            .createHmac('sha256', config.server.webhookSecret)
            .update(fullPayload)
            .digest('hex');

        // Compare signatures
        return crypto.timingSafeEqual(
            Buffer.from(hash),
            Buffer.from(expectedHash)
        );

    } catch (error) {
        logger.error('HMAC validation error', { error: error.message });
        return false;
    }
}

/**
 * Generate test webhook payload for testing
 * @returns {object} Sample webhook payload
 */
function getTestWebhookPayload() {
    return {
        type: 'post_call_transcription',
        event_timestamp: Math.floor(Date.now() / 1000),
        data: {
            agent_id: 'test-agent-id',
            conversation_id: 'test-conv-' + Date.now(),
            status: 'done',
            transcript: [
                {
                    role: 'agent',
                    message: 'Hello! Thank you for your interest in JK Construction properties. How can I help you today?',
                    time_in_call_secs: 0
                },
                {
                    role: 'user',
                    message: 'Hi, I am interested in your 3BHK apartments in OMR. Can you send me the details on WhatsApp?',
                    time_in_call_secs: 5
                },
                {
                    role: 'agent',
                    message: 'Absolutely! I will send you complete details including floor plans, pricing, and amenities on WhatsApp. Would you also like to schedule a site visit?',
                    time_in_call_secs: 12
                },
                {
                    role: 'user',
                    message: 'Yes, I would like to visit this Saturday if possible.',
                    time_in_call_secs: 20
                },
                {
                    role: 'agent',
                    message: 'Perfect! I will send you a booking link on WhatsApp to confirm your Saturday visit slot. Is there anything else you would like to know?',
                    time_in_call_secs: 26
                },
                {
                    role: 'user',
                    message: 'No, that is all. Thank you!',
                    time_in_call_secs: 32
                }
            ],
            metadata: {
                start_time_unix_secs: Math.floor(Date.now() / 1000) - 35,
                call_duration_secs: 35,
                cost: 150
            },
            analysis: {
                evaluation_criteria_results: {
                    user_interested: 'success',
                    site_visit_requested: 'success',
                    whatsapp_requested: 'success'
                },
                data_collection_results: {
                    property_type: '3BHK apartment',
                    location: 'OMR',
                    preferred_date: 'Saturday'
                },
                call_successful: 'success',
                transcript_summary: 'Customer expressed interest in 3BHK apartments in OMR area. Requested property details via WhatsApp and wants to schedule a site visit for Saturday. High interest lead.'
            },
            conversation_initiation_client_data: {
                dynamic_variables: {
                    lead_id: 'test-lead-123',
                    lead_name: 'Test Customer',
                    phone_number: '+919876543210'
                }
            }
        }
    };
}

// ============================================================================
// APP-BACKEND SYNC (For Frontend Updates)
// ============================================================================

/**
 * Update app-backend MongoDB for real-time UI updates
 * @param {string} leadId - Lead ID
 * @param {object} data - Update data
 */
async function updateAppBackend(leadId, data) {
    try {
        const appBackendUrl = process.env.APP_BACKEND_URL || 'http://localhost:3001';
        const axios = require('axios');

        await axios.post(`${appBackendUrl}/api/internal/lead-update`, {
            leadId,
            aiCallData: {
                transcript: data.transcript,
                summary: data.analysis?.transcript_summary,
                status: data.status,
                qualification: data.leadQualification,
                actionsExecuted: data.actionsExecuted,
                updatedAt: new Date().toISOString()
            }
        }, {
            headers: {
                'X-Internal-Key': process.env.INTERNAL_API_KEY || 'internal-key'
            },
            timeout: 5000
        });

        logger.info('App backend updated for lead', { leadId });
    } catch (error) {
        // Don't fail the main process if app-backend update fails
        logger.warn('Failed to update app-backend', {
            leadId,
            error: error.message
        });
    }
}

module.exports = router;
