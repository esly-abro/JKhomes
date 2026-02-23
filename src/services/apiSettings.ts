/**
 * API Settings Service
 * Frontend service for managing encrypted API credentials
 */

import api from './api';

export interface ApiConnection {
  name: string;
  isConnected: boolean;
  lastSync?: string;
  lastTested?: string;
  lastError?: string | null;
  hasCredentials: boolean;
  enabled?: boolean;
}

export interface ApiConnectionStatus {
  success: boolean;
  connections: {
    zoho: ApiConnection;
    elevenLabs: ApiConnection;
    twilio: ApiConnection;
    whatsapp: ApiConnection;
  };
  encryption: {
    isValid: boolean;
    message: string;
  };
}

export interface MaskedCredentials {
  success: boolean;
  provider: string;
  credentials: Record<string, string | boolean>;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber?: string;
  twimlAppSid?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
}

export interface WhatsappCredentials {
  provider: 'meta' | 'twilio';
  // Meta fields
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  appId?: string;
  appSecret?: string;
  verifyToken?: string;
  webhookUrl?: string;
  // Twilio fields
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioWhatsappNumber?: string;
}

/**
 * Get all API connection statuses
 */
export async function getApiConnectionStatus(): Promise<ApiConnectionStatus> {
  const response = await api.get('/api/settings/api/status');
  return response.data;
}

/**
 * Get encryption status
 */
export async function getEncryptionStatus(): Promise<{ success: boolean; encryption: { isConfigured: boolean; message: string; algorithm: string } }> {
  const response = await api.get('/api/settings/api/encryption-status');
  return response.data;
}

/**
 * Get masked credentials for a provider
 */
export async function getMaskedCredentials(provider: 'zoho' | 'elevenlabs' | 'twilio' | 'whatsapp'): Promise<MaskedCredentials> {
  const response = await api.get(`/api/settings/api/credentials/${provider}`);
  return response.data;
}

/**
 * Save Twilio credentials
 */
export async function saveTwilioCredentials(credentials: TwilioCredentials): Promise<{ success: boolean; message: string }> {
  const response = await api.post('/api/settings/api/twilio', credentials);
  return response.data;
}

/**
 * Test Twilio connection
 */
export async function testTwilioConnection(): Promise<{ success: boolean; message: string; account?: { friendlyName: string; status: string; type: string } }> {
  const response = await api.post('/api/settings/api/twilio/test');
  return response.data;
}

/**
 * Save WhatsApp credentials
 */
export async function saveWhatsappCredentials(credentials: WhatsappCredentials): Promise<{ success: boolean; message: string }> {
  const response = await api.post('/api/settings/api/whatsapp', credentials);
  return response.data;
}

/**
 * Test WhatsApp connection
 */
export async function testWhatsappConnection(): Promise<{ success: boolean; message: string; phoneInfo?: { id: string; displayPhoneNumber: string; verifiedName: string } }> {
  const response = await api.post('/api/settings/api/whatsapp/test');
  return response.data;
}

/**
 * Delete credentials for a provider
 */
export async function deleteCredentials(provider: 'zoho' | 'elevenlabs' | 'twilio' | 'whatsapp'): Promise<{ success: boolean; message: string }> {
  const response = await api.delete(`/api/settings/api/credentials/${provider}`);
  return response.data;
}

export default {
  getApiConnectionStatus,
  getEncryptionStatus,
  getMaskedCredentials,
  saveTwilioCredentials,
  testTwilioConnection,
  saveWhatsappCredentials,
  testWhatsappConnection,
  deleteCredentials
};
