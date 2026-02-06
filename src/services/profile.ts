/**
 * Profile Service
 * API calls for user profile management
 */

import api, { API_BASE_URL } from './api';

export interface ProfileData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    timezone: string;
    avatar: string;
    role: string;
}

export interface ProfileUpdateData {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    timezone?: string;
    avatar?: string;
}

/**
 * Get current user's profile
 */
export async function getProfile(): Promise<ProfileData> {
    const response = await api.get<{ success: boolean; data: ProfileData }>('/api/profile');
    return response.data.data;
}

/**
 * Update current user's profile
 */
export async function updateProfile(data: ProfileUpdateData): Promise<ProfileData> {
    const response = await api.patch<{ success: boolean; data: ProfileData; message: string }>('/api/profile', data);
    return response.data.data;
}

/**
 * Upload profile avatar
 * Returns the URL of the uploaded image
 */
export async function uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post<{ success: boolean; url: string }>('/api/upload/avatar', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    
    // Return full URL with backend host
    const avatarPath = response.data.url;
    return avatarPath.startsWith('http') ? avatarPath : `${API_BASE_URL}${avatarPath}`;
}
