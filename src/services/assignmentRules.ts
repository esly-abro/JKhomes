/**
 * Assignment Rules API Service
 * Frontend service for lead assignment rule CRUD.
 */

import api from './api';

export interface AssignmentRule {
  _id: string;
  name: string;
  trigger: string;
  action: string;
  conditions?: Record<string, any>;
  enabled: boolean;
  priority?: number;
  createdAt?: string;
}

/**
 * List all assignment rules
 */
export async function getAssignmentRules(): Promise<AssignmentRule[]> {
  const { data } = await api.get('/api/assignment-rules');
  return data.data;
}

/**
 * Create a new assignment rule
 */
export async function createAssignmentRule(rule: { name: string; trigger: string; action: string; conditions?: Record<string, any>; enabled?: boolean }): Promise<AssignmentRule> {
  const { data } = await api.post('/api/assignment-rules', rule);
  return data.data;
}

/**
 * Update an assignment rule
 */
export async function updateAssignmentRule(id: string, updates: Partial<AssignmentRule>): Promise<AssignmentRule> {
  const { data } = await api.put(`/api/assignment-rules/${id}`, updates);
  return data.data;
}

/**
 * Delete an assignment rule
 */
export async function deleteAssignmentRule(id: string): Promise<void> {
  await api.delete(`/api/assignment-rules/${id}`);
}

/**
 * Toggle rule enabled/disabled
 */
export async function toggleAssignmentRule(id: string): Promise<AssignmentRule> {
  const { data } = await api.patch(`/api/assignment-rules/${id}/toggle`);
  return data.data;
}
