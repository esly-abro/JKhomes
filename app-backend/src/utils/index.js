/**
 * Utils Index
 * Export all utilities for clean imports
 */

const logger = require('./logger');
const { success, paginated, created, error, createResponseHelpers, responseMiddleware, health } = require('./formatters');
const { parsePagination, parseSort, buildPaginationMeta, getPaginatedResults, buildCursorPagination } = require('./pagination');
const validators = require('./validators');

module.exports = {
    // Logger
    logger,
    
    // Response formatters
    success,
    paginated,
    created,
    error,
    createResponseHelpers,
    responseMiddleware,
    health,
    
    // Pagination
    parsePagination,
    parseSort,
    buildPaginationMeta,
    getPaginatedResults,
    buildCursorPagination,
    
    // Validators
    validators,
    ...validators
};
