/**
 * API Key Authentication Middleware
 * Validates requests using API key in header or query parameter
 */

const logger = require('../utils/logger');

// Load API key from environment
const VALID_API_KEY = process.env.API_KEY || null;

/**
 * Middleware to validate API key
 * Supports both header and query parameter
 */
function validateApiKey(req, res, next) {
    // Skip if API_KEY not configured (development mode)
    if (!VALID_API_KEY) {
        logger.warn('API_KEY not configured - skipping authentication (DEVELOPMENT ONLY)');
        return next();
    }

    // Get API key from header or query parameter
    const apiKey = req.headers['x-api-key'] || req.query.api_key;

    if (!apiKey) {
        logger.warn('API key missing', {
            ip: req.ip,
            path: req.path
        });

        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'API key is required. Provide it in X-API-Key header or api_key query parameter.'
        });
    }

    // Validate API key
    if (apiKey !== VALID_API_KEY) {
        logger.warn('Invalid API key attempt', {
            ip: req.ip,
            path: req.path,
            providedKey: apiKey.substring(0, 8) + '...'  // Log partial key for debugging
        });

        return res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Invalid API key'
        });
    }

    // API key valid, proceed
    logger.debug('API key validated successfully');
    next();
}

/**
 * Optional: Signature-based validation for webhooks
 * Use this for webhook endpoints that provide signatures (e.g., Meta, Stripe)
 * 
 * @param {string} secret - Webhook secret
 * @param {string} signatureHeader - Header name containing signature
 */
function validateWebhookSignature(secret, signatureHeader = 'x-hub-signature-256') {
    const crypto = require('crypto');

    return (req, res, next) => {
        const signature = req.headers[signatureHeader.toLowerCase()];

        if (!signature) {
            logger.warn('Webhook signature missing');
            return res.status(401).json({
                success: false,
                error: 'Signature required'
            });
        }

        // Calculate expected signature
        const payload = JSON.stringify(req.body);
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');

        // Compare signatures (timing-safe)
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
            logger.warn('Invalid webhook signature', { ip: req.ip });
            return res.status(403).json({
                success: false,
                error: 'Invalid signature'
            });
        }

        logger.debug('Webhook signature validated');
        next();
    };
}

module.exports = {
    validateApiKey,
    validateWebhookSignature
};
