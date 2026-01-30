/**
 * Fastify Application Setup
 * Main application configuration and routes
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

// Errors
const { AppError } = require('./utils/errors');

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
        } : true
    });

    // Add rawBody support for webhook signature verification
    // This captures the raw body before JSON parsing for HMAC verification
    app.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
        try {
            // Store raw body on request for webhook signature verification
            req.rawBody = body;
            const json = JSON.parse(body);
            done(null, json);
        } catch (err) {
            err.statusCode = 400;
            done(err, undefined);
        }
    });

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
        // Log error
        request.log.error(error);

        // Handle operational errors
        if (error instanceof AppError) {
            return reply.code(error.statusCode).send({
                success: false,
                error: error.message
            });
        }

        // Handle Fastify validation errors
        if (error.validation) {
            return reply.code(400).send({
                success: false,
                error: 'Validation failed',
                details: error.validation
            });
        }

        // Unknown errors
        const statusCode = error.statusCode || 500;
        return reply.code(statusCode).send({
            success: false,
            error: config.nodeEnv === 'development' ? error.message : 'Internal server error'
        });
    });

    // Health check
    app.get('/health', async (request, reply) => {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            service: 'app-backend',
            version: '1.0.0'
        };
    });

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
    app.post('/auth/register', authController.register); // NEW: User registration
    app.post('/auth/login', authController.login);
    app.post('/auth/refresh', authController.refresh);
    app.post('/auth/logout', authController.logout);

    // Knowledge Base routes (PUBLIC - for ElevenLabs AI to crawl)
    const knowledgeBaseRoutes = require('./routes/knowledgeBase.routes');
    app.register(knowledgeBaseRoutes, { prefix: '/api/knowledge-base' });

    // WhatsApp Webhook routes (PUBLIC - for Meta to call)
    // These MUST be outside authentication as Meta calls them directly
    const whatsappWebhookRoutes = require('./routes/whatsapp.webhook.routes');
    app.register(whatsappWebhookRoutes, { prefix: '/webhook/whatsapp' });

    // ElevenLabs Webhook routes (PUBLIC - for ElevenLabs to call)
    // These MUST be outside authentication as ElevenLabs calls them directly
    const elevenLabsWebhookRoutes = require('./routes/elevenlabs.webhook.routes');
    app.register(elevenLabsWebhookRoutes, { prefix: '/webhook/elevenlabs' });

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

        // Add auth decorator for nested routes
        protectedApp.decorate('auth', requireAuth);

        // Leads routes
        protectedApp.get('/api/leads', leadsController.getLeads);
        protectedApp.get('/api/leads/:id', leadsController.getLead);
        protectedApp.post('/api/leads', leadsController.createLead);
        protectedApp.put('/api/leads/:id', leadsController.updateLead);
        protectedApp.patch('/api/leads/:id/status', leadsController.updateLeadStatus);

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
        protectedApp.post('/api/twilio/call', async (request, reply) => {
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

        // Site Visit routes
        protectedApp.post('/api/leads/:id/site-visit', leadsController.postSiteVisit);
        protectedApp.get('/api/site-visits/today', leadsController.getTodaySiteVisits);
        protectedApp.get('/api/site-visits/me', leadsController.getMySiteVisits);
        protectedApp.get('/api/site-visits/all', {
            preHandler: requireRole(['owner', 'admin', 'manager'])
        }, leadsController.getAllSiteVisitsHandler);
        
        // Google Sheets sync for site visits
        protectedApp.post('/api/site-visits/sync-google-sheets', {
            preHandler: requireRole(['owner', 'admin'])
        }, leadsController.syncSiteVisitsToGoogleSheets);

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

        // Task routes
        protectedApp.get('/api/tasks', leadsController.getTasks);
        protectedApp.post('/api/tasks', leadsController.createTask);
        protectedApp.patch('/api/tasks/:id', leadsController.updateTask);
        protectedApp.delete('/api/tasks/:id', leadsController.deleteTask);

        // User routes
        protectedApp.get('/api/users', leadsController.getUsers);

        // User Management routes (owner/admin only)
        const usersController = require('./users/users.controller');
        protectedApp.get('/api/users/pending', {
            preHandler: requireRole(['owner', 'admin'])
        }, usersController.getPendingUsers);
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

        // Agents route (for property assignment)
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
        
        // Check for booking conflicts
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

        // Zoho Sync routes (owner/admin only)
        protectedApp.post('/api/sync/call-log/:callLogId', {
            preHandler: requireRole(['owner', 'admin'])
        }, syncController.syncCallLog);

        protectedApp.post('/api/sync/activity/:activityId', {
            preHandler: requireRole(['owner', 'admin'])
        }, syncController.syncActivity);

        protectedApp.post('/api/sync/site-visit/:siteVisitId', {
            preHandler: requireRole(['owner', 'admin'])
        }, syncController.syncSiteVisit);

        protectedApp.post('/api/sync/pending', {
            preHandler: requireRole(['owner', 'admin'])
        }, syncController.syncAllPending);

        // Upload routes
        const uploadRoutes = require('./routes/upload');
        protectedApp.register(uploadRoutes, { prefix: '/api/upload' });

        // ElevenLabs Sync
        const elevenLabsController = require('./controllers/elevenLabs.controller');
        protectedApp.post('/api/sync/elevenlabs', {
            preHandler: requireRole(['owner', 'admin'])
        }, elevenLabsController.syncHistory);
    });

    // Automation routes (outside protected for now - allows unauthenticated access in dev)
    const automationRoutes = require('./routes/automation.routes');
    await app.register(automationRoutes, { prefix: '/api/automations' });

    // WhatsApp routes (outside protected for now - allows unauthenticated access in dev)
    const whatsappRoutes = require('./routes/whatsapp.routes');
    await app.register(whatsappRoutes, { prefix: '/api/whatsapp' });

    // Zoho CRM Integration routes (requires auth)
    app.register(async function (zohoProtectedApp) {
        zohoProtectedApp.addHook('onRequest', requireAuth);
        const zohoRoutes = require('./routes/zoho.routes');
        await zohoProtectedApp.register(zohoRoutes, { prefix: '/api/integrations/zoho' });
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

    return app;
}

module.exports = buildApp;
