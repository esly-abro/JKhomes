/**
 * Leads Service
 * API functions for lead management
 */

import { Lead } from '../app/context/DataContext';
import api from './api';

export interface LeadsResponse {
    data: Lead[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

/**
 * Get all leads with pagination and filters
 */
export async function getLeads(params?: {
    page?: number;
    limit?: number;
    status?: string;
    source?: string;
    owner?: string;
}): Promise<LeadsResponse> {
    const { data } = await api.get<LeadsResponse>('/api/leads', {
        params
    });
    return data;
}

/**
 * Get single lead by ID
 */
export async function getLead(id: string): Promise<Lead> {
    const { data } = await api.get<Lead>(`/api/leads/${id}`);
    return data;
}

/**
 * Create new lead
 */
export async function createLead(leadData: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    source: string;
    propertyId?: string;
}): Promise<{ success: boolean; leadId: string; action: string }> {
    const { data } = await api.post('/api/leads', leadData);
    return data;
}

/**
 * Update lead
 */
export async function updateLead(id: string, updateData: Partial<Lead>): Promise<Lead> {
    const { data } = await api.put<Lead>(`/api/leads/${id}`, updateData);
    return data;
}

/**
 * Update lead status
 */
export async function updateLeadStatus(id: string, status: string): Promise<Lead> {
    const { data } = await api.patch<Lead>(`/api/leads/${id}/status`, { status });
    return data;
}

/**
 * Confirm site visit for a lead
 */
export async function confirmSiteVisit(leadId: string, scheduledAt: string, propertyId?: string) {
    return api.post(`/api/leads/${leadId}/site-visit`, { scheduledAt, propertyId });
}

/**
 * Get today's site visits
 */
export async function getTodaySiteVisits() {
    return api.get('/api/site-visits/today');
}

/**
 * Get all site visits (for calendar view)
 */
export async function getAllSiteVisits(limit: number = 100) {
    return api.get('/api/site-visits/all', { params: { limit } });
}

/**
 * Create new activity
 */
export async function createActivity(activity: any) {
  return api.post('/api/activities', activity);
}

/**
 * Get recent activities
 */
export async function getRecentActivities() {
  return api.get('/api/activities/recent');
}

/**
 * Get tasks for current user
 */
export async function getTasks(params?: { status?: string; priority?: string }) {
  const { data } = await api.get('/api/tasks', { params });
  return data;
}

/**
 * Create a new task
 */
export async function createTask(taskData: {
  title: string;
  description?: string;
  scheduledAt?: string;
  priority?: 'high' | 'medium' | 'low';
  leadId?: string;
}) {
  const { data } = await api.post('/api/tasks', taskData);
  return data;
}

/**
 * Update a task (mark complete, change priority, etc.)
 */
export async function updateTask(taskId: string, updates: {
  title?: string;
  description?: string;
  scheduledAt?: string;
  priority?: 'high' | 'medium' | 'low';
  isCompleted?: boolean;
}) {
  const { data } = await api.patch(`/api/tasks/${taskId}`, updates);
  return data;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string) {
  await api.delete(`/api/tasks/${taskId}`);
}

/**
 * Get all users (for team members)
 */
export async function getUsers() {
  const { data } = await api.get('/api/users');
  // Return the users array from the response
  return data.data || data;
}
