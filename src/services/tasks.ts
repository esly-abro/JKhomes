/**
 * Tasks API Service
 * Handles task-related API calls
 */

import api from './api';

export interface Task {
  _id: string;
  lead: {
    _id: string;
    name: string;
    phone?: string;
    email?: string;
    status?: string;
    source?: string;
    budget?: number;
  };
  automationRun?: string;
  automation?: {
    _id: string;
    name: string;
  };
  nodeId?: string;
  assignedTo?: {
    _id: string;
    name: string;
    email: string;
  };
  createdBy?: {
    _id: string;
    name: string;
  };
  type: TaskType;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  completedAt?: string;
  startedAt?: string;
  redirectUrl?: string;
  redirectType?: 'lead' | 'automation' | 'property' | 'external';
  completionNotes?: string;
  completionResult?: 'success' | 'failed' | 'rescheduled' | 'no_answer' | 'cancelled';
  context?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type TaskType = 
  | 'call_lead'
  | 'confirm_site_visit'
  | 'update_after_visit'
  | 'followup_call'
  | 'negotiate_deal'
  | 'prepare_docs'
  | 'manual_action'
  | 'schedule_visit'
  | 'send_quote'
  | 'other';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskStats {
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  cancelled: number;
  total: number;
  unassigned: number;
}

export interface TaskFilters {
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  assignedTo?: string | 'unassigned';
  leadId?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Get tasks for the current logged-in user
 */
export async function getMyTasks(filters?: TaskFilters): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.priority) params.append('priority', filters.priority);
  
  const response = await api.get<ApiResponse<Task[]>>(`/api/tasks/my?${params.toString()}`);
  return response.data.data;
}

/**
 * Get all tasks (admin/manager view)
 */
export async function getAllTasks(filters?: TaskFilters): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);
  if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
  if (filters?.leadId) params.append('leadId', filters.leadId);
  
  const response = await api.get<ApiResponse<Task[]>>(`/api/tasks?${params.toString()}`);
  return response.data.data;
}

/**
 * Get unassigned tasks (admin view)
 */
export async function getUnassignedTasks(): Promise<Task[]> {
  const response = await api.get<ApiResponse<Task[]>>('/api/tasks/unassigned');
  return response.data.data;
}

/**
 * Get task statistics
 */
export async function getTaskStats(): Promise<TaskStats> {
  const response = await api.get<ApiResponse<TaskStats>>('/api/tasks/stats');
  return response.data.data;
}

/**
 * Get tasks for a specific lead
 */
export async function getTasksForLead(leadId: string): Promise<Task[]> {
  const response = await api.get<ApiResponse<Task[]>>(`/api/tasks/lead/${leadId}`);
  return response.data.data;
}

/**
 * Get a single task by ID
 */
export async function getTask(taskId: string): Promise<Task> {
  const response = await api.get<ApiResponse<Task>>(`/api/tasks/${taskId}`);
  return response.data.data;
}

/**
 * Create a new task
 */
export async function createTask(data: {
  leadId: string;
  type?: TaskType;
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assignedTo?: string;
}): Promise<Task> {
  const response = await api.post<ApiResponse<Task>>('/api/tasks', data);
  return response.data.data;
}

/**
 * Mark a task as complete
 */
export async function completeTask(
  taskId: string, 
  notes?: string, 
  result?: 'success' | 'failed' | 'rescheduled' | 'no_answer'
): Promise<Task> {
  const response = await api.put<ApiResponse<Task>>(`/api/tasks/${taskId}/complete`, {
    notes,
    result
  });
  return response.data.data;
}

/**
 * Start a task (mark as in progress)
 */
export async function startTask(taskId: string): Promise<Task> {
  const response = await api.put<ApiResponse<Task>>(`/api/tasks/${taskId}/start`, {});
  return response.data.data;
}

/**
 * Assign a task to a user
 */
export async function assignTask(taskId: string, assigneeId: string): Promise<Task> {
  const response = await api.put<ApiResponse<Task>>(`/api/tasks/${taskId}/assign`, {
    assigneeId
  });
  return response.data.data;
}

/**
 * Update a task
 */
export async function updateTask(taskId: string, data: {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  assignedTo?: string | null;
}): Promise<Task> {
  const response = await api.put<ApiResponse<Task>>(`/api/tasks/${taskId}`, data);
  return response.data.data;
}

/**
 * Cancel a task
 */
export async function cancelTask(taskId: string, reason?: string): Promise<Task> {
  const response = await api.put<ApiResponse<Task>>(`/api/tasks/${taskId}/cancel`, {
    reason
  });
  return response.data.data;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<void> {
  await api.delete(`/api/tasks/${taskId}`);
}

// Task type display labels
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call_lead: 'Call Lead',
  confirm_site_visit: 'Confirm Site Visit',
  update_after_visit: 'Update After Visit',
  followup_call: 'Follow-up Call',
  negotiate_deal: 'Negotiate Deal',
  prepare_docs: 'Prepare Documents',
  manual_action: 'Manual Action',
  schedule_visit: 'Schedule Visit',
  send_quote: 'Send Quote',
  other: 'Other'
};

// Task status display labels and colors
export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  completed: { label: 'Completed', color: 'text-green-700', bgColor: 'bg-green-100' },
  overdue: { label: 'Overdue', color: 'text-red-700', bgColor: 'bg-red-100' },
  cancelled: { label: 'Cancelled', color: 'text-gray-700', bgColor: 'bg-gray-100' }
};

// Priority config
export const TASK_PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bgColor: string }> = {
  low: { label: 'Low', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  medium: { label: 'Medium', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  high: { label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  urgent: { label: 'Urgent', color: 'text-red-600', bgColor: 'bg-red-100' }
};

export default {
  getMyTasks,
  getAllTasks,
  getUnassignedTasks,
  getTaskStats,
  getTasksForLead,
  getTask,
  createTask,
  completeTask,
  startTask,
  assignTask,
  updateTask,
  cancelTask,
  deleteTask,
  TASK_TYPE_LABELS,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG
};
