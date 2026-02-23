/**
 * Calendar Routes
 * Fastify plugin for calendar event endpoints.
 * Prefix: /api/calendar
 */

const calendarController = require('../controllers/calendar.controller');

async function calendarRoutes(fastify, options) {
    // Create event
    fastify.post('/events', calendarController.createEvent);

    // List events (with date range, type, assignee filters)
    fastify.get('/events', calendarController.getEvents);

    // Get upcoming events for current user
    fastify.get('/upcoming', calendarController.getUpcoming);

    // Get single event
    fastify.get('/events/:id', calendarController.getEventById);

    // Update event
    fastify.put('/events/:id', calendarController.updateEvent);

    // Delete event
    fastify.delete('/events/:id', calendarController.deleteEvent);
}

module.exports = calendarRoutes;
