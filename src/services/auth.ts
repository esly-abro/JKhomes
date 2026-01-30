/**
 * Authentication Service
 * Login, logout, and user management
 */

import api from './api';

export interface User {
    id: string;
    email: string;
    name: string;
    role: 'owner' | 'admin' | 'manager' | 'agent' | 'bpo';
    approvalStatus?: 'pending' | 'approved' | 'rejected';
}

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    user: User;
}

export interface RegisterResponse {
    success: boolean;
    message: string;
    data: {
        id: string;
        email: string;
        name: string;
        approvalStatus: string;
    };
}

/**
 * Register a new agent account
 */
export async function register(email: string, password: string, name: string, phone?: string, role?: string): Promise<RegisterResponse> {
    const { data } = await api.post<RegisterResponse>('/auth/register', {
        email,
        password,
        name,
        phone,
        role: role || 'agent'
    });

    return data;
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<User> {
    const { data } = await api.post<LoginResponse>('/auth/login', {
        email,
        password
    });

    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);

    return data.user;
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
    const refreshToken = localStorage.getItem('refreshToken');

    try {
        await api.post('/auth/logout', { refreshToken });
    } catch (error) {
        // Logout anyway even if API call fails
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
}

/**
 * Get user from stored JWT token
 */
export function getStoredUser(): User | null {
    const token = localStorage.getItem('accessToken');
    if (!token) return null;

    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return {
            id: payload.userId,
            email: payload.email,
            name: payload.name || '',
            role: payload.role
        };
    } catch {
        return null;
    }
}
