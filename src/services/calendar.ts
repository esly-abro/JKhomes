/**
 * Calendar API Service
 * Frontend service for calendar event CRUD.
 */

import api from './api';

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  type: 'site_visit' | 'appointment' | 'call' | 'meeting' | 'follow_up' | 'other';
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  color?: string;
  reminderMinutes?: number;
  leadId?: string | { _id: string; name: string };
  assignedTo?: string | { _id: string; name: string };
  createdBy?: string | { _id: string; name: string };
  createdAt: string;
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  type: CalendarEvent['type'];
  startAt: string;
  endAt?: string;
  allDay?: boolean;
  location?: string;
  leadId?: string;
  assignedTo?: string;
  reminderMinutes?: number;
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(payload: CreateEventPayload): Promise<CalendarEvent> {
  const { data } = await api.post('/api/calendar/events', payload);
  return data.data;
}

/**
 * Get events for a date range
 */
export async function getCalendarEvents(params: {
  startDate?: string;
  endDate?: string;
  type?: string;
  assignedTo?: string;
} = {}): Promise<CalendarEvent[]> {
  const { data } = await api.get('/api/calendar/events', { params });
  return data.data;
}

/**
 * Get a single event
 */
export async function getCalendarEventById(eventId: string): Promise<CalendarEvent> {
  const { data } = await api.get(`/api/calendar/events/${eventId}`);
  return data.data;
}

/**
 * Update an event
 */
export async function updateCalendarEvent(eventId: string, updates: Partial<CreateEventPayload>): Promise<CalendarEvent> {
  const { data } = await api.put(`/api/calendar/events/${eventId}`, updates);
  return data.data;
}

/**
 * Delete an event
 */
export async function deleteCalendarEvent(eventId: string): Promise<void> {
  await api.delete(`/api/calendar/events/${eventId}`);
}

/**
 * Get upcoming events for the current user
 */
export async function getUpcomingEvents(limit = 10): Promise<CalendarEvent[]> {
  const { data } = await api.get('/api/calendar/upcoming', { params: { limit } });
  return data.data;
}
