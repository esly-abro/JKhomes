/**
 * Call Scheduler Service
 * Manages delayed calling with retry logic
 */

const voiceClient = require('./elevenLabsClient');
const config = require('../config/config');
const logger = require('../utils/logger');

class CallScheduler {
    constructor() {
        this.pendingCalls = new Map(); // Store pending timeouts
        this.callHistory = new Map(); // Track call attempts
        this.isShuttingDown = false;

        // Configuration
        this.callDelayMs = 2000; // 2 second delay before calling
        this.maxRetries = 3; // Maximum retry attempts

        logger.info('Call scheduler initialized', {
            provider: 'elevenlabs',
            delayMs: this.callDelayMs,
            maxRetries: this.maxRetries
        });
    }

    /**
     * Schedule a call to a lead
     * @param {string} phoneNumber - Lead's phone number
     * @param {object} leadData - Lead information for logging
     * @param {object} options - Call options
     */
    scheduleCall(phoneNumber, leadData = {}, options = {}) {
        // Check if ElevenLabs is configured (API Key + Agent)
        // Note: phoneNumberId is optional if using Twilio integration
        const isElevenLabsEnabled = config.elevenLabs.apiKey && config.elevenLabs.agentId;

        if (!isElevenLabsEnabled) {
            logger.info('Call scheduling skipped - ElevenLabs API Key or Agent ID missing');
            return;
        }

        if (!phoneNumber) {
            logger.warn('Cannot schedule call - no phone number provided', leadData);
            return;
        }

        if (this.isShuttingDown) {
            logger.warn('Cannot schedule call - service is shutting down');
            return;
        }

        const callId = this.generateCallId(phoneNumber, leadData);
        const delay = options.delay || this.callDelayMs;

        logger.info('Scheduling call', {
            callId,
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            leadName: leadData.name,
            leadId: leadData.leadId,
            delayMs: delay,
            scheduledFor: new Date(Date.now() + delay).toISOString()
        });

        // Initialize call history
        if (!this.callHistory.has(callId)) {
            this.callHistory.set(callId, {
                phoneNumber,
                leadData,
                attempts: 0,
                lastAttempt: null,
                status: 'pending'
            });
        }

        // Schedule the call
        const timeoutId = setTimeout(() => {
            this.executeCall(callId, phoneNumber, leadData, options);
        }, delay);

        // Store timeout reference
        this.pendingCalls.set(callId, timeoutId);
    }

    /**
     * Execute the actual call
     * @private
     */
    async executeCall(callId, phoneNumber, leadData, options) {
        const history = this.callHistory.get(callId);

        if (!history) {
            logger.error('Call history not found', { callId });
            return;
        }

        history.attempts += 1;
        history.lastAttempt = new Date();

        logger.info('Executing call', {
            callId,
            attempt: history.attempts,
            maxRetries: this.maxRetries,
            phoneNumber: this.maskPhoneNumber(phoneNumber),
            leadName: leadData.name
        });

        try {
            // Prepare Call options with lead metadata
            const callOptions = {
                leadId: leadData.leadId,
                leadName: leadData.name,
                metadata: {
                    callId: callId,
                    source: 'call_scheduler',
                    ...options.metadata
                },
                ...options
            };

            // Use TwilioElevenLabs to make the call
            // We use the service that integrates Twilio + ElevenLabs
            const twilioService = require('./twilioElevenLabsService');
            const result = await twilioService.makeCall(phoneNumber, callOptions);

            if (result.success) {
                logger.info('Call initiated successfully', {
                    callId,
                    callSid: result.callSid,
                    phoneNumber: this.maskPhoneNumber(phoneNumber),
                    leadName: leadData.name
                });

                history.status = 'success';
                history.callSid = result.callSid;
                history.result = result;

                // Clean up
                this.pendingCalls.delete(callId);
            }
            // Twilio calls don't usually return 'skipped' synchronously, but if they do:
            else if (result.skipped) {
                logger.info('Call skipped', { callId, reason: result.reason });
                history.status = 'skipped';
                this.pendingCalls.delete(callId);
            }

        } catch (error) {
            logger.error('Call execution failed', {
                callId,
                attempt: history.attempts,
                error: error.message,
                phoneNumber: this.maskPhoneNumber(phoneNumber)
            });

            history.status = 'failed';
            history.lastError = error.message;

            // Retry logic
            if (history.attempts < this.maxRetries) {
                const retryDelay = this.calculateRetryDelay(history.attempts);

                logger.info('Scheduling retry', {
                    callId,
                    attempt: history.attempts + 1,
                    retryDelayMs: retryDelay
                });

                // Schedule retry
                const timeoutId = setTimeout(() => {
                    this.executeCall(callId, phoneNumber, leadData, options);
                }, retryDelay);

                this.pendingCalls.set(callId, timeoutId);
            } else {
                logger.error('Max retries reached, giving up', {
                    callId,
                    attempts: history.attempts
                });
                this.pendingCalls.delete(callId);
            }
        }
    }

    /**
     * Calculate exponential backoff delay for retries
     * @private
     */
    calculateRetryDelay(attemptNumber) {
        // Exponential backoff: 2s, 4s, 8s...
        return Math.min(2000 * Math.pow(2, attemptNumber - 1), 30000);
    }

    /**
     * Generate unique call ID
     * @private
     */
    generateCallId(phoneNumber, leadData) {
        const timestamp = Date.now();
        const leadId = leadData.leadId || 'unknown';
        return `call_${leadId}_${timestamp}`;
    }

    /**
     * Mask phone number for logging (privacy)
     * @private
     */
    maskPhoneNumber(phoneNumber) {
        if (!phoneNumber || phoneNumber.length < 4) return '***';
        return phoneNumber.substring(0, 3) + '***' + phoneNumber.substring(phoneNumber.length - 2);
    }

    /**
     * Get call status
     */
    getCallStatus(callId) {
        return this.callHistory.get(callId);
    }

    /**
     * Get all pending calls
     */
    getPendingCalls() {
        return Array.from(this.pendingCalls.keys());
    }

    /**
     * Cancel a scheduled call
     */
    cancelCall(callId) {
        const timeoutId = this.pendingCalls.get(callId);
        if (timeoutId) {
            clearTimeout(timeoutId);
            this.pendingCalls.delete(callId);

            const history = this.callHistory.get(callId);
            if (history) {
                history.status = 'cancelled';
            }

            logger.info('Call cancelled', { callId });
            return true;
        }
        return false;
    }

    /**
     * Graceful shutdown - cancel all pending calls
     */
    async shutdown() {
        logger.info('Shutting down call scheduler', {
            pendingCalls: this.pendingCalls.size
        });

        this.isShuttingDown = true;

        // Clear all pending timeouts
        for (const [callId, timeoutId] of this.pendingCalls) {
            clearTimeout(timeoutId);
            logger.info('Cancelled pending call during shutdown', { callId });
        }

        this.pendingCalls.clear();
        logger.info('Call scheduler shutdown complete');
    }

    /**
     * Get statistics
     */
    getStats() {
        const stats = {
            pending: this.pendingCalls.size,
            total: this.callHistory.size,
            byStatus: {
                pending: 0,
                success: 0,
                failed: 0,
                skipped: 0,
                cancelled: 0
            }
        };

        for (const history of this.callHistory.values()) {
            stats.byStatus[history.status] = (stats.byStatus[history.status] || 0) + 1;
        }

        return stats;
    }
}

// Export singleton instance
module.exports = new CallScheduler();
