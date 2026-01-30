/**
 * Metrics Service
 * API functions for dashboard analytics
 */

import api from './api';

export interface MetricsOverview {
    totalLeads: number;
    activeLeads: number;
    conversionRate: number;
    pipelineValue: number;
    leadsBySource: Record<string, number>;
    leadsByStatus: Record<string, number>;
    recentLeads: number;
    period: string;
}

/**
 * Get dashboard metrics overview
 */
export async function getMetricsOverview(): Promise<MetricsOverview> {
    const { data } = await api.get<MetricsOverview>('/api/metrics/overview');
    return data;
}
