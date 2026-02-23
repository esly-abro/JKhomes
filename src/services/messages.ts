/**
 * Messages API Service
 * Frontend service for lead conversation messaging.
 */

import api from './api';

export interface ConversationMessage {
  _id: string;
  leadId: string;
  senderId: string;
  senderName: string;
  direction: 'inbound' | 'outbound';
  channel: 'whatsapp' | 'sms' | 'email' | 'internal' | 'phone';
  body: string;
  status: string;
  createdAt: string;
}

export interface ConversationSummary {
  _id: string;          // leadId
  leadId: string;
  leadName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  channel: string;
}

export interface ConversationListResponse {
  data: ConversationSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ConversationResponse {
  data: ConversationMessage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Get conversation list (all leads with messages)
 */
export async function getConversations(page = 1, limit = 20): Promise<ConversationListResponse> {
  const { data } = await api.get('/api/messages/conversations', {
    params: { page, limit }
  });
  return data;
}

/**
 * Get messages for a specific lead
 */
export async function getConversation(leadId: string, page = 1, limit = 50): Promise<ConversationResponse> {
  const { data } = await api.get(`/api/messages/conversations/${leadId}`, {
    params: { page, limit }
  });
  return data;
}

/**
 * Send a message
 */
export async function sendMessage(leadId: string, body: string, channel = 'internal'): Promise<{ success: boolean; data: ConversationMessage }> {
  const { data } = await api.post('/api/messages', { leadId, body, channel });
  return data;
}

/**
 * Mark conversation as read
 */
export async function markConversationRead(leadId: string): Promise<void> {
  await api.patch(`/api/messages/conversations/${leadId}/read`);
}

/**
 * Get unread count
 */
export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get('/api/messages/unread-count');
  return data.data?.unreadCount ?? 0;
}

/**
 * Search messages
 */
export async function searchMessages(query: string, page = 1, limit = 20) {
  const { data } = await api.get('/api/messages/search', {
    params: { q: query, page, limit }
  });
  return data;
}
