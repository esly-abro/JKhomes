import api from './api';

export interface Agent {
    _id: string;
    name: string;
    email: string;
    phone?: string;
}

export const getAgents = async (): Promise<Agent[]> => {
    const response = await api.get('/api/agents');
    return response.data.data;
};
