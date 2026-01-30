/**
 * Request Logger Middleware
 * Logs all incoming HTTP requests
 */

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
    const start = Date.now();

    // Log request
    logger.info(`${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });

    // Log response when finished
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    });

    next();
}

module.exports = requestLogger;
