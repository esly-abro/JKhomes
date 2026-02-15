/**
 * Main application configuration and routes
 * 
 * Production-Ready Architecture:
 * - Structured logging (Winston)
 * - Rate limiting per endpoint type
 * - Security headers
 * - Centralized error handling
 * - Request validation (Zod)
 */

const fastify = require('fastify');
const cors = require('@fastify/cors');
const path = require('path');
const config = require('./config/env');

// Controllers
const authController = require('./auth/auth.controller');
const leadsController = require('./leads/leads.controller');
const metricsController = require('./metrics/metrics.controller');
const syncController = require('./sync/sync.controller');

// Middleware
const requireAuth = require('./middleware/requireAuth');
const { requireRole } = require('./middleware/roles');

// NEW: Production Middleware
const { 
    errorHandler, 
    asyncHandler 
} = require('./middleware/errorHandler');
const { 
    apiLimiter, 
    authLimiter, 
    voiceCallLimiter, 
    zohoSyncLimiter,
    whatsappLimiter
} = require('./middleware/rateLimiter');
const { 
    setupFastifySecurity, 
    addRequestId 
} = require('./middleware/security');

// NEW: Structured Logging
const logger = require('./utils/logger');
const { createFastifyRequestLogger } = require('./utils/logger');

// NEW: Health Check Routes
const { registerFastifyHealthRoutes } = require('./routes/health');

// Errors - Updated import
const { AppError } = require('./errors/AppError');

// Constants
const { HTTP_STATUS, ERROR_CODES } = require('./constants');

async function buildApp() {
    const app = fastify({
        logger: config.nodeEnv === 'development' ? {
            transport: {
                target: 'pino-pretty',
                options: {
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname'
                }
            }
        } : true,
        // Production settings
        trustProxy: true,
        requestIdHeader: 'x-request-id',
        requestIdLogLabel: 'requestId'
    });

    // ======================================
    // SECURITY MIDDLEWARE
    // ======================================
    
    // Add request ID for tracing
    app.addHook('onRequest', async (request, reply) => {
        request.requestId = request.id || require('crypto').randomUUID();
        reply.header('X-Request-ID', request.requestId);
    });

    // Request logging (structured) - pass fastify instance
    createFastifyRequestLogger(app);

    // Security headers
    await setupFastifySecurity(app);

    // CORS - Allow all localhost ports in development
    await app.register(cors, {
        origin: (origin, cb) => {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return cb(null, true);
            
            // Allow all localhost origins in development
            if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                return cb(null, true);
            }
            
            // Check against configured origins
            const allowedOrigins = Array.isArray(config.cors.origin) ? config.cors.origin : [config.cors.origin];
            if (allowedOrigins.includes(origin)) {
                return cb(null, true);
            }
            
            // In development, allow all origins
            if (process.env.NODE_ENV !== 'production') {
                return cb(null, true);
            }
            
            cb(new Error('Not allowed by CORS'), false);
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    });

    // Static file serving for uploads
    await app.register(require('@fastify/static'), {
        root: path.join(__dirname, '../uploads'),
        prefix: '/uploads/',
        decorateReply: false
    });

    // Global error handler
    app.setErrorHandler((error, request, reply) => {
        // Log error with structured logging
        logger.error('Request error', {
            requestId: request.requestId,
            method: request.method,
            url: request.url,
            error: error.message,
            stack: config.nodeEnv === 'development' ? error.stack : undefined,
            statusCode: error.statusCode || 500
        });

        // Handle operational errors
        if (error instanceof AppError) {
            return reply.code(error.statusCode).send({
                success: false,
                error: error.message,
                errorCode: error.errorCode,
                requestId: request.requestId
            });
        }

        // Handle Fastify validation errors
        if (error.validation) {
            return reply.code(HTTP_STATUS.BAD_REQUEST).send({
                success: false,
                error: 'Validation failed',
                errorCode: ERROR_CODES.VALIDATION_ERROR,
                details: error.validation,
                requestId: request.requestId
            });
        }

        // Handle JWT errors
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return reply.code(HTTP_STATUS.UNAUTHORIZED).send({
                success: false,
                error: error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token',
                errorCode: error.name === 'TokenExpiredError' ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.INVALID_TOKEN,
                requestId: request.requestId
            });
        }

        // Unknown errors - hide details in production
        const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
        return reply.code(statusCode).send({
            success: false,
            error: config.nodeEnv === 'development' ? error.message : 'Internal server error',
            errorCode: ERROR_CODES.INTERNAL_ERROR,
            requestId: request.requestId
        });
    });

    // ======================================
    // HEALTH CHECK ROUTES (Public)
    // ======================================
    registerFastifyHealthRoutes(app);

    // Root endpoint
    app.get('/', async (request, reply) => {
        return {
            service: 'SaaS Lead Management - Application Backend',
            version: '1.0.0',
            documentation: 'See README.md',
            endpoints: {
                'POST /auth/login': 'User login',
                'POST /auth/refresh': 'Refresh access token',
                'POST /auth/logout': 'User logout',
                'GET /api/leads': 'List leads',
                'GET /api/leads/:id': 'Get lead details',
                'POST /api/leads': 'Create lead',
                'GET /api/metrics/overview': 'Dashboard metrics'
            }
        };
    });

    // Auth routes (no auth required)
    // Rate limited to prevent brute force attacks
    app.post('/auth/register-organization', { 
        preHandler: authLimiter 
    }, authController.registerOrganization);
    app.post('/auth/register', { 
        preHandler: authLimiter 
    }, authController.register);
    app.post('/auth/login', { 
        preHandler: authLimiter 
    }, authController.login);
    app.post('/auth/refresh', authController.refresh);
    app.post('/auth/logout', authController.logout);
    
    // Auth route (requires auth) - Get current user
    app.get('/auth/me', { preHandler: [requireAuth] }, async (request, reply) => {
        try {
            // request.user is already the safe user from requireAuth middleware
            if (!request.user) {
                return reply.status(401).send({ success: false, error: 'Not authenticated' });
            }

            // Get organization data if user is part of an organization
            let organization = null;
            if (request.user.organizationId) {
                try {
                    const Organization = require('./models/organization.model');
                    organization = await Organization.findById(request.user.organizationId).lean();
                    if (organization && organization.logoBuffer) {
                        organization.logoDataUrl = `data:${organization.logoMimeType};base64,${organization.logoBuffer.toString('base64')}`;
                        delete organization.logoBuffer;
                    }
                } catch (e) {
                    console.warn('Failed to fetch organization:', e.message);
                }
            }

            return reply.send({ success: true, user: request.user, organization });
        } catch (error) {
            request.log.error('Get current user error:', error);
            return reply.status(500).send({ success: false, error: 'Failed to get user' });
        }
    });

    // Knowledge Base routes (PUBLIC - for ElevenLabs AI to crawl)
    const knowledgeBaseRoutes = require('./routes/knowledgeBase.routes');
    app.register(knowledgeBaseRoutes, { prefix: '/api/knowledge-base' });

    // Lead Ingestion routes (PUBLIC - for external webhooks from Meta Ads, Google Ads, etc.)
    // These endpoints accept leads from external sources without authentication
    const leadIngestionController = require('./leads/lead.ingestion.controller');
    app.post('/api/ingest/leads', leadIngestionController.ingestLead);
    app.get('/api/ingest/sources', leadIngestionController.getSources);
    app.post('/api/ingest/leads/batch', leadIngestionController.ingestLeadsBatch);

    // Legacy endpoint for backward compatibility with zoho-lead-backend
    app.post('/leads', leadIngestionController.ingestLead);
    app.get('/leads/sources', leadIngestionController.getSources);

    // Zoho OAuth routes (PUBLIC - for OAuth flow)
    const zohoOAuthRoutes = require('./routes/zohoOAuth.routes');
    app.register(zohoOAuthRoutes, { prefix: '/auth/zoho' });

    // Twilio webhooks (public - no auth required)
    app.post('/api/twilio/voice', async (request, reply) => {
        const twilioService = require('./twilio/twilio.service');
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting your call. Please hold.</Say>
  <Dial callerId="${twilioService.TWILIO_PHONE_NUMBER}">
    <Number>${request.body.To || request.body.to}</Number>
  </Dial>
</Response>`;

        reply.header('Content-Type', 'text/xml');
        return reply.send(twiml);
    });

    app.post('/api/twilio/status', async (request, reply) => {
        const twilioService = require('./twilio/twilio.service');
        const { CallSid, CallStatus, CallDuration, EndTime } = request.body;

        console.log(`Call status update: ${CallSid} -> ${CallStatus}`);

        // Update call log in MongoDB
        await twilioService.updateCallStatus(
            CallSid,
            CallStatus,
            CallDuration,
            EndTime
        );

        return reply.send({ success: true });
    });

    // Protected API routes
    app.register(async function (protectedApp) {
        // Apply auth middleware to all routes in this scope
        protectedApp.addHook('onRequest', requireAuth);
        
        // Apply rate limiting to all API routes
        protectedApp.addHook('preHandler', apiLimiter);

        // Add auth decorator for nested routes
        protectedApp.decorate('auth', requireAuth);

        // Leads routes
        protectedApp.get('/api/leads', leadsController.getLeads);
        protectedApp.get('/api/leads/:id', leadsController.getLead);
        protectedApp.post('/api/leads', leadsController.createLead);
        protectedApp.put('/api/leads/:id', leadsController.updateLead);
        protectedApp.patch('/api/leads/:id/status', leadsController.updateLeadStatus);
        
        // Lead delete routes (admin/manager only)
        protectedApp.delete('/api/leads/:id', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.deleteLead);
        protectedApp.post('/api/leads/bulk-delete', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.bulkDeleteLeads);

        // Metrics routes (manager and above only)
        protectedApp.get('/api/metrics/overview', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getOverview);

        // Analytics routes (manager and above only)
        protectedApp.get('/api/analytics', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getAllAnalytics);

        protectedApp.get('/api/analytics/monthly-trends', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getMonthlyTrends);

        protectedApp.get('/api/analytics/conversion-funnel', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getConversionFunnel);

        protectedApp.get('/api/analytics/source-performance', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getSourcePerformance);

        protectedApp.get('/api/analytics/team-performance', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getTeamPerformance);

        protectedApp.get('/api/analytics/kpi-metrics', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, metricsController.getKPIMetrics);

        // Twilio routes (protected)
        // Voice call rate limited (10 calls per hour per user)
        protectedApp.post('/api/twilio/call', { 
            preHandler: voiceCallLimiter 
        }, async (request, reply) => {
            const twilioService = require('./twilio/twilio.service');
            const { phoneNumber, leadId, leadName } = request.body;
            const userId = request.user._id;

            if (!phoneNumber) {
                return reply.status(400).send({ error: 'Phone number is required' });
            }

            const result = await twilioService.makeCall(
                phoneNumber,
                twilioService.TWILIO_PHONE_NUMBER,
                userId,
                leadId,
                leadName
            );

            if (result.success) {
                console.log(`Call initiated by user ${userId} to ${phoneNumber} for lead ${leadName || leadId}`);
            }
            return reply.send(result);
        });

        protectedApp.get('/api/twilio/call/:callSid', async (request, reply) => {
            const twilioService = require('./twilio/twilio.service');
            const { callSid } = request.params;
            const result = await twilioService.getCallStatus(callSid);
            return reply.send(result);
        });

        protectedApp.get('/api/twilio/calls', async (request, reply) => {
            const twilioService = require('./twilio/twilio.service');
            const { limit } = request.query;
            const result = await twilioService.getCallHistory(limit ? parseInt(limit) : 20);
            return reply.send(result);
        });

        // Get access token for browser calling
        protectedApp.get('/api/twilio/token', async (request, reply) => {
            const twilioService = require('./twilio/twilio.service');
            const identity = request.user?.email || 'agent';
            const token = twilioService.generateAccessToken(identity);
            return reply.send({ token, identity });
        });

        // Site Visit / Appointment routes (both paths supported)
        protectedApp.post('/api/leads/:id/site-visit', leadsController.postSiteVisit);
        protectedApp.post('/api/leads/:id/appointment', leadsController.postSiteVisit); // generic alias
        protectedApp.get('/api/site-visits/today', leadsController.getTodaySiteVisits);
        protectedApp.get('/api/appointments/today', leadsController.getTodaySiteVisits); // generic alias
        protectedApp.get('/api/site-visits/me', leadsController.getMySiteVisits);
        protectedApp.get('/api/appointments/me', leadsController.getMySiteVisits); // generic alias
        protectedApp.get('/api/site-visits/all', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.getAllSiteVisitsHandler);
        protectedApp.get('/api/appointments/all', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.getAllSiteVisitsHandler); // generic alias
        
        // Google Sheets sync for appointments/site visits
        protectedApp.post('/api/site-visits/sync-google-sheets', {
            preHandler: requireRole(['owner', 'admin'])
        }, leadsController.syncSiteVisitsToGoogleSheets);
        protectedApp.post('/api/appointments/sync-google-sheets', {
            preHandler: requireRole(['owner', 'admin'])
        }, leadsController.syncSiteVisitsToGoogleSheets); // generic alias

        // Activity routes
        protectedApp.post('/api/activities', leadsController.postActivity);
        protectedApp.get('/api/activities/recent', leadsController.getRecentActivitiesHandler);
        protectedApp.get('/api/activities/me', leadsController.getMyActivities);
        protectedApp.get('/api/activities/all', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.getAllActivitiesHandler);

        // Call Log routes
        protectedApp.get('/api/call-logs/me', leadsController.getMyCallLogs);
        protectedApp.get('/api/call-logs/all', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.getAllCallLogsHandler);

        // Task routes moved to /api/tasks via taskRoutes module (see below)

        // User routes
        protectedApp.get('/api/users', leadsController.getUsers);

        // User Management routes (owner/admin only)
        const usersController = require('./users/users.controller');
        
        // IMPORTANT: Static routes MUST come before parameterized routes
        protectedApp.get('/api/users/pending', {
            preHandler: requireRole(['owner', 'admin'])
        }, usersController.getPendingUsers);
        
        // Add /api/users/agents route before :id route
        protectedApp.get('/api/users/agents', usersController.getAgents);
        
        protectedApp.get('/api/users/:id', usersController.getUserById);
        protectedApp.patch('/api/users/:id/approve', {
            preHandler: requireRole(['owner', 'admin'])
        }, usersController.approveUser);
        protectedApp.patch('/api/users/:id/reject', {
            preHandler: requireRole(['owner', 'admin'])
        }, usersController.rejectUser);
        protectedApp.patch('/api/users/:id/role', {
            preHandler: requireRole(['owner', 'admin'])
        }, usersController.updateUserRole);
        protectedApp.delete('/api/users/:id', {
            preHandler: requireRole(['owner', 'admin'])
        }, usersController.deleteUser);

        // Agents route (for property assignment) - keep both for backward compatibility
        protectedApp.get('/api/agents', usersController.getAgents);
        
        // Agent activity/stats route
        protectedApp.get('/api/agents/:id/activity', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, usersController.getAgentActivity);

        // Properties routes
        const propertiesController = require('./properties/properties.controller');
        protectedApp.get('/api/properties', propertiesController.getProperties);
        protectedApp.get('/api/properties/:id', propertiesController.getPropertyById);
        protectedApp.post('/api/properties', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, propertiesController.createProperty);
        protectedApp.patch('/api/properties/:id', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, propertiesController.updateProperty);
        protectedApp.delete('/api/properties/:id', {
            preHandler: requireRole(['owner', 'admin'])
        }, propertiesController.deleteProperty);

        // Inventory Item routes (generic catalog - SaaS multi-tenant)
        const inventoryItemController = require('./inventory/inventoryItem.controller');
        protectedApp.get('/api/inventory-items', inventoryItemController.getItems);
        protectedApp.get('/api/inventory-items/:id', inventoryItemController.getItemById);
        protectedApp.post('/api/inventory-items', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, inventoryItemController.createItem);
        protectedApp.patch('/api/inventory-items/:id', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, inventoryItemController.updateItem);
        protectedApp.delete('/api/inventory-items/:id', {
            preHandler: requireRole(['owner', 'admin'])
        }, inventoryItemController.deleteItem);
        protectedApp.patch('/api/inventory-items/:id/custom-fields', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, inventoryItemController.updateCustomFields);

        // Google Sheets Sync routes
        protectedApp.post('/api/properties/sync-google-sheets', {
            preHandler: requireRole(['owner', 'admin'])
        }, propertiesController.syncToGoogleSheets);
        protectedApp.get('/api/properties/sync-status', propertiesController.getGoogleSheetsSyncStatus);

        // Property Availability routes
        const availabilityService = require('./services/availability.service');
        
        // Get available slots for a property on a specific date
        protectedApp.get('/api/properties/:id/available-slots', async (request, reply) => {
            try {
                const { id } = request.params;
                const { date } = request.query;
                
                if (!date) {
                    return reply.code(400).send({ 
                        success: false, 
                        error: 'Date query parameter is required (format: YYYY-MM-DD)' 
                    });
                }
                
                const result = await availabilityService.getAvailableSlots(id, date);
                return reply.send({ success: true, data: result });
            } catch (error) {
                request.log.error(error);
                return reply.code(error.message === 'Property not found' ? 404 : 500).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
        
        // Settings routes
        const settingsController = require('./controllers/settings.controller');
        
        // Get all settings for current user
        protectedApp.get('/api/settings', settingsController.getAllSettings);
        
        // WhatsApp settings routes
        protectedApp.get('/api/settings/whatsapp', settingsController.getWhatsappSettings);
        protectedApp.post('/api/settings/whatsapp', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, settingsController.updateWhatsappSettings);
        protectedApp.post('/api/settings/whatsapp/test', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, settingsController.testWhatsappConnection);
        
        // Get property availability settings
        protectedApp.get('/api/properties/:id/availability', async (request, reply) => {
            try {
                const { id } = request.params;
                const result = await availabilityService.getPropertyAvailability(id);
                return reply.send({ success: true, data: result });
            } catch (error) {
                request.log.error(error);
                return reply.code(error.message === 'Property not found' ? 404 : 500).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
        
        // Update property availability settings (owner/admin/manager only)
        protectedApp.patch('/api/properties/:id/availability', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, async (request, reply) => {
            try {
                const { id } = request.params;
                const result = await availabilityService.updatePropertyAvailability(id, request.body);
                return reply.send({ success: true, data: result.availability, message: 'Availability settings updated' });
            } catch (error) {
                request.log.error(error);
                return reply.code(error.message === 'Property not found' ? 404 : 400).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
        
        // Block dates for a property (owner/admin/manager only)
        protectedApp.post('/api/properties/:id/availability/block-dates', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, async (request, reply) => {
            try {
                const { id } = request.params;
                const { dates } = request.body;
                
                if (!dates || !Array.isArray(dates)) {
                    return reply.code(400).send({ 
                        success: false, 
                        error: 'dates array is required' 
                    });
                }
                
                const result = await availabilityService.blockDates(id, dates);
                return reply.send({ success: true, data: result.availability.blockedDates, message: 'Dates blocked' });
            } catch (error) {
                request.log.error(error);
                return reply.code(error.message === 'Property not found' ? 404 : 500).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
        
        // Unblock dates for a property (owner/admin/manager only)
        protectedApp.post('/api/properties/:id/availability/unblock-dates', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, async (request, reply) => {
            try {
                const { id } = request.params;
                const { dates } = request.body;
                
                if (!dates || !Array.isArray(dates)) {
                    return reply.code(400).send({ 
                        success: false, 
                        error: 'dates array is required' 
                    });
                }
                
                const result = await availabilityService.unblockDates(id, dates);
                return reply.send({ success: true, data: result.availability.blockedDates, message: 'Dates unblocked' });
            } catch (error) {
                request.log.error(error);
                return reply.code(error.message === 'Property not found' ? 404 : 500).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
        
        // Set special hours for a date (owner/admin/manager only)
        protectedApp.post('/api/properties/:id/availability/special-hours', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, async (request, reply) => {
            try {
                const { id } = request.params;
                const { date, timeSlots, isClosed } = request.body;
                
                if (!date) {
                    return reply.code(400).send({ 
                        success: false, 
                        error: 'date is required' 
                    });
                }
                
                const result = await availabilityService.setSpecialHours(id, date, { timeSlots, isClosed });
                return reply.send({ success: true, data: result.availability.specialHours, message: 'Special hours set' });
            } catch (error) {
                request.log.error(error);
                return reply.code(error.message === 'Property not found' ? 404 : 500).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });
        
        // Check for booking conflicts (both paths supported)
        protectedApp.post('/api/site-visits/check-conflict', async (request, reply) => {
            try {
                const { propertyId, date, startTime, excludeVisitId } = request.body;
                const agentId = request.user._id;
                
                if (!propertyId || !date || !startTime) {
                    return reply.code(400).send({ 
                        success: false, 
                        error: 'propertyId, date, and startTime are required' 
                    });
                }
                
                const result = await availabilityService.checkConflicts(propertyId, agentId, date, startTime, excludeVisitId);
                return reply.send({ success: true, data: result });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({ 
                    success: false, 
                    error: error.message 
                });
            }
        });

        // Appointment conflict check alias
        protectedApp.post('/api/appointments/check-conflict', async (request, reply) => {
            try {
                const { propertyId, date, startTime, excludeVisitId } = request.body;
                const agentId = request.user._id;
                if (!propertyId || !date || !startTime) {
                    return reply.code(400).send({ success: false, error: 'propertyId, date, and startTime are required' });
                }
                const result = await availabilityService.checkConflicts(propertyId, agentId, date, startTime, excludeVisitId);
                return reply.send({ success: true, data: result });
            } catch (error) {
                request.log.error(error);
                return reply.code(500).send({ success: false, error: error.message });
            }
        });

        // Lead Assignment routes
        const assignmentController = require('./assignments/assignment.controller');
        protectedApp.post('/api/assignments/assign', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, assignmentController.assignLeads);
        protectedApp.post('/api/assignments/reassign', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, assignmentController.reassignLeads);
        protectedApp.get('/api/assignments/workload', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, assignmentController.getAgentWorkload);

        // Organization Profile routes (owner can update)
        protectedApp.get('/api/organization/me', async (request, reply) => {
            const Organization = require('./models/organization.model');
            const org = await Organization.findById(request.user.organizationId).lean();
            if (!org) return reply.status(404).send({ success: false, error: 'Organization not found' });
            
            if (org.logoBuffer) {
                org.logoDataUrl = `data:${org.logoMimeType};base64,${org.logoBuffer.toString('base64')}`;
                delete org.logoBuffer;
            }
            return reply.send({ success: true, organization: org });
        });

        // Update organization profile with logo upload
        protectedApp.post('/api/organization/update-profile', {
            preHandler: [requireRole(['owner', 'admin'])]
        }, async (request, reply) => {
            const Organization = require('./models/organization.model');
            const data = await request.file();
            
            if (!data) {
                return reply.status(400).send({ success: false, error: 'No file uploaded' });
            }

            const buffer = await data.toBuffer();
            const mimetype = data.mimetype;

            // Validate file size (max 2MB)
            if (buffer.length > 2 * 1024 * 1024) {
                return reply.status(400).send({ success: false, error: 'File size exceeds 2MB limit' });
            }

            // Validate MIME type
            if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimetype)) {
                return reply.status(400).send({ success: false, error: 'Only PNG, JPEG, GIF, or WebP images allowed' });
            }

            try {
                const org = await Organization.findByIdAndUpdate(
                    request.user.organizationId,
                    {
                        logoBuffer: buffer,
                        logoMimeType: mimetype,
                        logoUrl: null
                    },
                    { new: true }
                ).lean();

                if (org.logoBuffer) {
                    org.logoDataUrl = `data:${org.logoMimeType};base64,${org.logoBuffer.toString('base64')}`;
                    delete org.logoBuffer;
                }

                return reply.send({
                    success: true,
                    message: 'Organization logo updated successfully',
                    organization: org
                });
            } catch (error) {
                return reply.status(500).send({ success: false, error: error.message });
            }
        });

        // Update organization name and settings (owner/admin only)
        protectedApp.put('/api/organization/settings', {
            preHandler: [requireRole(['owner', 'admin'])]
        }, async (request, reply) => {
            const Organization = require('./models/organization.model');
            const { name, settings } = request.body || {};
            const updateFields = {};

            if (name) updateFields.name = name;
            if (settings) {
                if (settings.timezone) updateFields['settings.timezone'] = settings.timezone;
                if (settings.dateFormat) updateFields['settings.dateFormat'] = settings.dateFormat;
                if (settings.currency) updateFields['settings.currency'] = settings.currency;
            }

            if (Object.keys(updateFields).length === 0) {
                return reply.status(400).send({ success: false, error: 'No fields to update' });
            }

            try {
                const org = await Organization.findByIdAndUpdate(
                    request.user.organizationId,
                    { $set: updateFields },
                    { new: true }
                ).lean();

                if (!org) return reply.status(404).send({ success: false, error: 'Organization not found' });

                if (org.logoBuffer) {
                    org.logoDataUrl = `data:${org.logoMimeType};base64,${org.logoBuffer.toString('base64')}`;
                    delete org.logoBuffer;
                }

                return reply.send({ success: true, organization: org });
            } catch (error) {
                return reply.status(500).send({ success: false, error: error.message });
            }
        });

        // Zoho Sync routes (owner/admin only, rate limited)
        protectedApp.post('/api/sync/call-log/:callLogId', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.syncCallLog);

        protectedApp.post('/api/sync/activity/:activityId', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.syncActivity);

        protectedApp.post('/api/sync/site-visit/:siteVisitId', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.syncSiteVisit);

        // Generic alias for appointment sync
        protectedApp.post('/api/sync/appointment/:siteVisitId', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.syncSiteVisit);

        protectedApp.post('/api/sync/pending', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.syncAllPending);

        // Import leads from Zoho CRM into MongoDB
        protectedApp.post('/api/sync/import-from-zoho', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.importFromZoho);

        // Push local-only leads to Zoho CRM
        protectedApp.post('/api/sync/push-to-zoho', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.pushToZoho);

        // Full bidirectional sync (clean + push + import)
        protectedApp.post('/api/sync/full', {
            preHandler: [requireRole(['owner', 'admin']), zohoSyncLimiter]
        }, syncController.fullSync);

        // Upload routes
        const uploadRoutes = require('./routes/upload');
        protectedApp.register(uploadRoutes, { prefix: '/api/upload' });

        // Tenant Config routes (SaaS configurability)
        const tenantConfigRoutes = require('./routes/tenantConfig.routes');
        protectedApp.register(tenantConfigRoutes);

        // ElevenLabs Sync
        const elevenLabsController = require('./controllers/elevenLabs.controller');
        protectedApp.post('/api/sync/elevenlabs', {
            preHandler: requireRole(['owner', 'admin'])
        }, elevenLabsController.syncHistory);

        // ElevenLabs AI Call - Make outbound call to lead
        const elevenLabsService = require('./services/elevenLabs.service');
        protectedApp.post('/api/elevenlabs/call', async (request, reply) => {
            try {
                const { phoneNumber, leadId, leadName, metadata } = request.body;
                
                if (!phoneNumber) {
                    return reply.code(400).send({ success: false, error: 'Phone number is required' });
                }
                
                console.log(`ðŸ“ž Manual AI call request to ${phoneNumber} for lead ${leadId}`);
                
                const result = await elevenLabsService.makeCall(phoneNumber, {
                    leadName: leadName || 'Customer',
                    leadData: { _id: leadId },
                    userId: request.user._id,
                    metadata: {
                        leadId,
                        source: metadata?.source || 'manual',
                        ...metadata
                    }
                });
                
                if (result.success) {
                    // Log activity with correct schema fields
                    try {
                        const Activity = require('./models/Activity');
                        await Activity.create({
                            leadId: leadId,
                            type: 'call',  // Use 'call' as ai_call not in enum
                            title: 'AI Call Initiated',
                            description: `AI call initiated to ${phoneNumber}`,
                            userId: request.user._id,
                            userName: request.user.name || request.user.email,
                            metadata: {
                                callId: result.callId,
                                conversationId: result.conversationId,
                                status: result.status,
                                isAICall: true
                            }
                        });
                    } catch (activityError) {
                        console.warn('âš ï¸ Failed to log activity:', activityError.message);
                        // Don't fail the call because of activity logging
                    }
                    
                    return { 
                        success: true, 
                        callId: result.callId,
                        conversationId: result.conversationId,
                        status: result.status || 'initiated',
                        message: 'Call initiated successfully'
                    };
                } else {
                    return reply.code(500).send({ 
                        success: false, 
                        error: result.error || 'Failed to initiate call' 
                    });
                }
            } catch (error) {
                console.error('âŒ ElevenLabs call error:', error);
                return reply.code(500).send({ 
                    success: false, 
                    error: error.message || 'Failed to initiate call' 
                });
            }
        });
        
        // ElevenLabs Summary - Get conversation summary for a lead
        protectedApp.get('/api/elevenlabs/summary/:phoneNumber', async (request, reply) => {
            try {
                const { phoneNumber } = request.params;
                const summary = await elevenLabsService.getConversationSummary(phoneNumber);
                return { success: true, data: summary };
            } catch (error) {
                console.error('âŒ ElevenLabs summary error:', error);
                return reply.code(500).send({ 
                    success: false, 
                    error: error.message || 'Failed to fetch summary' 
                });
            }
        });
    });

    // Automation routes (requires auth for most operations)
    app.register(async function (automationProtectedApp) {
        automationProtectedApp.addHook('onRequest', requireAuth);
        const automationRoutes = require('./routes/automation.routes');
        await automationProtectedApp.register(automationRoutes, { prefix: '/api/automations' });
    });

    // Task routes (requires auth) - Agent task management with automation sync
    app.register(async function (taskProtectedApp) {
        taskProtectedApp.addHook('onRequest', requireAuth);
        const { taskRoutes } = require('./tasks');
        await taskProtectedApp.register(taskRoutes, { prefix: '/api/tasks' });
    });

    // WhatsApp routes (requires auth for template/send operations)
    app.register(async function (whatsappProtectedApp) {
        whatsappProtectedApp.addHook('onRequest', requireAuth);
        const whatsappRoutes = require('./routes/whatsapp.routes');
        await whatsappProtectedApp.register(whatsappRoutes, { prefix: '/api/whatsapp' });
    });

    // Zoho CRM Integration routes (requires auth)
    app.register(async function (zohoProtectedApp) {
        zohoProtectedApp.addHook('onRequest', requireAuth);
        const zohoRoutes = require('./routes/zoho.routes');
        await zohoProtectedApp.register(zohoRoutes, { prefix: '/api/integrations/zoho' });
    });

    // ElevenLabs Integration routes (requires auth)
    app.register(async function (elevenLabsProtectedApp) {
        elevenLabsProtectedApp.addHook('onRequest', requireAuth);
        const elevenLabsRoutes = require('./routes/elevenlabs.routes');
        await elevenLabsProtectedApp.register(elevenLabsRoutes, { prefix: '/api/integrations/elevenlabs' });
    });

    // API Settings routes (requires auth) - Encrypted credential management
    app.register(async function (apiSettingsProtectedApp) {
        apiSettingsProtectedApp.addHook('onRequest', requireAuth);
        const apiSettingsRoutes = require('./routes/apiSettings.routes');
        await apiSettingsProtectedApp.register(apiSettingsRoutes, { prefix: '/api/settings/api' });
    });

    // Broadcast routes (requires auth) - WhatsApp campaigns with image + CTA buttons
    app.register(async function (broadcastProtectedApp) {
        broadcastProtectedApp.addHook('onRequest', requireAuth);
        const broadcastRoutes = require('./routes/broadcast.routes');
        await broadcastProtectedApp.register(broadcastRoutes, { prefix: '/api/broadcasts' });
    });

    // Twilio voice webhook (no auth - called by Twilio)
    app.post('/twilio/voice', async (request, reply) => {
        const toNumber = request.body.To || request.body.to;
        let twiml;

        // Check if it's a phone number or client
        if (toNumber && toNumber.startsWith('+')) {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="+17655076878">
    <Number>${toNumber}</Number>
  </Dial>
</Response>`;
        } else {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Invalid phone number</Say>
</Response>`;
        }

        reply.header('Content-Type', 'text/xml');
        return reply.send(twiml);
    });

    // ==========================================================================
    // PUBLIC WEBHOOK ROUTES (No auth - called by external services)
    // Migrated from zoho-lead-backend for single backend architecture
    // ==========================================================================

    // ElevenLabs post-call webhook (main entry point)
    const elevenLabsWebhookService = require('./services/elevenlabs.webhook.service');
    
    app.post('/webhook/elevenlabs', async (request, reply) => {
        try {
            if (!elevenLabsWebhookService.verifyWebhook(request)) {
                return reply.code(401).send({ error: 'Invalid signature' });
            }

            const result = await elevenLabsWebhookService.handleWebhook(request.body);
            
            // Always return 200 to acknowledge (prevents ElevenLabs from retrying)
            return reply.send({ status: 'received', ...result });
        } catch (error) {
            console.error('âŒ ElevenLabs webhook error:', error);
            return reply.send({ status: 'error', error: error.message });
        }
    });

    // Legacy AI call webhook endpoint (backwards compatibility)
    app.post('/ai-call-webhook', async (request, reply) => {
        try {
            const { PostCallOrchestrator } = require('./services/postCall.orchestrator');
            await PostCallOrchestrator.processCallStatus(request.body);
            return reply.send({ success: true });
        } catch (error) {
            console.error('Legacy AI webhook error:', error);
            return reply.send({ success: false });
        }
    });

    // Twilio call status callback
    app.post('/elevenlabs/status', async (request, reply) => {
        const { CallSid, CallStatus, CallDuration } = request.body;
        console.log(`Call status: ${CallSid} -> ${CallStatus}`);
        
        try {
            const twilioService = require('./twilio/twilio.service');
            await twilioService.updateCallStatus(CallSid, CallStatus, CallDuration);
        } catch (error) {
            console.error('Call status update error:', error);
        }
        
        return reply.send({ success: true });
    });

    // Webhook health check
    app.get('/webhook/health', async (request, reply) => {
        return reply.send({
            status: 'ok',
            timestamp: new Date().toISOString(),
            endpoints: [
                'POST /webhook/elevenlabs',
                'POST /ai-call-webhook',
                'POST /elevenlabs/status'
            ]
        });
    });

    return app;
}

module.exports = buildApp;
