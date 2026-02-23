/**
 * Calendar Controller
 * HTTP handlers for calendar event CRUD.
 */

const calendarService = require('../services/calendar.service');

/**
 * POST /api/calendar/events
 */
async function createEvent(request, reply) {
    const creator = {
        id: request.user.id || request.user._id,
        organizationId: request.user.organizationId
    };

    const event = await calendarService.createEvent(request.body, creator);
    return reply.code(201).send({ success: true, data: event });
}

/**
 * GET /api/calendar/events
 * Query: startDate, endDate, type, assignedTo
 */
async function getEvents(request, reply) {
    const organizationId = request.user.organizationId;
    const { startDate, endDate, type, assignedTo } = request.query;

    const events = await calendarService.getEvents(organizationId, {
        startDate,
        endDate,
        type,
        assignedTo
    });

    return reply.code(200).send({ success: true, data: events });
}

/**
 * GET /api/calendar/events/:id
 */
async function getEventById(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const event = await calendarService.getEventById(id, organizationId);
    return reply.code(200).send({ success: true, data: event });
}

/**
 * PUT /api/calendar/events/:id
 */
async function updateEvent(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const event = await calendarService.updateEvent(id, organizationId, request.body);
    return reply.code(200).send({ success: true, data: event });
}

/**
 * DELETE /api/calendar/events/:id
 */
async function deleteEvent(request, reply) {
    const { id } = request.params;
    const organizationId = request.user.organizationId;

    const result = await calendarService.deleteEvent(id, organizationId);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * GET /api/calendar/upcoming
 * Get upcoming events for the current user
 */
async function getUpcoming(request, reply) {
    const userId = request.user.id || request.user._id;
    const organizationId = request.user.organizationId;
    const { limit = 10 } = request.query;

    const events = await calendarService.getUpcomingForUser(userId, organizationId, parseInt(limit));
    return reply.code(200).send({ success: true, data: events });
}

module.exports = {
    createEvent,
    getEvents,
    getEventById,
    updateEvent,
    deleteEvent,
    getUpcoming
};
