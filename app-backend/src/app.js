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

// Production Middleware
const { 
    apiLimiter, 
    authLimiter, 
    voiceCallLimiter, 
    zohoSyncLimiter
} = require('./middleware/rateLimiter');
const { 
    setupFastifySecurity
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

            // Allow Cloudflare Tunnel and ngrok origins
            if (origin.endsWith('.trycloudflare.com') || origin.endsWith('.ngrok-free.dev') || origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok.io')) {
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
        const { PostCallOrchestrator } = require('./services/postCall.orchestrator');
        const { CallSid, CallStatus, CallDuration, EndTime } = request.body;

        console.log(`Call status update: ${CallSid} -> ${CallStatus}`);

        // Update call log in MongoDB
        const result = await twilioService.updateCallStatus(
            CallSid,
            CallStatus,
            CallDuration,
            EndTime
        );

        // When call ends, also update the Lead status via PostCallOrchestrator
        const terminalStatuses = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
        if (terminalStatuses.includes(CallStatus) && result.callLog) {
            const callLog = result.callLog;
            PostCallOrchestrator.processCallStatus({
                callSid: CallSid,
                status: CallStatus,
                phoneNumber: callLog.to || callLog.phoneNumber,
                duration: CallDuration,
                leadId: callLog.leadId
            }).catch(err => console.error('Post-call lead update error:', err));
        }

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
            const organizationId = request.user?.organizationId;

            if (!phoneNumber) {
                return reply.status(400).send({ error: 'Phone number is required' });
            }

            const result = await twilioService.makeCall(
                phoneNumber,
                twilioService.TWILIO_PHONE_NUMBER,
                userId,
                leadId,
                leadName,
                organizationId
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

        // ======================================
        // Notification routes (in-app bell)
        // ======================================
        const notificationService = require('./services/notification.service');
        const sseManager = require('./services/sse.manager');

        // Get notifications (paginated)
        protectedApp.get('/api/notifications', async (request, reply) => {
            const { page = 1, limit = 30, unreadOnly } = request.query;
            const result = await notificationService.getForUser(request.user._id, {
                page: parseInt(page),
                limit: parseInt(limit),
                unreadOnly: unreadOnly === 'true'
            });
            return reply.send({ success: true, ...result });
        });

        // Get unread count
        protectedApp.get('/api/notifications/unread-count', async (request, reply) => {
            const count = await notificationService.getUnreadCount(request.user._id);
            return reply.send({ success: true, count });
        });

        // Mark single notification as read
        protectedApp.patch('/api/notifications/:id/read', async (request, reply) => {
            const result = await notificationService.markRead(request.params.id, request.user._id);
            if (!result) return reply.code(404).send({ success: false, error: 'Notification not found' });
            return reply.send({ success: true });
        });

        // Mark all notifications as read
        protectedApp.patch('/api/notifications/read-all', async (request, reply) => {
            const result = await notificationService.markAllRead(request.user._id);
            return reply.send({ success: true, ...result });
        });

        // SSE stream for real-time notifications
        protectedApp.get('/api/notifications/stream', async (request, reply) => {
            const userId = request.user._id.toString();

            reply.raw.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'  // Disable nginx buffering
            });

            // Send initial heartbeat
            reply.raw.write('event: connected\ndata: {"status":"ok"}\n\n');

            // Register this client
            sseManager.addClient(userId, reply);

            // Send heartbeat every 30s to keep connection alive
            const heartbeat = setInterval(() => {
                try {
                    reply.raw.write(':heartbeat\n\n');
                } catch (_) {
                    clearInterval(heartbeat);
                }
            }, 30000);

            // Clean up on disconnect
            request.raw.on('close', () => {
                clearInterval(heartbeat);
                sseManager.removeClient(userId, reply);
            });

            // Don't let Fastify auto-close the response
            await reply;
        });

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

        // ============================================
        // Email (SMTP) Settings routes (owner/admin only)
        // ============================================

        // GET - Fetch current SMTP settings (password masked)
        protectedApp.get('/api/organization/email-settings', {
            preHandler: [requireRole(['owner', 'admin'])]
        }, async (request, reply) => {
            try {
                const Organization = require('./models/organization.model');
                const org = await Organization.findById(request.user.organizationId);
                if (!org) return reply.status(404).send({ success: false, error: 'Organization not found' });

                const smtp = org.smtp || {};
                return reply.send({
                    success: true,
                    emailSettings: {
                        host: smtp.host || '',
                        port: smtp.port || 587,
                        secure: smtp.secure || false,
                        user: smtp.user || '',
                        pass: smtp.pass ? '••••••••' : '',
                        fromName: smtp.fromName || '',
                        isConfigured: smtp.isConfigured || false
                    }
                });
            } catch (error) {
                return reply.status(500).send({ success: false, error: error.message });
            }
        });

        // PUT - Save SMTP settings
        protectedApp.put('/api/organization/email-settings', {
            preHandler: [requireRole(['owner', 'admin'])]
        }, async (request, reply) => {
            try {
                const Organization = require('./models/organization.model');
                const { host, port, secure, user, pass, fromName } = request.body || {};

                if (!host || !user || !pass) {
                    return reply.status(400).send({ success: false, error: 'SMTP host, email, and password are required' });
                }

                const updateFields = {
                    'smtp.host': host,
                    'smtp.port': port || 587,
                    'smtp.secure': secure || false,
                    'smtp.user': user,
                    'smtp.fromName': fromName || '',
                    'smtp.isConfigured': true
                };

                // Only update password if it's not the masked placeholder
                if (pass !== '••••••••') {
                    updateFields['smtp.pass'] = pass;
                }

                const org = await Organization.findByIdAndUpdate(
                    request.user.organizationId,
                    { $set: updateFields },
                    { new: true }
                );

                if (!org) return reply.status(404).send({ success: false, error: 'Organization not found' });

                return reply.send({
                    success: true,
                    message: 'Email settings saved successfully',
                    emailSettings: {
                        host: org.smtp.host,
                        port: org.smtp.port,
                        secure: org.smtp.secure,
                        user: org.smtp.user,
                        pass: '••••••••',
                        fromName: org.smtp.fromName,
                        isConfigured: org.smtp.isConfigured
                    }
                });
            } catch (error) {
                return reply.status(500).send({ success: false, error: error.message });
            }
        });

        // POST - Test SMTP connection by sending a test email
        protectedApp.post('/api/organization/email-settings/test', {
            preHandler: [requireRole(['owner', 'admin'])]
        }, async (request, reply) => {
            try {
                const Organization = require('./models/organization.model');
                const nodemailer = require('nodemailer');
                const { host, port, secure, user, pass, fromName } = request.body || {};

                if (!host || !user || !pass) {
                    return reply.status(400).send({ success: false, error: 'SMTP host, email, and password are required' });
                }

                // If password is masked, get from DB
                let actualPass = pass;
                if (pass === '••••••••') {
                    const org = await Organization.findById(request.user.organizationId);
                    if (!org?.smtp?.pass) {
                        return reply.status(400).send({ success: false, error: 'No saved password found. Please enter the password.' });
                    }
                    actualPass = org.smtp.pass;
                }

                const transporter = nodemailer.createTransport({
                    host: host,
                    port: port || 587,
                    secure: secure || false,
                    auth: { user, pass: actualPass }
                });

                // Send test email to the configured email itself
                await transporter.sendMail({
                    from: `"${fromName || 'Test'}" <${user}>`,
                    to: user,
                    subject: '✅ Pulsar CRM - SMTP Test Successful',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #f0fdf4; border-radius: 8px; border: 1px solid #86efac;">
                            <h2 style="color: #166534; margin-bottom: 10px;">✅ SMTP Configuration Successful!</h2>
                            <p style="color: #333;">Your email settings are working correctly. Agent credential emails will be sent from this address.</p>
                            <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">Sent at: ${new Date().toLocaleString()}</p>
                        </div>
                    `
                });

                return reply.send({ success: true, message: 'Test email sent successfully! Check your inbox.' });
            } catch (error) {
                console.error('SMTP test failed:', error);
                return reply.status(400).send({
                    success: false,
                    error: `SMTP test failed: ${error.message}`
                });
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
                    
                    // START BACKGROUND POLLING: Poll ElevenLabs for call result
                    // Since webhooks can't reach localhost, we poll the API after the call
                    if (result.conversationId && leadId) {
                        const conversationId = result.conversationId;
                        const PostCallOrchestrator = require('./services/postCall.orchestrator');
                        const elevenLabsWebhookService = require('./services/elevenlabs.webhook.service');
                        
                        console.log('\u{1F504} Starting background poll for conversation ' + conversationId);
                        
                        let pollCount = 0;
                        const maxPolls = 20;
                        const pollInterval = 15000;
                        
                        const pollTimer = setInterval(async () => {
                            pollCount++;
                            try {
                                console.log('\u{1F504} Poll attempt ' + pollCount + '/' + maxPolls + ' for ' + conversationId);
                                
                                const details = await elevenLabsWebhookService.fetchConversationDetails(conversationId);
                                
                                if (!details) {
                                    if (pollCount >= maxPolls) {
                                        console.log('\u23F0 Polling timed out for ' + conversationId);
                                        clearInterval(pollTimer);
                                    }
                                    return;
                                }
                                
                                const callStatus = details.status ? details.status.toLowerCase() : '';
                                console.log('   Conversation status: ' + callStatus);
                                
                                if (callStatus === 'done' || callStatus === 'completed' || callStatus === 'failed' || callStatus === 'ended') {
                                    clearInterval(pollTimer);
                                    console.log('\u2705 Call completed! Processing results for ' + conversationId);
                                    
                                    const payload = {
                                        type: 'post_call_transcription',
                                        data: {
                                            conversation_id: conversationId,
                                            status: details.status,
                                            call_duration_secs: details.call_duration_secs || (details.metadata && details.metadata.call_duration_secs),
                                            transcript: details.transcript,
                                            analysis: details.analysis,
                                            conversation_initiation_client_data: details.conversation_initiation_client_data || {
                                                dynamic_variables: {
                                                    lead_id: leadId,
                                                    lead_name: leadName || 'Customer'
                                                }
                                            },
                                            metadata: {
                                                leadId: leadId,
                                                source: 'polling'
                                            }
                                        }
                                    };
                                    
                                    const orchestratorResult = await PostCallOrchestrator.processPostCallWebhook(payload);
                                    console.log('\u2705 Post-call auto-status update complete:', JSON.stringify({
                                        conversationId,
                                        leadId,
                                        actionsExecuted: (orchestratorResult.actionsExecuted || []).length,
                                        intents: (orchestratorResult.analysis || {}).intents || []
                                    }));
                                } else if (pollCount >= maxPolls) {
                                    clearInterval(pollTimer);
                                    console.log('\u23F0 Polling timed out for ' + conversationId);
                                }
                            } catch (pollError) {
                                console.error('\u274C Poll error for ' + conversationId + ':', pollError.message);
                                if (pollCount >= maxPolls) clearInterval(pollTimer);
                            }
                        }, pollInterval);
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
                console.error('ElevenLabs call error:', error);
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
                const leadId = request.query.leadId;
                const summary = await elevenLabsService.getConversationSummary(phoneNumber);
                
                // Auto-update lead status if we have a completed call
                if (summary.conversationId) {
                    try {
                        const Lead = require('./models/Lead');
                        const mongoose = require('mongoose');
                        const { LEAD_STATUSES } = require('./constants');
                        
                        // Build query - try leadId first, fall back to phone number
                        let lead = null;
                        
                        if (leadId) {
                            const query = { $or: [{ zohoId: leadId }, { zohoLeadId: leadId }] };
                            if (mongoose.Types.ObjectId.isValid(leadId)) {
                                query.$or.push({ _id: leadId });
                            }
                            lead = await Lead.findOne(query);
                        }
                        
                        // Fallback: find by phone number (strip non-digits, match last 10)
                        if (!lead && phoneNumber) {
                            const phoneDigits = phoneNumber.replace(/\D/g, '').slice(-10);
                            lead = await Lead.findOne({
                                $or: [
                                    { phone: { $regex: phoneDigits } },
                                    { mobile: { $regex: phoneDigits } }
                                ]
                            });
                            if (lead) {
                                console.log('[Summary] Found lead by phone number:', lead._id.toString(), lead.name);
                            }
                        }
                        
                        if (lead) {
                            // Check if status already updated by this conversation
                            // Allow re-processing if status is still the default "Call Attended"
                            // (means text analysis wasn't available or didn't run properly before)
                            const alreadyProcessed = lead.notes && lead.notes.includes(summary.conversationId);
                            const isDefaultStatus = lead.status === 'Call Attended';
                            
                            if (!alreadyProcessed || isDefaultStatus) {
                                // Determine status from evaluation criteria OR by analyzing summary text
                                const evaluation = summary.evaluation || {};
                                const hasEvaluation = Object.keys(evaluation).length > 0;
                                let newStatus = (LEAD_STATUSES && LEAD_STATUSES.CALL_ATTENDED) || 'Call Attended';
                                
                                if (hasEvaluation) {
                                    // Use evaluation criteria if available
                                    if (evaluation.site_visit_requested === 'success' || evaluation.book_site_visit === true || evaluation.book_appointment === true) {
                                        newStatus = (LEAD_STATUSES && LEAD_STATUSES.APPOINTMENT_BOOKED) || 'Appointment Booked';
                                    } else if (evaluation.user_interested === 'success' || evaluation.interested === true || evaluation.interested === 'true') {
                                        newStatus = (LEAD_STATUSES && LEAD_STATUSES.INTERESTED) || 'Interested';
                                    } else if (evaluation.not_interested === 'success' || evaluation.not_interested === true || evaluation.not_interested === 'true') {
                                        newStatus = (LEAD_STATUSES && LEAD_STATUSES.NOT_INTERESTED) || 'Not Interested';
                                    }
                                } else if (summary.summary) {
                                    // No evaluation criteria — analyze the summary text for intent signals
                                    const summaryLower = (summary.summary || '').toLowerCase();
                                    
                                    // Not interested signals (check first — stronger negative signal)
                                    const notInterestedSignals = [
                                        'not interested',
                                        'no interest',
                                        'don\'t want',
                                        'doesn\'t want',
                                        'do not want',
                                        'does not want',
                                        'declined',
                                        'refused',
                                        'not looking',
                                        'not in the market',
                                        'hung up',
                                        'disconnected the call',
                                        'did not engage'
                                    ];
                                    
                                    // Appointment / site visit signals
                                    const appointmentSignals = [
                                        'schedule a visit',
                                        'scheduled a visit',
                                        'book a visit',
                                        'booked a visit',
                                        'site visit',
                                        'book appointment',
                                        'booked appointment',
                                        'schedule appointment',
                                        'scheduled appointment',
                                        'agreed to visit',
                                        'wants to visit',
                                        'come and see',
                                        'visit the property',
                                        'visit the site'
                                    ];
                                    
                                    // Interested signals
                                    const interestedSignals = [
                                        'interested in',
                                        'showed interest',
                                        'shows interest',
                                        'expressed interest',
                                        'wants to know more',
                                        'wanted more details',
                                        'requested details',
                                        'requested information',
                                        'asked for details',
                                        'asked for more',
                                        'send details',
                                        'send information',
                                        'send via whatsapp',
                                        'details via whatsapp',
                                        'information via whatsapp',
                                        'agreed to receive',
                                        'looking for',
                                        'wants to buy',
                                        'keen on',
                                        'positive response',
                                        'responded positively',
                                        'discussing budget',
                                        'discussed preferences'
                                    ];
                                    
                                    const isNotInterested = notInterestedSignals.some(function(s) { return summaryLower.includes(s); });
                                    const isAppointment = appointmentSignals.some(function(s) { return summaryLower.includes(s); });
                                    const isInterested = interestedSignals.some(function(s) { return summaryLower.includes(s); });
                                    
                                    console.log('[Summary] Text analysis:', {
                                        isNotInterested, isAppointment, isInterested,
                                        summaryPreview: summaryLower.substring(0, 150)
                                    });
                                    
                                    if (isAppointment) {
                                        newStatus = (LEAD_STATUSES && LEAD_STATUSES.APPOINTMENT_BOOKED) || 'Appointment Booked';
                                    } else if (isNotInterested && !isInterested) {
                                        // Clearly not interested
                                        newStatus = (LEAD_STATUSES && LEAD_STATUSES.NOT_INTERESTED) || 'Not Interested';
                                    } else if (isNotInterested && isInterested) {
                                        // Mixed signals — "initially responded positively but then stated not interested"
                                        // The final sentiment wins — check if "not interested" appears after interested signals
                                        const lastNotInterested = summaryLower.lastIndexOf('not interested');
                                        const lastInterested = Math.max(
                                            summaryLower.lastIndexOf('interested in'),
                                            summaryLower.lastIndexOf('requested details'),
                                            summaryLower.lastIndexOf('responded positively')
                                        );
                                        if (lastNotInterested > lastInterested) {
                                            newStatus = (LEAD_STATUSES && LEAD_STATUSES.NOT_INTERESTED) || 'Not Interested';
                                        } else {
                                            newStatus = (LEAD_STATUSES && LEAD_STATUSES.INTERESTED) || 'Interested';
                                        }
                                    } else if (isInterested) {
                                        newStatus = (LEAD_STATUSES && LEAD_STATUSES.INTERESTED) || 'Interested';
                                    }
                                    // else: no clear signals, stays as "Call Attended"
                                }
                                
                                console.log('[Summary] Final status:', newStatus, '| alreadyProcessed:', alreadyProcessed, '| isDefaultStatus:', isDefaultStatus);
                                
                                // If re-processing, only update if status improved (not still Call Attended)
                                if (alreadyProcessed && isDefaultStatus && newStatus === 'Call Attended') {
                                    console.log('[Summary] Re-processing but no status improvement, skipping update');
                                } else {
                                    // Update lead in MongoDB
                                    const noteDate = new Date().toLocaleString();
                                    const newNote = '\n\n--- AI Call Auto-Update (' + noteDate + ') ---\n' +
                                        'Conversation: ' + summary.conversationId + '\n' +
                                        'Status: ' + newStatus + '\n' +
                                        'Summary: ' + (summary.summary || 'No summary');
                                    
                                    lead.status = newStatus;
                                    // If re-processing, replace the old note for this conversation
                                    if (alreadyProcessed && lead.notes) {
                                        const convMarker = 'Conversation: ' + summary.conversationId;
                                        const noteStart = lead.notes.indexOf('--- AI Call Auto-Update');
                                        if (noteStart > 0) {
                                            // Find the section for this specific conversation
                                            const sections = lead.notes.split('\n\n--- AI Call Auto-Update');
                                            const filtered = sections.filter(function(s) { return s.indexOf(convMarker) === -1 || s === sections[0]; });
                                            lead.notes = filtered.join('\n\n--- AI Call Auto-Update') + newNote;
                                        } else {
                                            lead.notes = (lead.notes || '') + newNote;
                                        }
                                    } else {
                                        lead.notes = (lead.notes || '') + newNote;
                                    }
                                    lead.lastCallAt = new Date();
                                    lead.statusUpdatedAt = new Date();
                                    await lead.save();
                                
                                    console.log('\u2705 Auto-updated lead status from AI call summary:', {
                                        leadId: lead._id.toString(),
                                        newStatus,
                                        conversationId: summary.conversationId
                                    });
                                
                                    // Sync to Zoho in background
                                    if (lead.zohoId) {
                                        const zohoClient = require('./clients/zoho.client');
                                        zohoClient.updateLead(lead.zohoId, { Lead_Status: newStatus })
                                            .then(function(r) { return r.success ? console.log('Zoho synced') : console.warn('Zoho sync failed'); })
                                            .catch(function(e) { console.warn('Zoho sync error:', e.message); });
                                    }
                                
                                    // Add the updated status to the response
                                    summary.statusUpdated = true;
                                    summary.newStatus = newStatus;
                                }
                            }
                        }
                    } catch (statusError) {
                        console.error('Auto-status update error (non-blocking):', statusError.message);
                    }
                }
                
                return { success: true, data: summary };
            } catch (error) {
                console.error('ElevenLabs summary error:', error);
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
        const twilioService = require('./twilio/twilio.service');
        const toNumber = request.body.To || request.body.to;
        let twiml;

        // Check if it's a phone number or client
        if (toNumber && toNumber.startsWith('+')) {
            twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioService.TWILIO_PHONE_NUMBER}">
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

    // Dedup set: track processed conversationIds to prevent race conditions
    const processedConversations = new Set();
    const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes
    function markProcessed(conversationId) {
        if (!conversationId) return false;
        if (processedConversations.has(conversationId)) return true;
        processedConversations.add(conversationId);
        setTimeout(() => processedConversations.delete(conversationId), DEDUP_TTL_MS);
        return false;
    }
    app.decorate('markProcessed', markProcessed);

    // ElevenLabs post-call webhook (main entry point)
    const elevenLabsWebhookService = require('./services/elevenlabs.webhook.service');
    
    app.post('/webhook/elevenlabs', async (request, reply) => {
        try {
            const convId = request.body?.data?.conversation_id || request.body?.conversation_id;
            if (convId && markProcessed(convId)) {
                console.log('Skipping duplicate webhook for conversation ' + convId);
                return reply.send({ status: 'already_processed' });
            }
            const result = await elevenLabsWebhookService.handleWebhook(request.body);
            return reply.send({ status: 'received', ...result });
        } catch (error) {
            console.error('ElevenLabs webhook error:', error);
            return reply.send({ status: 'error', error: error.message });
        }
    });

    // Mirror under /api/ prefix for Nginx routing
    app.post('/api/webhook/elevenlabs', async (request, reply) => {
        try {
            const convId = request.body?.data?.conversation_id || request.body?.conversation_id;
            if (convId && markProcessed(convId)) {
                return reply.send({ status: 'already_processed' });
            }
            const result = await elevenLabsWebhookService.handleWebhook(request.body);
            return reply.send({ status: 'received', ...result });
        } catch (error) {
            console.error('ElevenLabs webhook error:', error);
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

    // Twilio call status callback (legacy path)
    app.post('/elevenlabs/status', async (request, reply) => {
        const { CallSid, CallStatus, CallDuration } = request.body;
        console.log(`Call status (legacy): ${CallSid} -> ${CallStatus}`);
        
        try {
            const twilioService = require('./twilio/twilio.service');
            const { PostCallOrchestrator } = require('./services/postCall.orchestrator');

            const result = await twilioService.updateCallStatus(CallSid, CallStatus, CallDuration);

            // Also update lead status for terminal call states
            const terminalStatuses = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
            if (terminalStatuses.includes(CallStatus) && result.callLog) {
                const callLog = result.callLog;
                PostCallOrchestrator.processCallStatus({
                    callSid: CallSid,
                    status: CallStatus,
                    phoneNumber: callLog.to || callLog.phoneNumber,
                    duration: CallDuration,
                    leadId: callLog.leadId
                }).catch(err => console.error('Post-call lead update error:', err));
            }
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
                'POST /api/webhook/elevenlabs',
                'POST /api/twilio/voice',
                'POST /api/twilio/status',
                'POST /ai-call-webhook',
                'POST /elevenlabs/status'
            ]
        });
    });

    // ── Production: Serve built frontend from dist/ ──
    const fs = require('fs');
    const distPath = path.join(__dirname, '../../dist');
    if (fs.existsSync(distPath)) {
        await app.register(require('@fastify/static'), {
            root: distPath,
            prefix: '/',
            decorateReply: false,
            wildcard: false
        });

        // SPA fallback: serve index.html for all non-API routes
        app.setNotFoundHandler((request, reply) => {
            if (request.url.startsWith('/api') || request.url.startsWith('/auth') || request.url.startsWith('/uploads') || request.url.startsWith('/webhook')) {
                return reply.code(404).send({ error: 'Not found' });
            }
            return reply.sendFile('index.html', distPath);
        });
        logger.info('📦 Serving built frontend from dist/');
    }

    return app;
}

module.exports = buildApp;
