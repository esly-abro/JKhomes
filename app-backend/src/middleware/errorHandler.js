/**
 * Centralized Error Handler Middleware
 * Handles all errors and formats consistent responses
 */

const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');

/**
 * Sanitize request body to remove sensitive data from logs
 */
function sanitizeBody(body) {
    if (!body) return body;
    
    const sanitized = { ...body };
    const sensitiveFields = [
        'password', 'token', 'apiKey', 'secret', 
        'creditCard', 'ssn', 'accessToken', 'refreshToken',
        'authToken', 'apiSecret', 'privateKey'
    ];
    
    sensitiveFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '***REDACTED***';
        }
    });
    
    // Deep sanitize nested objects
    Object.keys(sanitized).forEach(key => {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeBody(sanitized[key]);
        }
    });
    
    return sanitized;
}

/**
 * Main error handler middleware
 */
function errorHandler(err, req, res, next) {
    // Default values
    let statusCode = err.statusCode || 500;
    let errorCode = err.errorCode || 'INTERNAL_ERROR';
    let message = err.message || 'Internal server error';
    let isOperational = err.isOperational !== undefined ? err.isOperational : false;

    // Handle Mongoose validation errors
    if (err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = 'Validation failed';
        const details = Object.keys(err.errors).map(field => ({
            field,
            message: err.errors[field].message
        }));
        err.details = details;
        isOperational = true;
    }

    // Handle Mongoose CastError (invalid ObjectId)
    if (err.name === 'CastError') {
        statusCode = 400;
        errorCode = 'INVALID_ID';
        message = `Invalid ${err.path}: ${err.value}`;
        isOperational = true;
    }

    // Handle Mongoose duplicate key error
    if (err.code === 11000) {
        statusCode = 409;
        errorCode = 'DUPLICATE_KEY';
        const field = Object.keys(err.keyPattern || {})[0];
        message = `Duplicate value for field: ${field}`;
        err.field = field;
        isOperational = true;
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        errorCode = 'INVALID_TOKEN';
        message = 'Invalid token';
        isOperational = true;
    }

    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        errorCode = 'TOKEN_EXPIRED';
        message = 'Token has expired';
        isOperational = true;
    }

    // Handle syntax errors in JSON body
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        statusCode = 400;
        errorCode = 'INVALID_JSON';
        message = 'Invalid JSON in request body';
        isOperational = true;
    }

    // Build error log context
    const errorLog = {
        message: err.message,
        stack: err.stack,
        errorCode,
        statusCode,
        requestId: req.id,
        method: req.method,
        path: req.path,
        query: req.query,
        body: sanitizeBody(req.body),
        userId: req.user?.id || req.user?._id,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString()
    };

    // Log based on severity
    if (statusCode >= 500) {
        logger.error('Server error', errorLog);
    } else if (statusCode >= 400) {
        logger.warn('Client error', errorLog);
    }

    // Don't leak error details in production
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Build response
    const response = {
        error: {
            code: errorCode,
            message: isOperational ? message : (isProduction ? 'Internal server error' : message),
            requestId: req.id,
            timestamp: new Date().toISOString()
        }
    };

    // Add validation details if present
    if (err.details && Array.isArray(err.details)) {
        response.error.details = err.details;
    }

    // Add field info for conflict errors
    if (err.field) {
        response.error.field = err.field;
    }

    // Add retry-after for rate limit errors
    if (err.retryAfter) {
        response.error.retryAfter = err.retryAfter;
        res.set('Retry-After', err.retryAfter);
    }

    // Include stack trace in development
    if (!isProduction && err.stack) {
        response.error.stack = err.stack.split('\n').slice(0, 10);
    }

    res.status(statusCode).json(response);
}

/**
 * Handle 404 errors (unmatched routes)
 */
function notFoundHandler(req, res, next) {
    const error = new AppError(
        `Route ${req.method} ${req.path} not found`,
        404,
        'ROUTE_NOT_FOUND'
    );
    next(error);
}

/**
 * Async handler wrapper to catch promise rejections
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Wrap all controller methods with async handler
 */
function wrapController(controller) {
    const wrapped = {};
    Object.keys(controller).forEach(key => {
        if (typeof controller[key] === 'function') {
            wrapped[key] = asyncHandler(controller[key]);
        } else {
            wrapped[key] = controller[key];
        }
    });
    return wrapped;
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    wrapController,
    sanitizeBody
};
