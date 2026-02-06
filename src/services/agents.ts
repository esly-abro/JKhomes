import api from './api';

export interface Agent {
    _id: string;
    name: string;
    email: string;
    phone?: string;
}

export interface User {
    _id: string;
    name: string;
    email: string;
    role: 'owner' | 'admin' | 'manager' | 'agent' | 'bpo';
    createdAt?: string;
}

export const getAgents = async (): Promise<Agent[]> => {
    const response = await api.get('/api/agents');
    return response.data.data;
};

export const getUsers = async (): Promise<User[]> => {
    const response = await api.get('/api/users');
    return response.data;
};
