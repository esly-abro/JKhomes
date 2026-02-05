/**
 * Response Formatters
 * Provides consistent API response formatting
 */

/**
 * Format a success response
 * @param {any} data - Response data
 * @param {Object} options - Additional options
 */
function success(data, options = {}) {
    const response = {
        success: true,
        data,
        meta: {
            timestamp: new Date().toISOString(),
            ...options.meta
        }
    };
    
    if (options.requestId) {
        response.meta.requestId = options.requestId;
    }
    
    return response;
}

/**
 * Format a paginated response
 * @param {Array} data - Array of items
 * @param {Object} pagination - Pagination info
 * @param {Object} options - Additional options
 */
function paginated(data, pagination, options = {}) {
    const { page, limit, total, totalPages } = pagination;
    
    return {
        success: true,
        data,
        meta: {
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total: parseInt(total, 10),
                totalPages: parseInt(totalPages, 10) || Math.ceil(total / limit),
                hasNextPage: page < (totalPages || Math.ceil(total / limit)),
                hasPrevPage: page > 1
            },
            timestamp: new Date().toISOString(),
            requestId: options.requestId,
            ...options.meta
        }
    };
}

/**
 * Format a created response (201)
 * @param {any} data - Created resource
 * @param {Object} options - Additional options
 */
function created(data, options = {}) {
    return {
        success: true,
        data,
        meta: {
            timestamp: new Date().toISOString(),
            requestId: options.requestId,
            ...options.meta
        }
    };
}

/**
 * Format an error response
 * @param {string} code - Error code
 * @param {string} message - Error message
 * @param {Object} options - Additional options
 */
function error(code, message, options = {}) {
    const response = {
        success: false,
        error: {
            code,
            message,
            timestamp: new Date().toISOString()
        }
    };
    
    if (options.requestId) {
        response.error.requestId = options.requestId;
    }
    
    if (options.details) {
        response.error.details = options.details;
    }
    
    if (options.field) {
        response.error.field = options.field;
    }
    
    if (options.retryAfter) {
        response.error.retryAfter = options.retryAfter;
    }
    
    return response;
}

/**
 * Format a no content response (204)
 * Returns null as body should be empty for 204
 */
function noContent() {
    return null;
}

/**
 * Create response helpers bound to request
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
function createResponseHelpers(req, res) {
    return {
        success: (data, meta = {}) => {
            res.status(200).json(success(data, { requestId: req.id, meta }));
        },
        
        created: (data, meta = {}) => {
            res.status(201).json(created(data, { requestId: req.id, meta }));
        },
        
        paginated: (data, pagination, meta = {}) => {
            res.status(200).json(paginated(data, pagination, { requestId: req.id, meta }));
        },
        
        noContent: () => {
            res.status(204).send();
        },
        
        accepted: (data, meta = {}) => {
            res.status(202).json(success(data, { requestId: req.id, meta }));
        },
        
        error: (code, message, statusCode = 400, options = {}) => {
            res.status(statusCode).json(error(code, message, { requestId: req.id, ...options }));
        }
    };
}

/**
 * Express middleware to attach response helpers
 */
function responseMiddleware(req, res, next) {
    res.success = (data, meta = {}) => {
        res.status(200).json(success(data, { requestId: req.id, meta }));
    };
    
    res.created = (data, meta = {}) => {
        res.status(201).json(created(data, { requestId: req.id, meta }));
    };
    
    res.paginated = (data, pagination, meta = {}) => {
        res.status(200).json(paginated(data, pagination, { requestId: req.id, meta }));
    };
    
    res.noContent = () => {
        res.status(204).send();
    };
    
    res.accepted = (data, meta = {}) => {
        res.status(202).json(success(data, { requestId: req.id, meta }));
    };
    
    next();
}

/**
 * Wrap data in standard envelope
 * @param {any} data - Data to wrap
 * @param {string} requestId - Request ID
 */
function envelope(data, requestId) {
    return {
        data,
        meta: {
            timestamp: new Date().toISOString(),
            requestId
        }
    };
}

/**
 * Format list response with metadata
 * @param {Array} items - List items
 * @param {Object} options - Options
 */
function list(items, options = {}) {
    return {
        data: items,
        count: items.length,
        meta: {
            timestamp: new Date().toISOString(),
            ...options.meta
        }
    };
}

/**
 * Format health check response
 * @param {Object} checks - Health check results
 */
function health(checks) {
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    
    return {
        status: allHealthy ? 'healthy' : 'unhealthy',
        checks,
        timestamp: new Date().toISOString()
    };
}

module.exports = {
    success,
    paginated,
    created,
    error,
    noContent,
    createResponseHelpers,
    responseMiddleware,
    envelope,
    list,
    health
};
