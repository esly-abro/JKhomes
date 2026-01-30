/**
 * Custom Error Classes
 * Structured error handling for the application
 */

class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Validation failed') {
        super(message, 400);
    }
}

class ExternalServiceError extends AppError {
    constructor(service, originalError) {
        super(`External service error: ${service}`, 502);
        this.service = service;
        this.originalError = originalError;
    }
}

module.exports = {
    AppError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
    ExternalServiceError
};
