/**
 * Billing API Service
 * Frontend service for billing/subscription management.
 */

import api from './api';

export interface Plan {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  limits: { users: number; leads: number; storage: string };
  features: string[];
}

export interface BillingInfo {
  plan: Plan;
  usage: { users: number; leads: number; storageUsed: string };
  billing: {
    status: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    paymentMethod: string | null;
    invoices: any[];
  };
}

export interface Invoice {
  date: string;
  amount: string;
  status: string;
}

/**
 * Get available plans
 */
export async function getPlans(): Promise<Plan[]> {
  const { data } = await api.get('/api/billing/plans');
  return data.data;
}

/**
 * Get billing info for current org
 */
export async function getBillingInfo(): Promise<BillingInfo> {
  const { data } = await api.get('/api/billing');
  return data.data;
}

/**
 * Upgrade plan
 */
export async function upgradePlan(planId: string): Promise<void> {
  await api.post('/api/billing/upgrade', { planId });
}

/**
 * Get invoices
 */
export async function getInvoices(): Promise<{ invoices: Invoice[]; message?: string }> {
  const { data } = await api.get('/api/billing/invoices');
  return data.data;
}
