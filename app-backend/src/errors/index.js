/**
 * Errors Index
 * Export all error classes
 */

const {
    AppError,
    ValidationError,
    BadRequestError,
    UnauthorizedError,
    InvalidTokenError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ZohoError,
    TwilioError,
    ElevenLabsError,
    WhatsAppError
} = require('./AppError');

module.exports = {
    AppError,
    ValidationError,
    BadRequestError,
    UnauthorizedError,
    InvalidTokenError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    ExternalServiceError,
    DatabaseError,
    ZohoError,
    TwilioError,
    ElevenLabsError,
    WhatsAppError
};
