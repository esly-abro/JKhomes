/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent error responses
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    // Log the error
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        body: req.body
    });

    // Determine status code
    const statusCode = err.status || err.statusCode || 500;

    // Build error response
    const errorResponse = {
        success: false,
        error: err.message || 'Internal server error',
        code: err.code || 'INTERNAL_ERROR'
    };

    // Add details in development mode
    if (process.env.NODE_ENV === 'development') {
        errorResponse.details = err.details || null;
        errorResponse.stack = err.stack;
    }

    // Send error response
    res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;
