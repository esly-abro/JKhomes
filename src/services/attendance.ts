/**
 * Attendance Service
 * API calls for agent presence and attendance tracking
 */

import api from './api';

export interface AgentPresence {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    role: string;
    isOnline: boolean;
    lastHeartbeat: string | null;
    lastLogin: string | null;
    isActive: boolean;
    todayAttendance: {
        checkIn: string;
        checkOut: string | null;
        totalMinutes: number;
        sessions: number;
        status: string;
    } | null;
}

export interface AgentStatusSummary {
    total: number;
    online: number;
    offline: number;
    checkedInToday: number;
}

export interface AttendanceRecord {
    _id: string;
    userId: {
        _id: string;
        name: string;
        email: string;
        role: string;
        phone?: string;
    };
    organizationId: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    totalMinutes: number;
    status: string;
    sessions: {
        start: string;
        end: string | null;
        duration: number;
        endReason: string;
    }[];
}

/**
 * Get all agents' online/offline status + today's attendance (owner/admin only)
 */
export async function getAgentsStatus(): Promise<{ data: AgentPresence[]; summary: AgentStatusSummary }> {
    const response = await api.get('/api/attendance/agents-status');
    return response.data;
}

/**
 * Get attendance log for date range
 */
export async function getAttendanceLog(
    startDate: string,
    endDate: string,
    userId?: string
): Promise<{ data: AttendanceRecord[]; meta: { startDate: string; endDate: string; totalRecords: number } }> {
    const params: Record<string, string> = { startDate, endDate };
    if (userId) params.userId = userId;
    const response = await api.get('/api/attendance/log', { params });
    return response.data;
}

/**
 * Format minutes into hours and minutes string
 */
export function formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '0m';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
}
