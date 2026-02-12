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
 */
async function postSiteVisit(request, reply) {
    const leadId = request.params.id;
    const { scheduledAt, propertyId, appointmentType } = request.body;
    const userId = request.user._id;
    const visit = await leadsService.confirmSiteVisit(leadId, scheduledAt, userId, propertyId, appointmentType);
    return reply.code(201).send(visit);
}

/**
 * GET /api/site-visits/today (also /api/appointments/today)
 */
async function getTodaySiteVisits(request, reply) {
    const userId = request.user._id;
    const visits = await leadsService.getSiteVisitsForToday(userId);
    return reply.send(visits);
}

/**
 * POST /api/activities
 */
async function postActivity(request, reply) {
    try {
        const activity = await leadsService.createActivity(request.body);
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
    const activities = await leadsService.getRecentActivities(50);
    return reply.send(activities);
}

/**
 * GET /api/activities/me - Get current user's activities
 */
async function getMyActivities(request, reply) {
    const userId = request.user._id;
    const limit = parseInt(request.query.limit) || 50;
    const activities = await leadsService.getActivitiesByUser(userId, limit);
    return reply.send(activities);
}

/**
 * GET /api/activities/all - Get all activities (owner/admin/manager only)
 */
async function getAllActivitiesHandler(request, reply) {
    const limit = parseInt(request.query.limit) || 100;
    const activities = await leadsService.getAllActivities(limit);
    return reply.send(activities);
}

/**
 * GET /api/call-logs/me - Get current user's call logs
 */
async function getMyCallLogs(request, reply) {
    const userId = request.user._id;
    const limit = parseInt(request.query.limit) || 50;
    const callLogs = await leadsService.getCallLogsByUser(userId, limit);
    return reply.send(callLogs);
}

/**
 * GET /api/call-logs/all - Get all call logs (owner/admin/manager only)
 */
async function getAllCallLogsHandler(request, reply) {
    const limit = parseInt(request.query.limit) || 100;
    const callLogs = await leadsService.getAllCallLogs(limit);
    return reply.send(callLogs);
}

/**
 * GET /api/site-visits/me (also /api/appointments/me)
 */
async function getMySiteVisits(request, reply) {
    const userId = request.user._id;
    const limit = parseInt(request.query.limit) || 50;
    const visits = await leadsService.getSiteVisitsByUser(userId, limit);
    return reply.send(visits);
}

/**
 * GET /api/site-visits/all (also /api/appointments/all)
 */
async function getAllSiteVisitsHandler(request, reply) {
    const limit = parseInt(request.query.limit) || 100;
    const visits = await leadsService.getAllSiteVisits(limit);
    return reply.send(visits);
}

/**
 * GET /api/tasks - Get tasks/reminders for current user
 */
async function getTasks(request, reply) {
    const userId = request.user._id;
    const { status, priority } = request.query;
    const tasks = await leadsService.getTasks(userId, { status, priority });
    return reply.send(tasks);
}

/**
 * POST /api/tasks - Create a new task
 */
async function createTask(request, reply) {
    const userId = request.user._id;
    const userName = request.user.name || request.user.email;
    const taskData = { ...request.body, userId, userName };
    const task = await leadsService.createTask(taskData);
    return reply.code(201).send(task);
}

/**
 * PATCH /api/tasks/:id - Update task (mark complete, change priority, etc.)
 */
async function updateTask(request, reply) {
    const { id } = request.params;
    const userId = request.user._id;
    const updates = request.body;
    const task = await leadsService.updateTask(id, userId, updates);
    return reply.send(task);
}

/**
 * DELETE /api/tasks/:id - Delete a task
 */
async function deleteTask(request, reply) {
    const { id } = request.params;
    const userId = request.user._id;
    await leadsService.deleteTask(id, userId);
    return reply.code(204).send();
}

/**
 * GET /api/users - Get all users (for team members list)
 */
async function getUsers(request, reply) {
    const users = await leadsService.getUsers();
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
    updateTask,
    deleteTask,
    getUsers,
    syncSiteVisitsToGoogleSheets
};
