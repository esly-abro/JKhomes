/**
 * Analytics API Service
 * Frontend service for fetching analytics data
 */

import api from './api';

export interface MonthlyTrend {
    month: string;
    leads: number;
    deals: number;
    revenue: number;
}

export interface ConversionFunnelStage {
    stage: string;
    count: number;
}

export interface SourcePerformance {
    source: string;
    leads: number;
    conversion: number;
}

export interface TeamMember {
    name: string;
    leads: number;
    deals: number;
    revenue: number;
}

export interface KPIMetrics {
    totalLeads: number;
    totalLeadsChange: string;
    conversionRate: string;
    conversionRateChange: string;
    dealsClosed: number;
    dealsClosedChange: string;
    totalRevenue: number;
    totalRevenueChange: string;
}

export interface AnalyticsData {
    monthlyTrends: MonthlyTrend[];
    conversionFunnel: ConversionFunnelStage[];
    sourcePerformance: SourcePerformance[];
    teamPerformance: TeamMember[];
    kpiMetrics: KPIMetrics;
}

// --- Agent Performance Types ---

export interface AgentKPIs {
    totalLeads: number;
    totalLeadsChange: string;
    dealsWon: number;
    dealsWonChange: string;
    conversionRate: string;
    revenue: number;
    avgResponseTime: string;
}

export interface ActivityBreakdownItem {
    type: string;
    label: string;
    count: number;
}

export interface PipelineItem {
    status: string;
    count: number;
}

export interface TaskStats {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
    recentCompleted: number;
    completionRate: string;
}

export interface CallStats {
    totalCalls: number;
    outbound: number;
    inbound: number;
    totalDuration: string;
    avgDuration: string;
}

export interface DailyActivityItem {
    date: string;
    count: number;
}

export interface RecentActivityItem {
    id: string;
    type: string;
    title: string;
    description: string;
    outcome: string;
    createdAt: string;
}

export interface AgentPerformanceData {
    kpis: AgentKPIs;
    activityBreakdown: ActivityBreakdownItem[];
    leadPipeline: PipelineItem[];
    taskStats: TaskStats;
    callStats: CallStats;
    dailyActivity: DailyActivityItem[];
    recentActivity: RecentActivityItem[];
}

/**
 * Get all analytics data (combined endpoint)
 */
export async function getAllAnalytics(dateRange: string = '30days'): Promise<AnalyticsData> {
    const { data } = await api.get<AnalyticsData>('/api/analytics', {
        params: { range: dateRange }
    });
    return data;
}

/**
 * Get monthly trends
 */
export async function getMonthlyTrends(dateRange: string = '30days'): Promise<MonthlyTrend[]> {
    const { data } = await api.get<MonthlyTrend[]>('/api/analytics/monthly-trends', {
        params: { range: dateRange }
    });
    return data;
}

/**
 * Get conversion funnel
 */
export async function getConversionFunnel(): Promise<ConversionFunnelStage[]> {
    const { data } = await api.get<ConversionFunnelStage[]>('/api/analytics/conversion-funnel');
    return data;
}

/**
 * Get source performance
 */
export async function getSourcePerformance(): Promise<SourcePerformance[]> {
    const { data } = await api.get<SourcePerformance[]>('/api/analytics/source-performance');
    return data;
}

/**
 * Get team performance
 */
export async function getTeamPerformance(): Promise<TeamMember[]> {
    const { data } = await api.get<TeamMember[]>('/api/analytics/team-performance');
    return data;
}

/**
 * Get KPI metrics
 */
export async function getKPIMetrics(dateRange: string = '30days'): Promise<KPIMetrics> {
    const { data } = await api.get<KPIMetrics>('/api/analytics/kpi-metrics', {
        params: { range: dateRange }
    });
    return data;
}

/**
 * Get agent's own performance metrics (accessible by all roles)
 */
export async function getMyPerformance(dateRange: string = '30days'): Promise<AgentPerformanceData> {
    const { data } = await api.get<AgentPerformanceData>('/api/analytics/my-performance', {
        params: { range: dateRange }
    });
    return data;
}
