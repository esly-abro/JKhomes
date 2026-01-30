/**
 * Broadcasts API Service
 * Handles WhatsApp broadcast campaigns with image + CTA buttons
 */

import api from './api';

export interface CTAButton {
  type: 'call' | 'url';
  text: string;
  phoneNumber?: string;
  url?: string;
}

export interface BroadcastStats {
  totalLeads: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  buttonClicks?: Record<string, number>;
}

export interface DeliveryStatus {
  leadId: string;
  leadName: string;
  phone: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  messageId?: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  error?: string;
}

export interface TargetFilter {
  status?: string[];
  source?: string[];
  tags?: string[];
  assignedTo?: string[];
}

export interface Broadcast {
  _id: string;
  name: string;
  message: string;
  imageUrl?: string;
  headerText?: string;
  footerText?: string;
  buttons: CTAButton[];
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  stats: BroadcastStats;
  deliveryStatus?: DeliveryStatus[];
  targetFilter?: TargetFilter;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBroadcastData {
  name: string;
  message: string;
  imageUrl?: string;
  headerText?: string;
  footerText?: string;
  buttons?: CTAButton[];
  targetFilter?: TargetFilter;
  scheduledAt?: string;
}

// Get all broadcasts
export async function getBroadcasts(status?: string, page = 1, limit = 20): Promise<{
  data: Broadcast[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> {
  const params = new URLSearchParams();
  if (status) params.append('status', status);
  params.append('page', String(page));
  params.append('limit', String(limit));
  
  const response = await api.get(`/api/broadcasts?${params.toString()}`);
  return response.data;
}

// Get single broadcast
export async function getBroadcast(id: string): Promise<Broadcast> {
  const response = await api.get(`/api/broadcasts/${id}`);
  return response.data.data;
}

// Create new broadcast
export async function createBroadcast(data: CreateBroadcastData): Promise<Broadcast> {
  const response = await api.post('/api/broadcasts', data);
  return response.data.data;
}

// Update broadcast
export async function updateBroadcast(id: string, data: Partial<CreateBroadcastData>): Promise<Broadcast> {
  const response = await api.patch(`/api/broadcasts/${id}`, data);
  return response.data.data;
}

// Delete broadcast
export async function deleteBroadcast(id: string): Promise<void> {
  await api.delete(`/api/broadcasts/${id}`);
}

// Duplicate broadcast
export async function duplicateBroadcast(id: string): Promise<Broadcast> {
  const response = await api.post(`/api/broadcasts/${id}/duplicate`);
  return response.data.data;
}

// Send broadcast to all leads
export async function sendBroadcast(id: string): Promise<{ broadcastId: string; totalLeads: number }> {
  const response = await api.post(`/api/broadcasts/${id}/send`);
  return response.data.data;
}

// Get broadcast delivery status
export async function getBroadcastStatus(id: string): Promise<{
  id: string;
  name: string;
  status: string;
  stats: BroadcastStats;
  startedAt?: string;
  completedAt?: string;
  deliveryRate: number;
  recentDeliveries?: DeliveryStatus[];
}> {
  const response = await api.get(`/api/broadcasts/${id}/status`);
  return response.data.data;
}

// Get target leads count
export async function getTargetLeadsCount(filter?: TargetFilter): Promise<number> {
  const params = new URLSearchParams();
  if (filter?.status?.length) params.append('status', filter.status.join(','));
  if (filter?.source?.length) params.append('source', filter.source.join(','));
  if (filter?.tags?.length) params.append('tags', filter.tags.join(','));
  if (filter?.assignedTo?.length) params.append('assignedTo', filter.assignedTo.join(','));
  
  const response = await api.get(`/api/broadcasts/leads-count?${params.toString()}`);
  return response.data.count;
}

// Upload image for broadcast
export async function uploadBroadcastImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', 'broadcast');
  
  const response = await api.post('/api/upload/image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });
  return response.data.url;
}

export default {
  getBroadcasts,
  getBroadcast,
  createBroadcast,
  updateBroadcast,
  deleteBroadcast,
  duplicateBroadcast,
  sendBroadcast,
  getBroadcastStatus,
  getTargetLeadsCount,
  uploadBroadcastImage
};
