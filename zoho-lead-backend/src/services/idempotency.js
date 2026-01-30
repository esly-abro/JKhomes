/**
 * Idempotency Service
 * Prevents duplicate lead creation from repeated webhook calls
 * 
 * Uses idempotency keys to detect and handle retries
 */

const logger = require('../utils/logger');

// In-memory cache (use Redis in production for multi-instance deployments)
const processedRequests = new Map();

// Configuration
const IDEMPOTENCY_TTL = 24 * 60 * 60 * 1000;  // 24 hours
const MAX_CACHE_SIZE = 10000;  // Prevent memory overflow

class IdempotencyService {
    /**
     * Check if request was already processed
     * 
     * @param {string} idempotencyKey - Unique identifier for this request
     * @returns {Object|null} Previous response if found, null if new
     */
    checkIdempotency(idempotencyKey) {
        if (!idempotencyKey) return null;

        const cached = processedRequests.get(idempotencyKey);

        if (cached) {
            const age = Date.now() - cached.timestamp;

            if (age < IDEMPOTENCY_TTL) {
                logger.info('Idempotent request detected', {
                    key: idempotencyKey.substring(0, 16) + '...',
                    age: `${Math.floor(age / 1000)}s`
                });
                return cached.response;
            } else {
                // Expired, remove it
                processedRequests.delete(idempotencyKey);
            }
        }

        return null;
    }

    /**
     * Store processed request response
     * 
     * @param {string} idempotencyKey - Unique identifier
     * @param {Object} response - Response to cache
     */
    storeResponse(idempotencyKey, response) {
        if (!idempotencyKey) return;

        // Prevent cache from growing indefinitely
        if (processedRequests.size >= MAX_CACHE_SIZE) {
            this.cleanup();
        }

        processedRequests.set(idempotencyKey, {
            response,
            timestamp: Date.now()
        });

        logger.debug('Stored idempotency response', {
            key: idempotencyKey.substring(0, 16) + '...'
        });
    }

    /**
     * Generate idempotency key from request data
     * Use this when client doesn't provide one
     * 
     * @param {Object} leadData - Lead data
     * @returns {string} Hash of the data
     */
    generateKey(leadData) {
        const crypto = require('crypto');

        // Create deterministic key from critical fields
        const keyData = {
            email: leadData.email?.toLowerCase().trim(),
            phone: this._normalizePhone(leadData.phone),
            source: leadData.source,
            timestamp: this._roundToMinute(Date.now())  // Round to minute to group rapid requests
        };

        const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify(keyData))
            .digest('hex');

        return `auto_${hash.substring(0, 32)}`;
    }

    /**
     * Cleanup expired entries
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;

        for (const [key, value] of processedRequests.entries()) {
            if (now - value.timestamp > IDEMPOTENCY_TTL) {
                processedRequests.delete(key);
                removed++;
            }
        }

        logger.info(`Idempotency cache cleanup: removed ${removed} expired entries`);
    }

    /**
     * Helper: Normalize phone for consistent hashing
     */
    _normalizePhone(phone) {
        if (!phone) return null;
        return phone.replace(/[^\d+]/g, '');
    }

    /**
     * Helper: Round timestamp to nearest minute
     */
    _roundToMinute(timestamp) {
        return Math.floor(timestamp / 60000) * 60000;
    }

    /**
     * Get cache stats
     */
    getStats() {
        return {
            size: processedRequests.size,
            maxSize: MAX_CACHE_SIZE,
            ttl: IDEMPOTENCY_TTL
        };
    }

    /**
     * Clear entire cache (for testing)
     */
    clear() {
        processedRequests.clear();
        logger.warn('Idempotency cache cleared');
    }
}

// Auto-cleanup every hour
setInterval(() => {
    const service = new IdempotencyService();
    service.cleanup();
}, 60 * 60 * 1000);

module.exports = new IdempotencyService();
