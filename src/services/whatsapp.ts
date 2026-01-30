/**
 * WhatsApp Service
 * API calls for WhatsApp Business integration
 */

import api from './api';

export interface WhatsAppButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
  payload?: string;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    buttons?: Array<{
      type: string;
      text: string;
      url?: string;
      phone_number?: string;
    }>;
  }>;
  buttons: WhatsAppButton[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// Store the Meta access token (can be set from UI)
let metaAccessToken: string | null = null;

/**
 * Set the Meta access token for API calls
 */
export function setMetaAccessToken(token: string) {
  metaAccessToken = token;
  // Store in localStorage for persistence
  localStorage.setItem('metaAccessToken', token);
}

/**
 * Get the stored Meta access token
 */
export function getMetaAccessToken(): string | null {
  if (!metaAccessToken) {
    metaAccessToken = localStorage.getItem('metaAccessToken');
  }
  return metaAccessToken;
}

/**
 * Clear the Meta access token
 */
export function clearMetaAccessToken() {
  metaAccessToken = null;
  localStorage.removeItem('metaAccessToken');
}

/**
 * Get all available WhatsApp templates using user's saved settings
 */
export async function getTemplates(): Promise<WhatsAppTemplate[]> {
  const response = await api.get<ApiResponse<WhatsAppTemplate[]>>('/api/whatsapp/templates');
  return response.data.data;
}

/**
 * Send a template message using user's saved settings
 */
export async function sendTemplateMessage(
  phoneNumber: string,
  templateName: string,
  languageCode = 'en',
  components?: unknown[]
): Promise<{ messageId: string }> {
  const response = await api.post<ApiResponse<{ messageId: string }>>(
    '/api/whatsapp/send-template',
    { phoneNumber, templateName, languageCode, components }
  );
  
  return response.data.data;
}

/**
 * Send a text message
 */
export async function sendTextMessage(
  phoneNumber: string,
  message: string
): Promise<{ messageId: string }> {
  const token = getMetaAccessToken();
  
  const response = await api.post<ApiResponse<{ messageId: string }>>(
    '/api/whatsapp/send-text',
    { phoneNumber, message },
    { headers: token ? { 'x-whatsapp-token': token } : undefined }
  );
  
  return response.data.data;
}

/**
 * Get WhatsApp configuration status
 */
export async function getConfig(): Promise<{
  configured: boolean;
  hasAccessToken: boolean;
  hasPhoneNumberId: boolean;
  hasBusinessAccountId: boolean;
}> {
  const response = await api.get<ApiResponse<{
    configured: boolean;
    hasAccessToken: boolean;
    hasPhoneNumberId: boolean;
    hasBusinessAccountId: boolean;
  }>>('/api/whatsapp/config');
  
  return response.data.data;
}

export default {
  setMetaAccessToken,
  getMetaAccessToken,
  clearMetaAccessToken,
  getTemplates,
  sendTemplateMessage,
  sendTextMessage,
  getConfig,
};
