/**
 * Leads Controller
 * HTTP handlers for lead management endpoints
 */

const leadsService = require('./leads.service');

/**
 * GET /api/leads
 */
async function getLeads(request, reply) {
    const { page, limit, status, source, owner } = request.query;

    const result = await leadsService.getLeads(
        request.user,
        { page, limit, status, source, owner }
    );

    return reply.code(200).send(result);
}

/**
 * GET /api/leads/:id
 */
async function getLead(request, reply) {
    const { id } = request.params;

    const lead = await leadsService.getLead(request.user, id);

    return reply.code(200).send(lead);
}

/**
 * POST /api/leads
 */
async function createLead(request, reply) {
    const leadData = request.body;

    // Validate required fields — no empty leads allowed
    const name = (leadData.name || '').trim();
    if (!name || name === 'undefined') {
        return reply.code(400).send({
            success: false,
            error: 'Lead name is required. Cannot create a lead without a name.'
        });
    }
    leadData.name = name;

    // Inject user context for organization association
    if (request.user) {
        leadData.user = request.user;
        leadData.organizationId = request.user.organizationId;
    }

    const result = await leadsService.createLead(leadData);

    return reply.code(201).send(result);
}

/**
 * PUT /api/leads/:id
 * Update a lead
 */
async function updateLead(request, reply) {
    const { id } = request.params;
    const updateData = request.body;

    const lead = await leadsService.updateLead(request.user, id, updateData);

    return reply.code(200).send(lead);
}

/**
 * DELETE /api/leads/:id
 * Delete a single lead
 */
async function deleteLead(request, reply) {
    const { id } = request.params;
    const result = await leadsService.deleteLead(request.user, id);
    return reply.code(200).send(result);
}

/**
 * POST /api/leads/bulk-delete
 * Delete multiple leads at once
 */
async function bulkDeleteLeads(request, reply) {
    const { leadIds } = request.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return reply.code(400).send({ success: false, error: 'Please provide leadIds array' });
    }

    const result = await leadsService.deleteLeads(request.user, leadIds);
    return reply.code(200).send(result);
}

/**
 * PATCH /api/leads/:id/status
 * Update lead status only
 */
async function updateLeadStatus(request, reply) {
    const { id } = request.params;
    const { status } = request.body;

    const lead = await leadsService.updateLead(request.user, id, { status });

    return reply.code(200).send(lead);
}

/**
 * POST /api/leads/:id/site-visit (also /api/leads/:id/appointment)
 * Schedule an appointment (backward-compat: site visit)
 * Supports property-based appointments (real estate) or resource-based appointments (generic)
 */
async function postSiteVisit(request, reply) {
    const leadId = request.params.id;
    const { scheduledAt, propertyId, inventoryItemId, appointmentType } = request.body;
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const visit = await leadsService.confirmSiteVisit(leadId, scheduledAt, userId, organizationId, propertyId, inventoryItemId, appointmentType);
    return reply.code(201).send(visit);
}

/**
 * GET /api/site-visits/today (also /api/appointments/today)
 */
async function getTodaySiteVisits(request, reply) {
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const visits = await leadsService.getSiteVisitsForToday(organizationId, userId);
    return reply.send(visits);
}

/**
 * POST /api/activities
 */
async function postActivity(request, reply) {
    try {
        const organizationId = request.user?.organizationId;
        const activity = await leadsService.createActivity(request.body, organizationId);
        return reply.code(201).send(activity);
    } catch (error) {
        request.log.error(error);
        return reply.code(400).send({
            success: false,
            error: error.message || 'Failed to create activity'
        });
    }
}

/**
 * GET /api/activities/recent
 */
async function getRecentActivitiesHandler(request, reply) {
    const organizationId = request.user?.organizationId;
    const activities = await leadsService.getRecentActivities(organizationId, 50);
    return reply.send(activities);
}

/**
 * GET /api/activities/me - Get current user's activities
 */
async function getMyActivities(request, reply) {
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const limit = parseInt(request.query.limit) || 50;
    const activities = await leadsService.getActivitiesByUser(organizationId, userId, limit);
    return reply.send(activities);
}

/**
 * GET /api/activities/all - Get all activities (owner/admin/manager only)
 */
async function getAllActivitiesHandler(request, reply) {
    const organizationId = request.user?.organizationId;
    const limit = parseInt(request.query.limit) || 100;
    const activities = await leadsService.getAllActivities(organizationId, limit);
    return reply.send(activities);
}

/**
 * GET /api/call-logs/me - Get current user's call logs
 */
async function getMyCallLogs(request, reply) {
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const limit = parseInt(request.query.limit) || 50;
    const callLogs = await leadsService.getCallLogsByUser(organizationId, userId, limit);
    return reply.send(callLogs);
}

/**
 * GET /api/call-logs/all - Get all call logs (owner/admin/manager only)
 */
async function getAllCallLogsHandler(request, reply) {
    const organizationId = request.user?.organizationId;
    const limit = parseInt(request.query.limit) || 100;
    const callLogs = await leadsService.getAllCallLogs(organizationId, limit);
    return reply.send(callLogs);
}

/**
 * GET /api/site-visits/me (also /api/appointments/me)
 */
async function getMySiteVisits(request, reply) {
    const userId = request.user._id;
    const organizationId = request.user.organizationId;
    const limit = parseInt(request.query.limit) || 50;
    const visits = await leadsService.getSiteVisitsByUser(organizationId, userId, limit);
    return reply.send(visits);
}

/**
 * GET /api/site-visits/all (also /api/appointments/all)
 */
async function getAllSiteVisitsHandler(request, reply) {
    const organizationId = request.user?.organizationId;
    const limit = parseInt(request.query.limit) || 100;
    const visits = await leadsService.getAllSiteVisits(organizationId, limit);
    return reply.send(visits);
}

/**
 * GET /api/tasks - Get tasks/reminders for current user
 */
async function getTasks(request, reply) {
    const userId = request.user._id;
    const organizationId = request.user?.organizationId;
    const { status, priority } = request.query;
    const tasks = await leadsService.getTasks(userId, { status, priority, organizationId });
    return reply.send(tasks);
}

/**
 * POST /api/tasks - Create a new task
 */
async function createTask(request, reply) {
    const userId = request.user._id;
    const userName = request.user.name || request.user.email;
    const organizationId = request.user?.organizationId;
    const taskData = { ...request.body, createdBy: userId, organizationId };
    const task = await leadsService.createTask(taskData);
    return reply.code(201).send(task);
}

/**
 * POST /api/tasks/assign/:agentId - Create a task for a specific agent (owner only)
 */
async function createTaskForAgent(request, reply) {
    const userRole = request.user?.role;
    const organizationId = request.user?.organizationId;
    
    // Only owners and managers can create tasks for other agents
    if (!['owner', 'admin', 'manager'].includes(userRole)) {
        return reply.status(403).send({ error: 'Only owners/managers can create tasks for agents' });
    }

    const { agentId } = request.params;
    const { title, description, priority, dueDate, leadId, type } = request.body;

    if (!title) {
        return reply.status(400).send({ error: 'Task title is required' });
    }

    if (!agentId) {
        return reply.status(400).send({ error: 'Agent ID is required' });
    }

    // Verify agent exists and belongs to the same organization
    const User = require('../models/User');
    const agent = await User.findById(agentId);
    if (!agent || agent.organizationId !== organizationId) {
        return reply.status(404).send({ error: 'Agent not found' });
    }

    try {
        const taskData = {
            assignedTo: agentId,
            createdBy: request.user._id,
            organizationId,
            title,
            description,
            priority: priority || 'medium',
            dueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000),
            leadId: leadId || null,
            type: type || 'manual_action'
        };

        const task = await leadsService.createTask(taskData);
        return reply.code(201).send(task);
    } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to create task', details: error.message });
    }
}

/**
 * PATCH /api/tasks/:id - Update task (mark complete, change priority, etc.)
 */
async function updateTask(request, reply) {
    const { id } = request.params;
    const userId = request.user._id;
    const organizationId = request.user?.organizationId;
    const updates = request.body;
    const task = await leadsService.updateTask(id, userId, updates, organizationId);
    return reply.send(task);
}

/**
 * DELETE /api/tasks/:id - Delete a task
 */
async function deleteTask(request, reply) {
    const { id } = request.params;
    const userId = request.user._id;
    const organizationId = request.user?.organizationId;
    await leadsService.deleteTask(id, userId, organizationId);
    return reply.code(204).send();
}

/**
 * GET /api/users - Get all users (for team members list)
 */
async function getUsers(request, reply) {
    const organizationId = request.user?.organizationId;
    const users = await leadsService.getUsers(organizationId);
    return reply.send(users);
}

/**
 * POST /api/site-visits/sync-google-sheets (also /api/appointments/sync-google-sheets)
 */
async function syncSiteVisitsToGoogleSheets(request, reply) {
    try {
        const result = await leadsService.syncAllSiteVisitsToGoogleSheets();
        return reply.send(result);
    } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'Failed to sync appointments to Google Sheets', details: error.message });
    }
}

module.exports = {
    getLeads,
    getLead,
    createLead,
    updateLead,
    deleteLead,
    bulkDeleteLeads,
    updateLeadStatus,
    postSiteVisit,
    getTodaySiteVisits,
    postActivity,
    getRecentActivitiesHandler,
    getMyActivities,
    getAllActivitiesHandler,
    getMyCallLogs,
    getAllCallLogsHandler,
    getMySiteVisits,
    getAllSiteVisitsHandler,
    getTasks,
    createTask,
    createTaskForAgent,
    updateTask,
    deleteTask,
    getUsers,
    syncSiteVisitsToGoogleSheets
};
