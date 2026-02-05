/**
 * Validation Middleware
 * Validates request data against Zod schemas
 */

const { ValidationError } = require('../errors/AppError');
const logger = require('../utils/logger');

/**
 * Validate request against schema
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Express/Fastify middleware
 */
function validate(schema) {
    return async (req, res, next) => {
        try {
            const validated = await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params
            });

            // Replace request data with validated (and transformed) data
            if (validated.body) req.body = validated.body;
            if (validated.query) req.query = validated.query;
            if (validated.params) req.params = validated.params;

            next();
        } catch (error) {
            if (error.errors) {
                // Zod validation error
                const details = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    code: err.code
                }));

                logger.debug('Validation failed', {
                    path: req.path,
                    errors: details
                });

                return next(new ValidationError('Validation failed', details));
            }

            next(error);
        }
    };
}

/**
 * Validate just the body
 * @param {import('zod').ZodSchema} schema - Zod schema for body
 */
function validateBody(schema) {
    return async (req, res, next) => {
        try {
            req.body = await schema.parseAsync(req.body);
            next();
        } catch (error) {
            if (error.errors) {
                const details = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return next(new ValidationError('Validation failed', details));
            }
            next(error);
        }
    };
}

/**
 * Validate just the query params
 * @param {import('zod').ZodSchema} schema - Zod schema for query
 */
function validateQuery(schema) {
    return async (req, res, next) => {
        try {
            req.query = await schema.parseAsync(req.query);
            next();
        } catch (error) {
            if (error.errors) {
                const details = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return next(new ValidationError('Validation failed', details));
            }
            next(error);
        }
    };
}

/**
 * Validate just the params
 * @param {import('zod').ZodSchema} schema - Zod schema for params
 */
function validateParams(schema) {
    return async (req, res, next) => {
        try {
            req.params = await schema.parseAsync(req.params);
            next();
        } catch (error) {
            if (error.errors) {
                const details = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return next(new ValidationError('Validation failed', details));
            }
            next(error);
        }
    };
}

/**
 * Fastify preValidation hook version
 * @param {import('zod').ZodSchema} schema - Zod schema
 */
function createFastifyValidator(schema) {
    return async (request, reply) => {
        try {
            const validated = await schema.parseAsync({
                body: request.body,
                query: request.query,
                params: request.params
            });

            if (validated.body) request.body = validated.body;
            if (validated.query) request.query = validated.query;
            if (validated.params) request.params = validated.params;
        } catch (error) {
            if (error.errors) {
                const details = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                throw new ValidationError('Validation failed', details);
            }
            throw error;
        }
    };
}

/**
 * Validate MongoDB ObjectId
 * @param {string} id - ID to validate
 * @param {string} fieldName - Field name for error message
 */
function validateObjectId(id, fieldName = 'id') {
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    if (!objectIdRegex.test(id)) {
        throw new ValidationError(`Invalid ${fieldName}`, [
            { field: fieldName, message: 'Invalid ID format' }
        ]);
    }
    return id;
}

/**
 * Validate phone number
 * @param {string} phone - Phone number to validate
 */
function validatePhone(phone) {
    const phoneRegex = /^\+?[1-9]\d{9,14}$/;
    if (!phoneRegex.test(phone)) {
        throw new ValidationError('Invalid phone number', [
            { field: 'phone', message: 'Phone must be in international format: +1234567890' }
        ]);
    }
    return phone;
}

/**
 * Validate email
 * @param {string} email - Email to validate
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email', [
            { field: 'email', message: 'Invalid email format' }
        ]);
    }
    return email.toLowerCase();
}

/**
 * Sanitize string input
 * @param {string} str - String to sanitize
 */
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/<[^>]*>/g, '');
}

/**
 * Validate pagination params with defaults
 * @param {Object} query - Query object
 * @param {Object} defaults - Default values
 */
function validatePagination(query, defaults = { page: 1, limit: 20 }) {
    const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaults.limit));
    const skip = (page - 1) * limit;
    
    return { page, limit, skip };
}

module.exports = {
    validate,
    validateBody,
    validateQuery,
    validateParams,
    createFastifyValidator,
    validateObjectId,
    validatePhone,
    validateEmail,
    sanitizeString,
    validatePagination
};
