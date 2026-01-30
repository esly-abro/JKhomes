/**
 * ElevenLabs Conversational AI Client
 * Handles communication with ElevenLabs API for AI-powered voice calls
 */

const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class ElevenLabsClient {
    constructor() {
        // Use config which now has the hardcoded fallbacks if env vars are missing
        this.apiKey = config.elevenLabs.apiKey;
        this.agentId = config.elevenLabs.agentId;
        this.phoneNumberId = config.elevenLabs.phoneNumberId;
        this.serverUrl = 'https://api.elevenlabs.io/v1/convai';

        // Initialize axios instance
        this.client = axios.create({
            baseURL: this.serverUrl,
            headers: {
                'xi-api-key': this.apiKey, // ElevenLabs uses xi-api-key header
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        logger.info('ElevenLabs client initialized', {
            hasApiKey: !!this.apiKey,
            hasAgentId: !!this.agentId,
            agentId: this.agentId // Log the agent ID to verify
        });
    }

    /**
     * Make an outbound call
     * NOTE: ElevenLabs API for outbound calls might require different integration (e.g. Twilio)
     * For now, we are hitting the Conversational AI endpoint to trigger a call.
     * 
     * @param {string} phoneNumber - Recipient's phone number
     * @param {object} options - Additional options (leadName, etc.)
     */
    async makeCall(phoneNumber, options = {}) {
        if (!this.apiKey || !this.agentId) {
            throw new Error('ElevenLabs configuration missing (API Key or Agent ID)');
        }

        // Format phone number (E.164)
        const formattedNumber = this.formatPhoneNumber(phoneNumber);

        logger.info('Initiating ElevenLabs call', {
            to: this.maskPhoneNumber(formattedNumber),
            agentId: this.agentId
        });

        try {
            // Strategy: 
            // 1. Try the "Twilio Outbound Call" endpoint (requires Twilio integration)
            // 2. If that fails (Not Found/Auth), imply checking the dashboard configuration.

            // NOTE: The correct endpoint for triggering a call with a configured agent phone number 
            // is often managed via Twilio integration proxy or directly if using ElevenLabs numbers.
            // Based on recent API patterns: POST /v1/convai/twilio/outbound-call 
            // payload: { agent_id, to_number, ... }

            const payload = {
                agent_id: this.agentId,
                to_number: formattedNumber
                // agent_phone_number_id is optional if the agent has a default one attached, 
                // but if we have it in config, safely pass it.
            };

            if (this.phoneNumberId) {
                payload.agent_phone_number_id = this.phoneNumberId;
            }

            logger.info('Sending payload to ElevenLabs', { endpoint: '/twilio/outbound-call', ...payload });

            const response = await this.client.post('/twilio/outbound-call', payload);

            logger.info('ElevenLabs call initiated successfully', {
                conversationId: response.data.conversation_id,
                to: this.maskPhoneNumber(formattedNumber)
            });

            return {
                success: true,
                callId: response.data.conversation_id,
                status: 'initiated',
                data: response.data
            };

        } catch (error) {
            logger.error('ElevenLabs API call failed', {
                error: error.message,
                response: JSON.stringify(error.response?.data || {})
            });

            // Helpful error message if 404
            if (error.response?.status === 404) {
                throw new Error('ElevenLabs "Outbound Call" endpoint not found. Ensure you have configured Twilio integration in the ElevenLabs dashboard, or use the correct Agent ID.');
            }

            throw new Error(`ElevenLabs call failed: ${error.response?.data?.detail || error.message}`);
        }
    }

    formatPhoneNumber(phoneNumber) {
        // Strip everything except digits and +
        let cleaned = phoneNumber.replace(/[^0-9+]/g, '');

        if (cleaned.length === 10) {
            // If starts with 6-9, assume India +91
            if (/^[6-9]/.test(cleaned)) return '+91' + cleaned;
            // If starts with 2-9, assume US +1
            return '+1' + cleaned;
        }

        if (!cleaned.startsWith('+')) {
            return '+' + cleaned;
        }

        return cleaned;
    }

    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.substring(0, 4) + '***' + phoneNumber.substring(phoneNumber.length - 2);
    }
}

module.exports = new ElevenLabsClient();
