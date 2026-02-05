/**
 * Security Middleware
 * Provides security headers, CORS, and request sanitization
 */

const config = require('../config/env');

/**
 * Security headers middleware
 * Similar to Helmet for Express
 */
function securityHeaders(req, res, next) {
    // X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // X-Frame-Options
    res.setHeader('X-Frame-Options', 'DENY');
    
    // X-XSS-Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Strict-Transport-Security (HSTS)
    if (config.isProduction) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    // Content-Security-Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
    
    // Referrer-Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions-Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    // Remove X-Powered-By
    res.removeHeader('X-Powered-By');
    
    if (next) next();
}

/**
 * CORS middleware
 */
function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    
    // Handle both string and array origins
    let allowedOrigins;
    if (Array.isArray(config.cors.origin)) {
        allowedOrigins = config.cors.origin;
    } else if (typeof config.cors.origin === 'string') {
        allowedOrigins = config.cors.origin.split(',').map(o => o.trim());
    } else {
        allowedOrigins = ['*'];
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    if (config.cors.credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }
    
    if (next) next();
}

/**
 * Sanitize request data to prevent NoSQL injection
 */
function sanitizeData(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeData(item));
    }
    
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const key of Object.keys(obj)) {
            // Remove keys starting with $ (MongoDB operators)
            if (key.startsWith('$')) {
                continue;
            }
            // Remove keys containing . (nested operators)
            if (key.includes('.')) {
                continue;
            }
            sanitized[key] = sanitizeData(obj[key]);
        }
        return sanitized;
    }
    
    // Remove $ from string values
    if (typeof obj === 'string') {
        return obj.replace(/\$/g, '');
    }
    
    return obj;
}

/**
 * NoSQL injection protection middleware
 */
function noSqlInjectionProtection(req, res, next) {
    if (req.body) {
        req.body = sanitizeData(req.body);
    }
    if (req.query) {
        req.query = sanitizeData(req.query);
    }
    if (req.params) {
        req.params = sanitizeData(req.params);
    }
    if (next) next();
}

/**
 * HTTP Parameter Pollution protection
 * Converts array parameters to single values
 */
function hppProtection(whitelist = []) {
    return (req, res, next) => {
        if (req.query) {
            for (const key of Object.keys(req.query)) {
                if (Array.isArray(req.query[key]) && !whitelist.includes(key)) {
                    // Take the last value (or first, depending on preference)
                    req.query[key] = req.query[key][req.query[key].length - 1];
                }
            }
        }
        if (next) next();
    };
}

/**
 * Add request ID for tracing
 */
function addRequestId(req, res, next) {
    if (!req.id) {
        req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    res.setHeader('X-Request-ID', req.id);
    if (next) next();
}

/**
 * Request timeout middleware
 */
function requestTimeout(timeoutMs = 30000) {
    return (req, res, next) => {
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                res.statusCode = 408;
                res.json({
                    error: {
                        code: 'REQUEST_TIMEOUT',
                        message: 'Request timeout',
                        requestId: req.id
                    }
                });
            }
        }, timeoutMs);
        
        res.on('finish', () => clearTimeout(timeout));
        res.on('close', () => clearTimeout(timeout));
        
        if (next) next();
    };
}

/**
 * IP whitelist middleware
 */
function ipWhitelist(allowedIPs = []) {
    return (req, res, next) => {
        if (allowedIPs.length === 0) {
            return next();
        }
        
        const clientIP = req.ip || req.connection?.remoteAddress;
        
        if (!allowedIPs.includes(clientIP)) {
            res.statusCode = 403;
            return res.json({
                error: {
                    code: 'IP_NOT_ALLOWED',
                    message: 'Access denied',
                    requestId: req.id
                }
            });
        }
        
        if (next) next();
    };
}

/**
 * Setup all security middleware for Express app
 */
function setupExpressSecurity(app) {
    app.use(addRequestId);
    app.use(securityHeaders);
    app.use(corsMiddleware);
    app.use(noSqlInjectionProtection);
    app.use(hppProtection(['status', 'sort', 'page', 'limit', 'fields']));
    app.use(requestTimeout(30000));
    app.disable('x-powered-by');
}

/**
 * Setup security for Fastify
 */
function setupFastifySecurity(fastify) {
    // Add request ID hook
    fastify.addHook('onRequest', async (request, reply) => {
        if (!request.id) {
            request.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        reply.header('X-Request-ID', request.id);
    });
    
    // Security headers hook
    fastify.addHook('onSend', async (request, reply, payload) => {
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        
        if (config.isProduction) {
            reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        
        return payload;
    });
    
    // Sanitization hook
    fastify.addHook('preValidation', async (request, reply) => {
        if (request.body) {
            request.body = sanitizeData(request.body);
        }
        if (request.query) {
            request.query = sanitizeData(request.query);
        }
    });
}

module.exports = {
    securityHeaders,
    corsMiddleware,
    sanitizeData,
    noSqlInjectionProtection,
    hppProtection,
    addRequestId,
    requestTimeout,
    ipWhitelist,
    setupExpressSecurity,
    setupFastifySecurity
};
