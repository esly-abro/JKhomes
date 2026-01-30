import api from './api';

export interface AssignmentResult {
  leadId: string;
  success: boolean;
  assignedTo?: string;
  error?: string;
}

export interface AgentWorkload {
  agentId: string;
  name: string;
  email: string;
  role: string;
  totalLeads: number;
  activeLeads: number;
  closedDeals: number;
  conversionRate: string;
}

export const assignLeads = async (
  leadIds: string[],
  agentId?: string,
  autoAssign: boolean = false
): Promise<{ message: string; results: AssignmentResult[] }> => {
  const response = await api.post('/api/assignments/assign', {
    leadIds,
    agentId,
    autoAssign
  });
  return response.data;
};

export const reassignLeads = async (
  fromAgentId: string,
  toAgentId: string,
  leadIds?: string[]
): Promise<{ message: string; reassigned: number; failed: number; results: AssignmentResult[] }> => {
  const response = await api.post('/api/assignments/reassign', {
    fromAgentId,
    toAgentId,
    leadIds
  });
  return response.data;
};

export const getAgentWorkload = async (): Promise<AgentWorkload[]> => {
  const response = await api.get('/api/assignments/workload');
  return response.data;
};
