/**
 * Custom Error Classes
 * Provides structured error handling across the application
 */

/**
 * Base Application Error
 */
class AppError extends Error {
    constructor(message, statusCode, errorCode, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            error: {
                code: this.errorCode,
                message: this.message,
                timestamp: this.timestamp
            }
        };
    }
}

/**
 * Validation Error (400)
 * Used for input validation failures
 */
class ValidationError extends AppError {
    constructor(message, details = []) {
        super(message, 400, 'VALIDATION_ERROR');
        this.details = details;
    }

    toJSON() {
        return {
            error: {
                code: this.errorCode,
                message: this.message,
                details: this.details,
                timestamp: this.timestamp
            }
        };
    }
}

/**
 * Bad Request Error (400)
 * Used for malformed requests
 */
class BadRequestError extends AppError {
    constructor(message = 'Bad request') {
        super(message, 400, 'BAD_REQUEST');
    }
}

/**
 * Unauthorized Error (401)
 * Used when authentication is required but not provided
 */
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'UNAUTHORIZED');
    }
}

/**
 * Invalid Token Error (401)
 * Used for invalid or expired tokens
 */
class InvalidTokenError extends AppError {
    constructor(message = 'Invalid or expired token') {
        super(message, 401, 'INVALID_TOKEN');
    }
}

/**
 * Forbidden Error (403)
 * Used when user lacks permission for an action
 */
class ForbiddenError extends AppError {
    constructor(message = 'Access forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}

/**
 * Not Found Error (404)
 * Used when a requested resource doesn't exist
 */
class NotFoundError extends AppError {
    constructor(resource = 'Resource') {
        super(`${resource} not found`, 404, 'RESOURCE_NOT_FOUND');
        this.resource = resource;
    }
}

/**
 * Conflict Error (409)
 * Used for duplicate resources or state conflicts
 */
class ConflictError extends AppError {
    constructor(message, field = null) {
        super(message, 409, 'CONFLICT');
        this.field = field;
    }
}

/**
 * Unprocessable Entity Error (422)
 * Used when request is valid but cannot be processed
 */
class UnprocessableError extends AppError {
    constructor(message = 'Request cannot be processed') {
        super(message, 422, 'UNPROCESSABLE_ENTITY');
    }
}

/**
 * Rate Limit Error (429)
 * Used when rate limit is exceeded
 */
class RateLimitError extends AppError {
    constructor(message = 'Too many requests', retryAfter = 60) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
        this.retryAfter = retryAfter;
    }

    toJSON() {
        return {
            error: {
                code: this.errorCode,
                message: this.message,
                retryAfter: this.retryAfter,
                timestamp: this.timestamp
            }
        };
    }
}

/**
 * External Service Error (502)
 * Used when an external API (Zoho, Twilio, etc.) fails
 */
class ExternalServiceError extends AppError {
    constructor(service, originalError) {
        super(`${service} service unavailable`, 502, 'EXTERNAL_SERVICE_ERROR');
        this.service = service;
        this.originalError = originalError?.message || 'Unknown error';
    }

    toJSON() {
        return {
            error: {
                code: this.errorCode,
                message: this.message,
                service: this.service,
                timestamp: this.timestamp
            }
        };
    }
}

/**
 * Service Unavailable Error (503)
 * Used when the service is temporarily unavailable
 */
class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable') {
        super(message, 503, 'SERVICE_UNAVAILABLE');
    }
}

/**
 * Internal Server Error (500)
 * Used for unexpected server errors
 */
class InternalError extends AppError {
    constructor(message = 'Internal server error') {
        super(message, 500, 'INTERNAL_ERROR', false);
    }
}

/**
 * Database Error (500)
 * Used for database operation failures
 */
class DatabaseError extends AppError {
    constructor(operation, originalError) {
        super(`Database ${operation} failed`, 500, 'DATABASE_ERROR', false);
        this.operation = operation;
        this.originalError = originalError?.message;
    }
}

/**
 * Configuration Error
 * Used for missing or invalid configuration
 */
class ConfigurationError extends AppError {
    constructor(message) {
        super(message, 500, 'CONFIGURATION_ERROR', false);
    }
}

module.exports = {
    AppError,
    ValidationError,
    BadRequestError,
    UnauthorizedError,
    InvalidTokenError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    UnprocessableError,
    RateLimitError,
    ExternalServiceError,
    ServiceUnavailableError,
    InternalError,
    DatabaseError,
    ConfigurationError
};
