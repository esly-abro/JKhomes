/**
 * Availability Service
 * API methods for property availability and slot management
 */

import api from './api';

export interface TimeSlot {
    startTime: string;
    endTime: string;
    available?: boolean;
    reason?: string | null;
}

export interface SpecialHours {
    date: Date | string;
    timeSlots: TimeSlot[];
    isClosed: boolean;
}

export interface Weekdays {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
}

export interface AvailabilitySettings {
    enabled: boolean;
    weekdays: Weekdays;
    timeSlots: TimeSlot[];
    slotDuration: number;
    bufferTime: number;
    blockedDates: (Date | string)[];
    maxVisitsPerDay: number;
    specialHours: SpecialHours[];
    advanceBookingDays: number;
    minAdvanceHours: number;
}

export interface AvailableSlotsResponse {
    available: boolean;
    reason?: string;
    date?: string;
    dayOfWeek?: string;
    slots: TimeSlot[];
    slotDuration?: number;
    bufferTime?: number;
    bookedCount?: number;
    maxVisits?: number;
    remainingSlots?: number;
}

export interface ConflictCheckResponse {
    hasConflict: boolean;
    propertyConflict?: {
        message: string;
        existingVisit: {
            id: string;
            leadName: string;
            agentName: string;
        };
    } | null;
    agentConflict?: {
        message: string;
        existingVisit: {
            id: string;
            leadName: string;
            propertyId: string;
        };
    } | null;
}

/**
 * Get available time slots for a property on a specific date
 */
export async function getAvailableSlots(propertyId: string, date: string): Promise<AvailableSlotsResponse> {
    const response = await api.get(`/api/properties/${propertyId}/available-slots`, {
        params: { date }
    });
    return response.data.data;
}

/**
 * Get property availability settings
 */
export async function getPropertyAvailability(propertyId: string): Promise<{ propertyId: string; propertyName: string; availability: AvailabilitySettings }> {
    const response = await api.get(`/api/properties/${propertyId}/availability`);
    return response.data.data;
}

/**
 * Update property availability settings
 */
export async function updatePropertyAvailability(propertyId: string, settings: Partial<AvailabilitySettings>): Promise<AvailabilitySettings> {
    const response = await api.patch(`/api/properties/${propertyId}/availability`, settings);
    return response.data.data;
}

/**
 * Block dates for a property
 */
export async function blockDates(propertyId: string, dates: string[]): Promise<(Date | string)[]> {
    const response = await api.post(`/api/properties/${propertyId}/availability/block-dates`, { dates });
    return response.data.data;
}

/**
 * Unblock dates for a property
 */
export async function unblockDates(propertyId: string, dates: string[]): Promise<(Date | string)[]> {
    const response = await api.post(`/api/properties/${propertyId}/availability/unblock-dates`, { dates });
    return response.data.data;
}

/**
 * Set special hours for a specific date
 */
export async function setSpecialHours(
    propertyId: string, 
    date: string, 
    config: { timeSlots?: TimeSlot[]; isClosed?: boolean }
): Promise<SpecialHours[]> {
    const response = await api.post(`/api/properties/${propertyId}/availability/special-hours`, {
        date,
        ...config
    });
    return response.data.data;
}

/**
 * Check for booking conflicts
 */
export async function checkConflict(
    propertyId: string, 
    date: string, 
    startTime: string,
    excludeVisitId?: string
): Promise<ConflictCheckResponse> {
    const response = await api.post('/api/site-visits/check-conflict', {
        propertyId,
        date,
        startTime,
        excludeVisitId
    });
    return response.data.data;
}

/**
 * Check slot availability before booking
 */
export async function isSlotAvailable(propertyId: string, date: string, startTime: string): Promise<boolean> {
    try {
        const slots = await getAvailableSlots(propertyId, date);
        if (!slots.available) return false;
        
        const slot = slots.slots.find(s => s.startTime === startTime);
        return slot?.available ?? false;
    } catch {
        return false;
    }
}

export default {
    getAvailableSlots,
    getPropertyAvailability,
    updatePropertyAvailability,
    blockDates,
    unblockDates,
    setSpecialHours,
    checkConflict,
    isSlotAvailable
};
