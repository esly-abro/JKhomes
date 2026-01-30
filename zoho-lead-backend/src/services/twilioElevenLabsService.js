/**
 * Twilio + ElevenLabs Integration Service
 * Handles outbound calls using Twilio and streams audio to/from ElevenLabs
 */

const twilio = require('twilio');
const axios = require('axios');
const WebSocket = require('ws');
const config = require('../config/config');
const logger = require('../utils/logger');

class TwilioElevenLabsService {
    constructor() {
        if (!config.twilio.accountSid || !config.twilio.authToken) {
            logger.warn('Twilio credentials not configured');
            this.client = null;
        } else {
            this.client = twilio(config.twilio.accountSid, config.twilio.authToken);
            logger.info('Twilio client initialized');
        }

        this.activeCalls = new Map(); // Store active WebSocket connections
    }

    async sendSms(toNumber, message) {
        if (!this.client) {
            logger.warn('Twilio client not initialized cannot send SMS');
            return false;
        }

        try {
            await this.client.messages.create({
                body: message,
                from: config.twilio.phoneNumber,
                to: toNumber
            });
            logger.info('SMS sent successfully', { to: this.maskPhoneNumber(toNumber) });
            return true;
        } catch (error) {
            logger.error('Failed to send SMS', { error: error.message });
            return false;
        }
    }

    /**
     * Initiate an outbound call via Twilio
     * @param {string} toNumber - Phone number to call
     * @param {object} options - Call options (leadId, leadName, etc.)
     */
    async makeCall(toNumber, options = {}) {
        if (!this.client) {
            throw new Error('Twilio client not initialized. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
        }

        const { leadId, leadName } = options;

        logger.info('Initiating Twilio call', {
            to: this.maskPhoneNumber(toNumber),
            from: config.twilio.phoneNumber,
            leadId
        });

        try {
            // Use Twilio Functions for TwiML generation (production-ready, no ngrok needed)
            const twimlUrl = `https://jk-9813.twil.io/elevenlabs-twiml?leadId=${leadId}&leadName=${encodeURIComponent(leadName || '')}&toNumber=${encodeURIComponent(toNumber)}`;

            const call = await this.client.calls.create({
                to: toNumber,
                from: config.twilio.phoneNumber,
                url: twimlUrl,
                statusCallback: `${process.env.SERVER_URL || 'http://localhost:3000'}/elevenlabs/status`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                statusCallbackMethod: 'POST'
            });

            logger.info('Twilio call initiated', {
                callSid: call.sid,
                status: call.status,
                to: this.maskPhoneNumber(toNumber)
            });

            return {
                success: true,
                callId: call.sid,
                status: call.status,
                data: {
                    sid: call.sid,
                    to: toNumber,
                    from: config.twilio.phoneNumber,
                    status: call.status
                }
            };

        } catch (error) {
            logger.error('Twilio call failed', {
                error: error.message,
                code: error.code,
                moreInfo: error.moreInfo
            });

            throw new Error(`Twilio call failed: ${error.message}`);
        }
    }

    /**
     * Generate TwiML by calling ElevenLabs register-call endpoint
     * @param {string} callSid - Twilio call SID
     * @param {object} metadata - Call metadata
     */
    async generateTwiML(callSid, metadata = {}) {
        try {
            logger.info('Calling ElevenLabs register-call endpoint', { callSid, metadata });

            // Call ElevenLabs register-call endpoint
            const response = await axios.post(
                'https://api.elevenlabs.io/v1/convai/register-call',
                {
                    agent_id: config.elevenLabs.agentId,
                    from_number: config.twilio.phoneNumber,
                    to_number: metadata.toNumber || '',
                    direction: 'outbound',
                    dynamic_variables: {
                        lead_id: metadata.leadId || 'unknown',
                        lead_name: metadata.leadName || 'unknown'
                    }
                },
                {
                    headers: {
                        'xi-api-key': config.elevenLabs.apiKey,
                        'Content-Type': 'application/json'
                    }
                }
            );

            logger.info('ElevenLabs register-call successful', { callSid });

            // ElevenLabs returns TwiML directly
            return response.data;

        } catch (error) {
            logger.error('ElevenLabs register-call failed', {
                error: error.message,
                response: error.response?.data
            });

            // Fallback TwiML in case of error
            const VoiceResponse = twilio.twiml.VoiceResponse;
            const fallbackResponse = new VoiceResponse();
            fallbackResponse.say('Sorry, there was an error connecting to the agent. Please try again later.');
            fallbackResponse.hangup();

            return fallbackResponse.toString();
        }
    }

    /**
     * Handle WebSocket connection for media streaming
     * This connects Twilio's audio stream to ElevenLabs
     */
    handleMediaStream(ws, metadata = {}) {
        const callSid = metadata.callSid || 'unknown';
        logger.info('Media stream connected', { callSid, metadata });

        let elevenLabsWs = null;
        let streamSid = null;

        // Connect to ElevenLabs WebSocket
        const elevenLabsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${config.elevenLabs.agentId}`;

        try {
            elevenLabsWs = new WebSocket(elevenLabsUrl, {
                headers: {
                    'xi-api-key': config.elevenLabs.apiKey
                }
            });

            elevenLabsWs.on('open', () => {
                logger.info('Connected to ElevenLabs WebSocket', { callSid });
            });

            elevenLabsWs.on('message', (data) => {
                // Forward audio from ElevenLabs to Twilio
                try {
                    const message = JSON.parse(data);

                    if (message.type === 'audio' && message.audio) {
                        // Send audio to Twilio
                        if (streamSid) {
                            ws.send(JSON.stringify({
                                event: 'media',
                                streamSid: streamSid,
                                media: {
                                    payload: message.audio
                                }
                            }));
                        }
                    }
                } catch (err) {
                    logger.error('Error processing ElevenLabs message', { error: err.message });
                }
            });

            elevenLabsWs.on('error', (error) => {
                logger.error('ElevenLabs WebSocket error', { error: error.message, callSid });
            });

            elevenLabsWs.on('close', () => {
                logger.info('ElevenLabs WebSocket closed', { callSid });
            });

        } catch (error) {
            logger.error('Failed to connect to ElevenLabs WebSocket', { error: error.message });
        }

        // Handle messages from Twilio
        ws.on('message', (message) => {
            try {
                const msg = JSON.parse(message);

                switch (msg.event) {
                    case 'start':
                        streamSid = msg.start.streamSid;
                        logger.info('Media stream started', { streamSid, callSid });
                        break;

                    case 'media':
                        // Forward audio from Twilio to ElevenLabs
                        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
                            elevenLabsWs.send(JSON.stringify({
                                type: 'audio',
                                audio: msg.media.payload
                            }));
                        }
                        break;

                    case 'stop':
                        logger.info('Media stream stopped', { streamSid, callSid });
                        if (elevenLabsWs) {
                            elevenLabsWs.close();
                        }
                        break;
                }
            } catch (err) {
                logger.error('Error processing Twilio message', { error: err.message });
            }
        });

        ws.on('close', () => {
            logger.info('Twilio WebSocket closed', { callSid });
            if (elevenLabsWs) {
                elevenLabsWs.close();
            }
            this.activeCalls.delete(callSid);
        });

        ws.on('error', (error) => {
            logger.error('Twilio WebSocket error', { error: error.message, callSid });
        });

        this.activeCalls.set(callSid, { twilioWs: ws, elevenLabsWs });
    }

    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.substring(0, 4) + '***' + phoneNumber.substring(phoneNumber.length - 2);
    }
}

module.exports = new TwilioElevenLabsService();
