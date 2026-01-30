/**
 * ElevenLabs Routes (Native Outbound Calling)
 * Handles outbound calls via ElevenLabs Conversational AI
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * POST /elevenlabs/call
 * Initiate an outbound call via ElevenLabs native phone API
 */
router.post('/call', async (req, res) => {
    try {
        const { phoneNumber, leadId, leadName, metadata } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        // Format phone number to E.164
        let formattedNumber = phoneNumber.replace(/[^0-9+]/g, '');
        if (formattedNumber.length === 10 && /^[6-9]/.test(formattedNumber)) {
            formattedNumber = '+91' + formattedNumber;
        } else if (!formattedNumber.startsWith('+')) {
            formattedNumber = '+' + formattedNumber;
        }

        logger.info('Initiating ElevenLabs native outbound call', {
            phoneNumber: formattedNumber.substring(0, 6) + '***',
            leadId,
            leadName,
            agentId: config.elevenLabs.agentId
        });

        // Build request body - only include phone_number_id if it's set
        const requestBody = {
            agent_id: config.elevenLabs.agentId,
            to_number: formattedNumber,
            conversation_initiation_client_data: {
                dynamic_variables: {
                    lead_id: leadId || 'unknown',
                    lead_name: leadName || 'Customer'
                }
            }
        };

        // Only add agent_phone_number_id if it exists
        if (config.elevenLabs.phoneNumberId) {
            requestBody.agent_phone_number_id = config.elevenLabs.phoneNumberId;
        }

        // Use ElevenLabs Twilio outbound call API
        const response = await axios.post(
            'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
            requestBody,
            {
                headers: {
                    'xi-api-key': config.elevenLabs.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        logger.info('ElevenLabs call initiated successfully', {
            conversationId: response.data.conversation_id,
            status: response.data.status
        });

        res.json({
            success: true,
            callId: response.data.conversation_id,
            status: response.data.status || 'initiated',
            data: response.data
        });

    } catch (error) {
        logger.error('Failed to initiate ElevenLabs call', {
            error: error.message,
            response: error.response?.data
        });

        res.status(500).json({
            success: false,
            error: error.response?.data?.detail || error.message
        });
    }
});

/**
 * POST /elevenlabs/twiml
 * Generate TwiML for Twilio to connect to ElevenLabs
 */
router.post('/twiml', async (req, res) => {
    const { CallSid, leadId, leadName, toNumber } = req.query;

    logger.info('Generating TwiML via ElevenLabs register-call', { CallSid, leadId, toNumber });

    try {
        const twiml = await twilioService.generateTwiML(CallSid, { leadId, leadName, toNumber });

        res.type('text/xml');
        res.send(twiml);
    } catch (error) {
        logger.error('Failed to generate TwiML', { error: error.message });

        // Send error TwiML
        res.type('text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response><Say>An error occurred. Please try again.</Say><Hangup/></Response>');
    }
});

/**
 * POST /elevenlabs/status
 * Receive call status updates from Twilio
 */
router.post('/status', (req, res) => {
    const { CallSid, CallStatus, Duration } = req.body;

    logger.info('Call status update', {
        CallSid,
        CallStatus,
        Duration
    });

    // TODO: Update lead status in Zoho CRM based on call status

    res.sendStatus(200);
});

/**
 * WebSocket /elevenlabs/media-stream
 * Handle media streaming between Twilio and ElevenLabs
 * Note: This will be set up in server.js using express-ws
 */

/**
 * GET /elevenlabs/summary/:phoneNumber
 * Fetch the latest conversation summary for a phone number
 */
router.get('/summary/:phoneNumber', async (req, res) => {
    try {
        const { phoneNumber } = req.params;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                error: 'Phone number is required'
            });
        }

        // Format phone number for matching (E.164 format)
        let formattedPhone = phoneNumber.replace(/[^0-9+]/g, '');
        if (formattedPhone.length === 10 && /^[6-9]/.test(formattedPhone)) {
            formattedPhone = '+91' + formattedPhone;
        } else if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+' + formattedPhone;
        }

        logger.info('Fetching ElevenLabs conversations for phone', {
            phone: formattedPhone.substring(0, 6) + '***'
        });

        // Step 1: Get all conversations
        const conversationsResponse = await axios.get(
            'https://api.elevenlabs.io/v1/convai/conversations',
            {
                headers: {
                    'xi-api-key': config.elevenLabs.apiKey
                },
                params: {
                    page_size: 100
                }
            }
        );

        const conversations = conversationsResponse.data.conversations || [];

        if (conversations.length === 0) {
            return res.json({
                success: true,
                summary: null,
                message: 'No conversations found'
            });
        }

        // Step 2: Find conversations matching this phone number
        const cleanedPhone = formattedPhone.replace(/[^0-9]/g, '');
        const matchingConversations = conversations.filter(conv => {
            const userId = conv.user_id || '';
            const cleanedUserId = userId.replace(/[^0-9]/g, '');
            // Match last 10 digits
            const last10Phone = cleanedPhone.slice(-10);
            const last10UserId = cleanedUserId.slice(-10);
            return last10Phone === last10UserId;
        });

        let targetConversation;
        let matchType = 'exact';

        if (matchingConversations.length > 0) {
            targetConversation = matchingConversations[0];
        } else {
            // Fallback to most recent conversation
            targetConversation = conversations[0];
            matchType = 'fallback';
            logger.info('No exact phone match, using most recent conversation');
        }

        // Step 3: Get conversation details
        const conversationId = targetConversation.conversation_id;

        const detailsResponse = await axios.get(
            `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
            {
                headers: {
                    'xi-api-key': config.elevenLabs.apiKey
                }
            }
        );

        const details = detailsResponse.data;
        // ElevenLabs uses transcript_summary, not summary
        const summary = details.analysis?.transcript_summary || details.analysis?.summary || null;
        const summaryTitle = details.analysis?.call_summary_title || null;
        const transcript = details.transcript || null;
        const callStatus = details.analysis?.call_successful || details.status || 'unknown';

        logger.info('Returning conversation summary', {
            conversationId,
            hasSummary: !!summary,
            summaryTitle,
            matchType,
            callStatus
        });

        return res.json({
            success: true,
            summary,
            summaryTitle,
            transcript,
            conversationId,
            callStatus,
            matchType,
            userId: targetConversation.user_id,
            phoneNumber: details.metadata?.phone_call?.external_number || targetConversation.user_id,
            startTime: targetConversation.start_time,
            endTime: targetConversation.end_time
        });

    } catch (error) {
        logger.error('Error fetching ElevenLabs summary', {
            error: error.message,
            response: error.response?.data
        });

        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch conversation summary'
        });
    }
});

/**
 * GET /elevenlabs/conversations
 * List all recent conversations
 */
router.get('/conversations', async (req, res) => {
    try {
        const response = await axios.get(
            'https://api.elevenlabs.io/v1/convai/conversations',
            {
                headers: {
                    'xi-api-key': config.elevenLabs.apiKey
                },
                params: {
                    page_size: 50
                }
            }
        );

        return res.json({
            success: true,
            conversations: response.data.conversations || [],
            count: response.data.conversations?.length || 0
        });

    } catch (error) {
        logger.error('Error listing ElevenLabs conversations', {
            error: error.message
        });

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
