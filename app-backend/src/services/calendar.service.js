/**
 * Calendar Service
 * Business logic for calendar events — site visits, meetings, calls, follow-ups.
 */

const CalendarEvent = require('../models/CalendarEvent');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { NotFoundError, ValidationError } = require('../errors/AppError');
const logger = require('../utils/logger');

class CalendarService {
    /**
     * Create a calendar event
     */
    async createEvent({ title, description, type, startAt, endAt, allDay, location, leadId, assignedTo, reminderMinutes, color, metadata }, creator) {
        if (!title || !startAt) {
            throw new ValidationError('Title and start time are required');
        }

        const start = new Date(startAt);
        if (isNaN(start.getTime())) {
            throw new ValidationError('Invalid start date');
        }

        let end = endAt ? new Date(endAt) : new Date(start.getTime() + 60 * 60 * 1000); // default +1 hour
        if (allDay) {
            end = new Date(start);
            end.setHours(23, 59, 59, 999);
        }

        // Validate lead exists if provided
        if (leadId) {
            const lead = await Lead.findOne({ _id: leadId, organizationId: creator.organizationId });
            if (!lead) throw new NotFoundError('Lead not found');
        }

        const event = await CalendarEvent.create({
            organizationId: creator.organizationId,
            createdBy: creator.id,
            assignedTo: assignedTo || creator.id,
            leadId: leadId || null,
            title: title.trim(),
            description: (description || '').trim(),
            type: type || 'meeting',
            startAt: start,
            endAt: end,
            allDay: allDay || false,
            location: (location || '').trim(),
            color: color || this._getDefaultColor(type || 'meeting'),
            reminderMinutes: reminderMinutes ?? 30,
            metadata: metadata || {}
        });

        // Log activity if tied to a lead
        if (leadId) {
            try {
                await Activity.create({
                    type: type === 'call' ? 'call' : 'appointment',
                    description: `${type || 'Event'} scheduled: ${title}`,
                    userId: creator.id,
                    userName: creator.name || creator.email,
                    leadId,
                    organizationId: creator.organizationId,
                    scheduledAt: start,
                    metadata: { calendarEventId: event._id }
                });
            } catch (err) {
                logger.warn('Failed to log calendar activity', { error: err.message });
            }
        }

        return event.toObject();
    }

    /**
     * Get events for a date range
     */
    async getEvents(organizationId, { startDate, endDate, assignedTo, type, status, leadId } = {}) {
        const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
        const end = endDate ? new Date(endDate) : new Date(new Date().setDate(new Date().getDate() + 90));

        return CalendarEvent.getEvents(organizationId, start, end, { assignedTo, type, status, leadId });
    }

    /**
     * Get a single event
     */
    async getEventById(eventId, organizationId) {
        const event = await CalendarEvent.findOne({ _id: eventId, organizationId, isDeleted: false })
            .populate('leadId', 'name email phone')
            .populate('assignedTo', 'name email')
            .populate('createdBy', 'name email')
            .lean();

        if (!event) throw new NotFoundError('Calendar event not found');
        return event;
    }

    /**
     * Update an event
     */
    async updateEvent(eventId, organizationId, updates) {
        const event = await CalendarEvent.findOne({ _id: eventId, organizationId, isDeleted: false });
        if (!event) throw new NotFoundError('Calendar event not found');

        const allowedFields = ['title', 'description', 'type', 'startAt', 'endAt', 'allDay', 'location', 'status', 'color', 'reminderMinutes', 'assignedTo', 'metadata'];
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                event[key] = updates[key];
            }
        }

        await event.save();
        return event.toObject();
    }

    /**
     * Delete (soft) an event
     */
    async deleteEvent(eventId, organizationId) {
        const event = await CalendarEvent.findOne({ _id: eventId, organizationId, isDeleted: false });
        if (!event) throw new NotFoundError('Calendar event not found');

        event.isDeleted = true;
        await event.save();
        return { deleted: true };
    }

    /**
     * Get upcoming events for a user (for dashboard widget)
     */
    async getUpcomingForUser(userId, organizationId, limit = 5) {
        return CalendarEvent.find({
            organizationId,
            assignedTo: userId,
            startAt: { $gte: new Date() },
            status: 'scheduled',
            isDeleted: false
        })
            .sort({ startAt: 1 })
            .limit(limit)
            .populate('leadId', 'name phone')
            .lean();
    }

    _getDefaultColor(type) {
        const colors = {
            site_visit: '#f97316',    // orange
            appointment: '#f97316',
            call: '#22c55e',          // green
            meeting: '#8b5cf6',       // purple
            follow_up: '#3b82f6',     // blue
            other: '#6b7280'          // gray
        };
        return colors[type] || '#3b82f6';
    }
}

module.exports = new CalendarService();
