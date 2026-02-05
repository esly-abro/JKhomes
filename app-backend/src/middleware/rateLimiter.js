/**
 * Rate Limiting Middleware
 * Protects API from abuse and controls costs
 */

const { RateLimitError } = require('../errors/AppError');
const logger = require('../utils/logger');

// In-memory store for rate limiting (use Redis in production)
const rateLimitStore = new Map();

// Clean up expired entries every minute
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (data.resetTime < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000);

/**
 * Create a rate limiter with specified options
 * Returns a Fastify-compatible async hook
 */
function createRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000,  // 15 minutes
        max = 100,                    // 100 requests per window
        message = 'Too many requests',
        keyGenerator = (request) => request.ip || 'unknown',
        skip = () => false,
        onLimitReached = null
    } = options;

    // Return async function for Fastify
    return async (request, reply) => {
        // Skip if configured
        if (skip(request)) {
            return;
        }

        const key = `rl:${keyGenerator(request)}`;
        const now = Date.now();
        
        let record = rateLimitStore.get(key);
        
        if (!record || record.resetTime < now) {
            // Create new record
            record = {
                count: 1,
                resetTime: now + windowMs
            };
            rateLimitStore.set(key, record);
        } else {
            record.count++;
        }

        // Set rate limit headers
        const remaining = Math.max(0, max - record.count);
        const resetTime = Math.ceil(record.resetTime / 1000);
        
        reply.header('X-RateLimit-Limit', String(max));
        reply.header('X-RateLimit-Remaining', String(remaining));
        reply.header('X-RateLimit-Reset', String(resetTime));

        if (record.count > max) {
            const retryAfter = Math.ceil((record.resetTime - now) / 1000);
            reply.header('Retry-After', String(retryAfter));

            if (onLimitReached) {
                onLimitReached(request, reply);
            }

            logger.warn('Rate limit exceeded', {
                ip: request.ip,
                path: request.url,
                userId: request.user?.id,
                count: record.count,
                max
            });

            throw new RateLimitError(message, retryAfter);
        }
    };
}

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const apiLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many API requests, please try again later',
    skip: (request) => {
        // Skip health checks - use url for Fastify
        const path = request.url?.split('?')[0] || '';
        return path === '/health' || path === '/ready' || path === '/api/health';
    }
});

/**
 * Authentication rate limiter
 * 5 attempts per 15 minutes per IP
 */
const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again in 15 minutes',
    keyGenerator: (request) => `auth:${request.ip}`
});

/**
 * Voice call rate limiter
 * 10 calls per hour per user/IP (expensive operation)
 */
const voiceCallLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,  // 1 hour
    max: parseInt(process.env.RATE_LIMIT_VOICE_MAX_PER_HOUR, 10) || 10,
    message: 'Voice call limit exceeded, please try again later',
    keyGenerator: (request) => `voice:${request.user?.id || request.ip}`
});

/**
 * Zoho sync rate limiter
 * 50 requests per minute (Zoho API limits)
 */
const zohoSyncLimiter = createRateLimiter({
    windowMs: 60 * 1000,  // 1 minute
    max: parseInt(process.env.ZOHO_RATE_LIMIT_PER_MINUTE, 10) || 50,
    message: 'Zoho API rate limit exceeded',
    keyGenerator: () => 'zoho:global'
});

/**
 * WhatsApp rate limiter
 * 100 messages per minute
 */
const whatsappLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 100,
    message: 'WhatsApp message limit exceeded',
    keyGenerator: (request) => `whatsapp:${request.user?.id || 'global'}`
});

/**
 * File upload rate limiter
 * 20 uploads per hour per user
 */
const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: 'Upload limit exceeded, please try again later',
    keyGenerator: (request) => `upload:${request.user?.id || request.ip}`
});

/**
 * Strict limiter for sensitive operations
 * 3 attempts per 5 minutes
 */
const strictLimiter = createRateLimiter({
    windowMs: 5 * 60 * 1000,
    max: 3,
    message: 'Too many attempts, please wait before trying again',
    keyGenerator: (request) => `strict:${request.ip}`
});

/**
 * Create a per-user rate limiter
 */
function createUserLimiter(windowMs, max, message = 'Rate limit exceeded') {
    return createRateLimiter({
        windowMs,
        max,
        message,
        keyGenerator: (request) => {
            if (!request.user?.id && !request.user?._id) {
                throw new Error('User rate limiter requires authentication');
            }
            return `user:${request.user.id || request.user._id}`;
        }
    });
}

/**
 * Fastify rate limiter plugin helper
 */
function createFastifyRateLimiter(fastify, options = {}) {
    const limiter = createRateLimiter(options);
    
    fastify.addHook('onRequest', async (request, reply) => {
        return new Promise((resolve, reject) => {
            // Create Express-compatible req/res objects
            const req = {
                ip: request.ip,
                path: request.url,
                user: request.user,
                connection: request.raw.connection
            };
            const res = {
                setHeader: (name, value) => reply.header(name, value)
            };
            
            limiter(req, res, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    });
}

module.exports = {
    createRateLimiter,
    apiLimiter,
    authLimiter,
    voiceCallLimiter,
    zohoSyncLimiter,
    whatsappLimiter,
    uploadLimiter,
    strictLimiter,
    createUserLimiter,
    createFastifyRateLimiter
};
