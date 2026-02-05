/**
 * Structured Logger
 * Winston-based logging with file rotation and structured output
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logDir = process.env.LOG_FILE_PATH || './logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        
        // Add metadata if present (but not too much)
        const metaKeys = Object.keys(meta);
        if (metaKeys.length > 0 && metaKeys.length <= 5) {
            const metaStr = metaKeys.map(k => `${k}=${JSON.stringify(meta[k])}`).join(' ');
            msg += ` | ${metaStr}`;
        } else if (metaKeys.length > 5) {
            msg += ` | ${JSON.stringify(meta)}`;
        }
        
        return msg;
    })
);

// JSON format for file output
const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Determine log level
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create logger instance
const logger = winston.createLogger({
    level: logLevel,
    format: fileFormat,
    defaultMeta: { 
        service: 'jk-construction-api',
        environment: process.env.NODE_ENV || 'development'
    },
    transports: [
        // Console transport (always)
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.NODE_ENV === 'test' ? 'error' : logLevel
        }),
        
        // Error log file
        new winston.transports.File({ 
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 5,
            tailable: true
        }),
        
        // Combined log file
        new winston.transports.File({ 
            filename: path.join(logDir, 'combined.log'),
            maxsize: 20 * 1024 * 1024, // 20MB
            maxFiles: 5,
            tailable: true
        })
    ],
    
    // Don't exit on handled exceptions
    exitOnError: false
});

// Add HTTP transport for request logging
logger.add(new winston.transports.File({
    filename: path.join(logDir, 'http.log'),
    level: 'http',
    maxsize: 20 * 1024 * 1024,
    maxFiles: 3,
    tailable: true
}));

/**
 * Create HTTP request logger middleware (Fastify compatible)
 */
function createRequestLogger() {
    return (req, res, next) => {
        const startTime = Date.now();
        
        // Generate request ID if not present
        if (!req.id) {
            req.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // Add request ID to response headers
        res.setHeader('X-Request-ID', req.id);
        
        // Log incoming request
        logger.http('Incoming request', {
            requestId: req.id,
            method: req.method,
            path: req.url || req.path,
            query: req.query,
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers?.['user-agent'],
            userId: req.user?.id || req.user?._id
        });
        
        // Log response when finished
        const originalEnd = res.end;
        res.end = function(...args) {
            const duration = Date.now() - startTime;
            const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
            
            logger.log(logLevel, 'Request completed', {
                requestId: req.id,
                method: req.method,
                path: req.url || req.path,
                statusCode: res.statusCode,
                duration,
                userId: req.user?.id || req.user?._id
            });
            
            // Alert on slow requests
            if (duration > 3000) {
                logger.warn('Slow request detected', {
                    requestId: req.id,
                    path: req.url || req.path,
                    duration
                });
            }
            
            originalEnd.apply(res, args);
        };
        
        if (next) next();
    };
}

/**
 * Create Fastify-compatible request logger hook
 */
function createFastifyRequestLogger(fastify) {
    fastify.addHook('onRequest', async (request, reply) => {
        request.startTime = Date.now();
        
        // Generate request ID if not present
        if (!request.id) {
            request.id = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        reply.header('X-Request-ID', request.id);
        
        logger.http('Incoming request', {
            requestId: request.id,
            method: request.method,
            path: request.url,
            query: request.query,
            ip: request.ip,
            userAgent: request.headers['user-agent'],
            userId: request.user?.id || request.user?._id
        });
    });
    
    fastify.addHook('onResponse', async (request, reply) => {
        const duration = Date.now() - (request.startTime || Date.now());
        const logLevel = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'http';
        
        logger.log(logLevel, 'Request completed', {
            requestId: request.id,
            method: request.method,
            path: request.url,
            statusCode: reply.statusCode,
            duration,
            userId: request.user?.id || request.user?._id
        });
        
        if (duration > 3000) {
            logger.warn('Slow request detected', {
                requestId: request.id,
                path: request.url,
                duration
            });
        }
    });
}

/**
 * Log with context helper
 */
function logWithContext(level, message, context = {}) {
    logger.log(level, message, {
        ...context,
        timestamp: new Date().toISOString()
    });
}

/**
 * Create child logger with default context
 */
function createChildLogger(defaultContext) {
    return {
        info: (message, context = {}) => logger.info(message, { ...defaultContext, ...context }),
        warn: (message, context = {}) => logger.warn(message, { ...defaultContext, ...context }),
        error: (message, context = {}) => logger.error(message, { ...defaultContext, ...context }),
        debug: (message, context = {}) => logger.debug(message, { ...defaultContext, ...context }),
        http: (message, context = {}) => logger.http(message, { ...defaultContext, ...context })
    };
}

// Export logger and helpers
module.exports = logger;
module.exports.logger = logger;
module.exports.createRequestLogger = createRequestLogger;
module.exports.createFastifyRequestLogger = createFastifyRequestLogger;
module.exports.logWithContext = logWithContext;
module.exports.createChildLogger = createChildLogger;
