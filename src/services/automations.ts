/**
 * Automation Service
 * API calls for workflow automations
 */

import api from './api';

export interface AutomationNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    type: string;
    color: string;
    config?: Record<string, unknown>;
  };
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  style?: Record<string, unknown>;
}

export interface Automation {
  _id: string;
  name: string;
  description?: string;
  owner: { _id: string; name: string; email: string };
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  isActive: boolean;
  triggerType: string;
  triggerConditions?: {
    leadSource?: string[];
    minBudget?: number;
    maxBudget?: number;
    propertyTypes?: string[];
    locations?: string[];
  };
  runsCount: number;
  successCount: number;
  failureCount: number;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  _id: string;
  automation: { _id: string; name: string };
  lead: { _id: string; name: string; email?: string; phone?: string };
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  currentNodeId?: string;
  executionPath: Array<{
    nodeId: string;
    nodeType: string;
    nodeLabel: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    completedAt?: string;
    result?: unknown;
    error?: string;
  }>;
  error?: string;
  completedAt?: string;
  createdAt: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

/**
 * Get all automations
 */
export async function getAutomations(): Promise<Automation[]> {
  const response = await api.get<ApiResponse<Automation[]>>('/api/automations');
  return response.data.data;
}

/**
 * Get a single automation by ID
 */
export async function getAutomation(id: string): Promise<Automation> {
  const response = await api.get<ApiResponse<Automation>>(`/api/automations/${id}`);
  return response.data.data;
}

/**
 * Create a new automation
 */
export async function createAutomation(data: {
  name: string;
  description?: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  isActive?: boolean;
  triggerConditions?: Automation['triggerConditions'];
}): Promise<Automation> {
  const response = await api.post<ApiResponse<Automation>>('/api/automations', data);
  return response.data.data;
}

/**
 * Update an automation
 */
export async function updateAutomation(
  id: string,
  data: {
    name?: string;
    description?: string;
    nodes?: AutomationNode[];
    edges?: AutomationEdge[];
    isActive?: boolean;
    triggerConditions?: Automation['triggerConditions'];
  }
): Promise<Automation> {
  const response = await api.put<ApiResponse<Automation>>(`/api/automations/${id}`, data);
  return response.data.data;
}

/**
 * Delete an automation
 */
export async function deleteAutomation(id: string): Promise<void> {
  await api.delete(`/api/automations/${id}`);
}

/**
 * Toggle automation active state
 */
export async function toggleAutomation(id: string): Promise<Automation> {
  const response = await api.post<ApiResponse<Automation>>(`/api/automations/${id}/toggle`);
  return response.data.data;
}

/**
 * Manually trigger an automation for a lead
 */
export async function triggerAutomation(
  automationId: string,
  leadId: string
): Promise<AutomationRun> {
  const response = await api.post<ApiResponse<AutomationRun>>(
    `/api/automations/${automationId}/run`,
    { leadId }
  );
  return response.data.data;
}

/**
 * Get run history for an automation
 */
export async function getAutomationRuns(
  automationId: string,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<AutomationRun>> {
  const response = await api.get<PaginatedResponse<AutomationRun>>(
    `/api/automations/${automationId}/runs`,
    { params: { page, limit } }
  );
  return response.data;
}

/**
 * Get details of a specific run
 */
export async function getAutomationRun(runId: string): Promise<AutomationRun> {
  const response = await api.get<ApiResponse<AutomationRun>>(`/api/automations/runs/${runId}`);
  return response.data.data;
}

/**
 * Cancel a running automation
 */
export async function cancelAutomationRun(runId: string): Promise<void> {
  await api.post(`/api/automations/runs/${runId}/cancel`);
}

export default {
  getAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  toggleAutomation,
  triggerAutomation,
  getAutomationRuns,
  getAutomationRun,
  cancelAutomationRun,
};
