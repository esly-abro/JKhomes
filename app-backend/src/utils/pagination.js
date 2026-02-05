/**
 * Pagination Utilities
 * Provides consistent pagination across the API
 */

/**
 * Default pagination options
 */
const DEFAULTS = {
    page: 1,
    limit: 20,
    maxLimit: 100
};

/**
 * Parse pagination parameters from query
 * @param {Object} query - Query parameters
 * @param {Object} options - Custom options
 * @returns {Object} Parsed pagination
 */
function parsePagination(query = {}, options = {}) {
    const maxLimit = options.maxLimit || DEFAULTS.maxLimit;
    
    let page = parseInt(query.page, 10);
    let limit = parseInt(query.limit, 10);
    
    // Validate and apply defaults
    page = isNaN(page) || page < 1 ? DEFAULTS.page : page;
    limit = isNaN(limit) || limit < 1 ? DEFAULTS.limit : Math.min(limit, maxLimit);
    
    const skip = (page - 1) * limit;
    
    return {
        page,
        limit,
        skip,
        offset: skip  // Alias for SQL-style queries
    };
}

/**
 * Parse sort parameters from query
 * @param {Object} query - Query parameters
 * @param {Array} allowedFields - Fields that can be sorted
 * @param {Object} defaults - Default sort options
 */
function parseSort(query = {}, allowedFields = [], defaults = { field: 'createdAt', order: 'desc' }) {
    let field = query.sortBy || query.sort || defaults.field;
    let order = (query.sortOrder || query.order || defaults.order).toLowerCase();
    
    // Validate field
    if (allowedFields.length > 0 && !allowedFields.includes(field)) {
        field = defaults.field;
    }
    
    // Validate order
    if (!['asc', 'desc'].includes(order)) {
        order = defaults.order;
    }
    
    return {
        field,
        order,
        // MongoDB style
        mongoSort: { [field]: order === 'asc' ? 1 : -1 },
        // SQL style
        sqlSort: `${field} ${order.toUpperCase()}`
    };
}

/**
 * Build pagination metadata for response
 * @param {Object} params - Pagination params
 * @param {number} total - Total number of items
 * @returns {Object} Pagination metadata
 */
function buildPaginationMeta(params, total) {
    const { page, limit } = params;
    const totalPages = Math.ceil(total / limit);
    
    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null
    };
}

/**
 * Apply pagination to MongoDB query
 * @param {Object} query - Mongoose query
 * @param {Object} pagination - Pagination params
 * @param {Object} sort - Sort params
 */
function applyMongoosePagination(query, pagination, sort = null) {
    query.skip(pagination.skip).limit(pagination.limit);
    
    if (sort) {
        query.sort(sort.mongoSort);
    }
    
    return query;
}

/**
 * Get paginated results from MongoDB
 * @param {Object} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} pagination - Pagination params
 * @param {Object} options - Additional options
 */
async function getPaginatedResults(Model, filter = {}, pagination, options = {}) {
    const { select, populate, sort } = options;
    
    let query = Model.find(filter);
    
    if (select) {
        query = query.select(select);
    }
    
    if (populate) {
        query = query.populate(populate);
    }
    
    if (sort) {
        query = query.sort(sort.mongoSort || sort);
    }
    
    query = query.skip(pagination.skip).limit(pagination.limit);
    
    const [data, total] = await Promise.all([
        query.exec(),
        Model.countDocuments(filter)
    ]);
    
    return {
        data,
        pagination: buildPaginationMeta(pagination, total)
    };
}

/**
 * Create cursor-based pagination info
 * @param {Array} items - Array of items
 * @param {string} cursorField - Field to use as cursor
 */
function buildCursorPagination(items, cursorField = '_id') {
    if (!items || items.length === 0) {
        return {
            items: [],
            nextCursor: null,
            hasMore: false
        };
    }
    
    const lastItem = items[items.length - 1];
    
    return {
        items,
        nextCursor: lastItem[cursorField]?.toString() || null,
        hasMore: items.length > 0
    };
}

/**
 * Parse cursor pagination params
 * @param {Object} query - Query parameters
 */
function parseCursorPagination(query = {}) {
    const limit = Math.min(
        parseInt(query.limit, 10) || DEFAULTS.limit,
        DEFAULTS.maxLimit
    );
    
    return {
        cursor: query.cursor || null,
        limit,
        // Fetch one extra to check if there are more
        fetchLimit: limit + 1
    };
}

/**
 * Build links for HATEOAS pagination
 * @param {string} baseUrl - Base URL for the endpoint
 * @param {Object} pagination - Pagination metadata
 */
function buildPaginationLinks(baseUrl, pagination) {
    const links = {
        self: `${baseUrl}?page=${pagination.page}&limit=${pagination.limit}`,
        first: `${baseUrl}?page=1&limit=${pagination.limit}`,
        last: `${baseUrl}?page=${pagination.totalPages}&limit=${pagination.limit}`
    };
    
    if (pagination.hasNextPage) {
        links.next = `${baseUrl}?page=${pagination.nextPage}&limit=${pagination.limit}`;
    }
    
    if (pagination.hasPrevPage) {
        links.prev = `${baseUrl}?page=${pagination.prevPage}&limit=${pagination.limit}`;
    }
    
    return links;
}

module.exports = {
    DEFAULTS,
    parsePagination,
    parseSort,
    buildPaginationMeta,
    applyMongoosePagination,
    getPaginatedResults,
    buildCursorPagination,
    parseCursorPagination,
    buildPaginationLinks
};
