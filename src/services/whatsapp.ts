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

/**
 * Template stored in our database (per-org)
 */
export interface WhatsAppTemplateRecord {
  _id: string;
  organizationId: string;
  name: string;
  friendlyName: string;
  twilioContentSid: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  contentType: 'text' | 'quick-reply' | 'card';
  headerText: string;
  body: string;
  footer: string;
  buttons: Array<{
    type: string;
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
  variables: Array<{
    index: number;
    sample: string;
    description: string;
  }>;
  createdBy: string;
  approvalSubmittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
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

// ─────────────────────────────────────────────
// Template CRUD (per-org, stored in our DB)
// ─────────────────────────────────────────────

/**
 * List all org templates (optionally filtered by status)
 */
export async function listOrgTemplates(status?: string): Promise<WhatsAppTemplateRecord[]> {
  const params = status ? `?status=${status}` : '';
  const response = await api.get<ApiResponse<WhatsAppTemplateRecord[]>>(`/api/whatsapp-templates${params}`);
  return response.data.data;
}

/**
 * Get a single org template by ID
 */
export async function getOrgTemplate(id: string): Promise<WhatsAppTemplateRecord> {
  const response = await api.get<ApiResponse<WhatsAppTemplateRecord>>(`/api/whatsapp-templates/${id}`);
  return response.data.data;
}

/**
 * Create a new template (draft)
 */
export async function createOrgTemplate(data: {
  name: string;
  friendlyName?: string;
  category?: string;
  language?: string;
  contentType?: string;
  headerText?: string;
  body: string;
  footer?: string;
  buttons?: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>;
  variables?: Array<{ index: number; sample: string; description: string }>;
}): Promise<WhatsAppTemplateRecord> {
  const response = await api.post<ApiResponse<WhatsAppTemplateRecord>>('/api/whatsapp-templates', data);
  return response.data.data;
}

/**
 * Update an existing template (draft/rejected only)
 */
export async function updateOrgTemplate(id: string, data: Partial<{
  friendlyName: string;
  category: string;
  language: string;
  contentType: string;
  headerText: string;
  body: string;
  footer: string;
  buttons: Array<{ type: string; text: string; url?: string; phoneNumber?: string }>;
  variables: Array<{ index: number; sample: string; description: string }>;
}>): Promise<WhatsAppTemplateRecord> {
  const response = await api.put<ApiResponse<WhatsAppTemplateRecord>>(`/api/whatsapp-templates/${id}`, data);
  return response.data.data;
}

/**
 * Delete a template
 */
export async function deleteOrgTemplate(id: string): Promise<{ deleted: boolean }> {
  const response = await api.delete<ApiResponse<{ deleted: boolean }>>(`/api/whatsapp-templates/${id}`);
  return response.data.data;
}

/**
 * Submit a template to Twilio for approval
 */
export async function submitOrgTemplate(id: string): Promise<WhatsAppTemplateRecord> {
  const response = await api.post<ApiResponse<WhatsAppTemplateRecord>>(`/api/whatsapp-templates/${id}/submit`);
  return response.data.data;
}

/**
 * Sync template statuses from Twilio + import missing templates
 */
export async function syncOrgTemplates(): Promise<{
  updated: number;
  approved: number;
  rejected: number;
  imported: number;
}> {
  const response = await api.post<ApiResponse<{
    updated: number;
    approved: number;
    rejected: number;
    imported: number;
  }>>('/api/whatsapp-templates/sync');
  return response.data.data;
}

/**
 * Get only approved templates (for automation builder)
 */
export async function getApprovedTemplates(): Promise<WhatsAppTemplate[]> {
  const response = await api.get<ApiResponse<WhatsAppTemplate[]>>('/api/whatsapp-templates/approved');
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
  // Template CRUD
  listOrgTemplates,
  getOrgTemplate,
  createOrgTemplate,
  updateOrgTemplate,
  deleteOrgTemplate,
  submitOrgTemplate,
  syncOrgTemplates,
  getApprovedTemplates,
};
