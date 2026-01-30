/**
 * Rate Limiting Middleware
 * Protects against API abuse and Zoho rate limits
 */

const logger = require('../utils/logger');

// In-memory store for rate limiting
// For production with multiple instances, use Redis
const requestCounts = new Map();

/**
 * Simple rate limiter
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 */
function rateLimiter(maxRequests = 100, windowMs = 60000) {
    return (req, res, next) => {
        const identifier = req.ip;  // Use IP as identifier
        const now = Date.now();

        // Get or initialize request log for this identifier
        if (!requestCounts.has(identifier)) {
            requestCounts.set(identifier, []);
        }

        const requests = requestCounts.get(identifier);

        // Remove expired entries
        const validRequests = requests.filter(timestamp => now - timestamp < windowMs);

        if (validRequests.length >= maxRequests) {
            logger.warn('Rate limit exceeded', {
                ip: identifier,
                count: validRequests.length,
                limit: maxRequests
            });

            return res.status(429).json({
                success: false,
                error: 'Too many requests',
                message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000} seconds.`,
                retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
            });
        }

        // Add current request
        validRequests.push(now);
        requestCounts.set(identifier, validRequests);

        // Clean up old entries periodically
        if (Math.random() < 0.01) {  // 1% chance
            cleanupExpiredEntries(windowMs);
        }

        next();
    };
}

/**
 * Cleanup expired rate limit entries
 */
function cleanupExpiredEntries(windowMs) {
    const now = Date.now();
    let cleaned = 0;

    for (const [identifier, requests] of requestCounts.entries()) {
        const validRequests = requests.filter(timestamp => now - timestamp < windowMs);

        if (validRequests.length === 0) {
            requestCounts.delete(identifier);
            cleaned++;
        } else if (validRequests.length < requests.length) {
            requestCounts.set(identifier, validRequests);
        }
    }

    if (cleaned > 0) {
        logger.debug(`Rate limiter cleanup: removed ${cleaned} expired entries`);
    }
}

module.exports = {
    rateLimiter
};
