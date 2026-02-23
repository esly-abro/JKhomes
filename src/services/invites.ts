/**
 * Invite API Service
 * Frontend service for team member invitations.
 */

import api from './api';

export interface Invite {
  _id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invitedBy: { _id: string; name: string };
  createdAt: string;
  expiresAt: string;
}

/**
 * Send an invitation
 */
export async function sendInvite(email: string, role: string = 'agent'): Promise<Invite> {
  const { data } = await api.post('/api/invites', { email, role });
  return data.data;
}

/**
 * List invitations
 */
export async function listInvites(status?: string): Promise<Invite[]> {
  const params = status ? { status } : {};
  const { data } = await api.get('/api/invites', { params });
  return data.data;
}

/**
 * Revoke an invitation
 */
export async function revokeInvite(inviteId: string): Promise<void> {
  await api.delete(`/api/invites/${inviteId}`);
}
