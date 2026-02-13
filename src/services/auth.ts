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
 * Register a new organization with owner account
 */
export async function register(
    organizationName: string,
    industry: string,
    catalogModuleLabel: string,
    categoryFieldLabel: string,
    appointmentFieldLabel: string,
    name: string,
    email: string,
    password: string,
    phone?: string
): Promise<RegisterResponse> {
    const { data } = await api.post<RegisterResponse>('/auth/register-organization', {
        organizationName,
        industry,
        catalogModuleLabel,
        categoryFieldLabel,
        appointmentFieldLabel,
        name,
        email,
        password,
        phone
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
        const parts = token.split('.');
        // Validate token structure - must have 3 parts (header.payload.signature)
        if (parts.length !== 3 || !parts[1]) {
            console.warn('Malformed JWT token - invalid structure');
            return null;
        }
        
        const payload = JSON.parse(atob(parts[1]));
        
        // Validate required fields exist
        if (!payload.userId || !payload.email || !payload.role) {
            console.warn('JWT token missing required fields');
            return null;
        }
        
        return {
            id: payload.userId,
            email: payload.email,
            name: payload.name || '',
            role: payload.role
        };
    } catch (error) {
        console.error('Failed to parse JWT token:', error);
        return null;
    }
}
