/**
 * API client for per-organization CRM configuration.
 * Manages categories, field labels, industry, and feature modules.
 */
import api from './api';

// ================================
// TYPES
// ================================

export interface CategoryItem {
    key: string;
    label: string;
    isActive: boolean;
    order: number;
}

export interface AppointmentType {
    key: string;
    label: string;
    isActive: boolean;
    order: number;
}

export interface EnabledModules {
    catalog: boolean;
    appointments: boolean;
    broadcasts: boolean;
    aiCalling: boolean;
    knowledgeBase: boolean;
}

export interface TenantConfig {
    _id?: string;
    organizationId?: string;
    industry: string;
    categories: CategoryItem[];
    categoryFieldLabel: string;
    appointmentTypes: AppointmentType[];
    appointmentFieldLabel: string;
    catalogModuleLabel?: string;
    locationFieldLabel: string;
    companyName?: string;
    enabledModules: EnabledModules;
    createdAt?: string;
    updatedAt?: string;
}

// ================================
// API FUNCTIONS
// ================================

/** Get the current tenant config (or defaults if no org yet). */
export async function getTenantConfig(): Promise<TenantConfig> {
    const response = await api.get('/api/tenant-config');
    return response.data;
}

/** Update the categories list and optional field label. */
export async function updateCategories(
    categories: CategoryItem[],
    categoryFieldLabel?: string
): Promise<TenantConfig> {
    const response = await api.put('/api/tenant-config/categories', {
        categories,
        categoryFieldLabel
    });
    return response.data;
}

/** Update appointment types list and optional field label. */
export async function updateAppointmentTypes(
    appointmentTypes: AppointmentType[],
    appointmentFieldLabel?: string
): Promise<TenantConfig> {
    const response = await api.put('/api/tenant-config/appointment-types', {
        appointmentTypes,
        appointmentFieldLabel
    });
    return response.data;
}

/** Update enabled/disabled modules. */
export async function updateModules(modules: Partial<EnabledModules>): Promise<TenantConfig> {
    const response = await api.put('/api/tenant-config/modules', modules);
    return response.data;
}

/** Update industry and optionally reset categories to industry defaults. */
export async function updateIndustry(
    industry: string,
    resetCategories: boolean = false
): Promise<TenantConfig> {
    const response = await api.put('/api/tenant-config/industry', {
        industry,
        resetCategories
    });
    return response.data;
}

/** Get usage counts for each category (how many leads in each). */
export async function getCategoryUsage(): Promise<Record<string, number>> {
    const response = await api.get('/api/tenant-config/category-usage');
    return response.data;
}

/** Update the location field label. */
export async function updateLocationLabel(
    locationFieldLabel: string
): Promise<TenantConfig> {
    const response = await api.put('/api/tenant-config/location-label', {
        locationFieldLabel
    });
    return response.data;
}

// ================================
// DEFAULTS (used before config loads)
// ================================
export const DEFAULT_TENANT_CONFIG: TenantConfig = {
    industry: 'real_estate',
    categories: [
        { key: 'apartment', label: 'Apartment', isActive: true, order: 0 },
        { key: 'villa', label: 'Villa', isActive: true, order: 1 },
        { key: 'house', label: 'House', isActive: true, order: 2 },
        { key: 'land', label: 'Land', isActive: true, order: 3 },
        { key: 'commercial', label: 'Commercial', isActive: true, order: 4 },
        { key: 'penthouse', label: 'Penthouse', isActive: true, order: 5 },
        { key: 'townhouse', label: 'Townhouse', isActive: true, order: 6 }
    ],
    categoryFieldLabel: 'Property Type',
    appointmentTypes: [
        { key: 'site_visit', label: 'Site Visit', isActive: true, order: 0 },
        { key: 'meeting', label: 'Meeting', isActive: true, order: 1 },
        { key: 'consultation', label: 'Consultation', isActive: true, order: 2 }
    ],
    appointmentFieldLabel: 'Site Visit',
    catalogModuleLabel: 'Properties',
    locationFieldLabel: 'Location',
    enabledModules: {
        catalog: true,
        appointments: true,
        broadcasts: true,
        aiCalling: true,
        knowledgeBase: true
    }
};
