/**
 * Middleware Index
 * Export all middleware for clean imports
 */

const { errorHandler, notFoundHandler, asyncHandler, wrapController } = require('./errorHandler');
const { validate, validateBody, validateQuery, validateParams, createFastifyValidator, validateObjectId, validatePhone, validateEmail, validatePagination } = require('./validation');
const { apiLimiter, authLimiter, voiceCallLimiter, zohoSyncLimiter, whatsappLimiter } = require('./rateLimiter');
const { securityHeaders, corsMiddleware, noSqlInjectionProtection, hppProtection, addRequestId, setupExpressSecurity, setupFastifySecurity } = require('./security');

module.exports = {
    // Error handling
    errorHandler,
    notFoundHandler,
    asyncHandler,
    wrapController,
    
    // Validation
    validate,
    validateBody,
    validateQuery,
    validateParams,
    createFastifyValidator,
    validateObjectId,
    validatePhone,
    validateEmail,
    validatePagination,
    
    // Rate limiting
    apiLimiter,
    authLimiter,
    voiceCallLimiter,
    zohoSyncLimiter,
    whatsappLimiter,
    
    // Security
    securityHeaders,
    corsMiddleware,
    noSqlInjectionProtection,
    hppProtection,
    addRequestId,
    setupExpressSecurity,
    setupFastifySecurity
};
