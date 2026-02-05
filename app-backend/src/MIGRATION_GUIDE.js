/**
 * Production Infrastructure Migration Guide
 * 
 * This file documents how to migrate existing code to use
 * the new production infrastructure components.
 */

// ============================================================
// 1. ERROR HANDLING MIGRATION
// ============================================================

// BEFORE: Manual error handling
// controller.js
/*
async function getUser(req, res) {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
*/

// AFTER: Using new error classes and asyncHandler
/*
const { NotFoundError } = require('../errors');
const { asyncHandler } = require('../middleware/errorHandler');

const getUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
        throw new NotFoundError('User');
    }
    res.json(user);
});
// Errors automatically caught and formatted by error handler
*/

// ============================================================
// 2. LOGGING MIGRATION
// ============================================================

// BEFORE: console.log
/*
console.log('User created:', user.email);
console.error('Failed to create user:', error);
*/

// AFTER: Structured logging
/*
const logger = require('../utils/logger');

logger.info('User created', { 
    userId: user._id, 
    email: user.email,
    role: user.role 
});

logger.error('Failed to create user', { 
    error: error.message,
    stack: error.stack,
    email: userData.email 
});
*/

// ============================================================
// 3. VALIDATION MIGRATION
// ============================================================

// BEFORE: Manual validation
/*
app.post('/api/leads', async (req, res) => {
    const { name, phone, email } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    if (!phone || phone.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number' });
    }
    // ... more manual validation
});
*/

// AFTER: Using Zod schemas
/*
const { validate } = require('../middleware/validation');
const { createLeadSchema } = require('../validators/schemas');

app.post('/api/leads', 
    validate(createLeadSchema),
    async (req, res) => {
        // req.body is validated and typed
        const lead = await leadService.createLead(req.body);
        res.status(201).json(lead);
    }
);
*/

// ============================================================
// 4. RESPONSE FORMAT MIGRATION
// ============================================================

// BEFORE: Inconsistent responses
/*
res.json(user);                                    // Just data
res.json({ success: true, data: user });           // With success
res.json({ users, total: count });                 // Pagination mixed
*/

// AFTER: Consistent response helpers
/*
const { success, paginated, created, error } = require('../utils/formatters');

// Success response
res.json(success(user, 'User retrieved'));

// Created response
res.status(201).json(created(user, 'User'));

// Paginated response
res.json(paginated(users, {
    page: 1,
    limit: 20,
    total: count
}));

// Error response (use error classes instead)
throw new NotFoundError('User');
*/

// ============================================================
// 5. DATABASE ACCESS MIGRATION
// ============================================================

// BEFORE: Direct model access in controllers
/*
// controller.js
async function getLeads(req, res) {
    const leads = await Lead.find()
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('assignedTo');
    res.json(leads);
}
*/

// AFTER: Repository -> Service -> Controller pattern
/*
// repository/leadRepository.js
async findMany(filter, options) {
    return await Lead.find(filter)
        .sort(options.sort)
        .limit(options.limit)
        .populate(options.populate)
        .lean();
}

// service/lead.service.js
async getLeads(params) {
    const options = this.buildOptions(params);
    return await leadRepository.findMany(filter, options);
}

// controller
const getLeads = asyncHandler(async (req, res) => {
    const result = await leadService.getLeads(req.query);
    res.json(paginated(result.data, result.pagination));
});
*/

// ============================================================
// 6. RATE LIMITING USAGE
// ============================================================

/*
// In Fastify routes
app.post('/auth/login', { 
    preHandler: authLimiter  // 5 requests per 15 min
}, authController.login);

app.post('/api/twilio/call', { 
    preHandler: voiceCallLimiter  // 10 calls per hour
}, twilioController.makeCall);

app.post('/api/sync/zoho', { 
    preHandler: zohoSyncLimiter  // 50 requests per minute
}, syncController.syncToZoho);
*/

// ============================================================
// 7. CONSTANTS USAGE
// ============================================================

// BEFORE: Magic strings
/*
if (lead.status === 'new') { ... }
if (user.role === 'admin' || user.role === 'manager') { ... }
*/

// AFTER: Using constants
/*
const { LEAD_STATUSES, USER_ROLES } = require('../constants');

if (lead.status === LEAD_STATUSES.NEW) { ... }
if ([USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(user.role)) { ... }
*/

// ============================================================
// QUICK REFERENCE: Import Paths
// ============================================================

/*
// Error classes
const { 
    AppError, 
    ValidationError, 
    NotFoundError, 
    UnauthorizedError,
    ConflictError,
    RateLimitError 
} = require('../errors');

// Middleware
const { 
    asyncHandler, 
    errorHandler 
} = require('../middleware/errorHandler');

const { 
    validate, 
    validateBody, 
    validateQuery 
} = require('../middleware/validation');

const { 
    apiLimiter, 
    authLimiter, 
    voiceCallLimiter 
} = require('../middleware/rateLimiter');

// Utilities
const logger = require('../utils/logger');
const { success, paginated, created } = require('../utils/formatters');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');

// Validators
const { 
    createLeadSchema, 
    updateLeadSchema,
    loginSchema 
} = require('../validators/schemas');

// Constants
const { 
    LEAD_STATUSES, 
    USER_ROLES, 
    HTTP_STATUS, 
    ERROR_CODES 
} = require('../constants');

// Repositories
const { 
    leadRepository, 
    userRepository, 
    propertyRepository 
} = require('../repositories');

// Services
const { 
    leadService, 
    userService 
} = require('../services');
*/

module.exports = {
    MIGRATION_GUIDE_VERSION: '1.0.0'
};
