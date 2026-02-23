/**
 * Profile API Service
 * Frontend service for user profile, password, and preference management.
 */

import api from './api';

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: string;
  timezone?: string;
  language?: string;
  organizationId: string;
  settings: {
    notifications: { email?: boolean; sms?: boolean; push?: boolean };
    preferences: { theme?: string; language?: string; timezone?: string; emailDigest?: string; marketingEmails?: boolean; leadAlerts?: boolean; taskReminders?: boolean };
  };
}

/**
 * Get current user profile
 */
export async function getProfile(): Promise<UserProfile> {
  const { data } = await api.get('/api/profile');
  return data.data;
}

/**
 * Update profile fields
 */
export async function updateProfile(updates: { name?: string; phone?: string; avatar?: string; timezone?: string; language?: string }): Promise<UserProfile> {
  const { data } = await api.put('/api/profile', updates);
  return data.data;
}

/**
 * Change password
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/api/profile/change-password', { currentPassword, newPassword });
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(prefs: { email?: boolean; sms?: boolean; push?: boolean }): Promise<void> {
  await api.put('/api/profile/notifications', prefs);
}

/**
 * Update email preferences
 */
export async function updateEmailPreferences(prefs: { digest?: string; marketing?: boolean; leadAlerts?: boolean; taskReminders?: boolean }): Promise<void> {
  await api.put('/api/profile/email-preferences', prefs);
}

/**
 * Update general preferences (theme, language, timezone)
 */
export async function updatePreferences(prefs: { theme?: string; language?: string; timezone?: string }): Promise<void> {
  await api.put('/api/profile/preferences', prefs);
}
