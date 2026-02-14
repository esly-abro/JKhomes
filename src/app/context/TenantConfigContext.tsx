/**
 * TenantConfigContext
 * React context that provides per-tenant CRM configuration to all components.
 * Loads once after login, provides categories, field labels, enabled modules, etc.
 *
 * Usage:
 *   const { tenantConfig, categories, categoryFieldLabel, refreshConfig } = useTenantConfig();
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getTenantConfig, TenantConfig, CategoryItem, AppointmentType, LeadStatus, DEFAULT_TENANT_CONFIG } from '../../services/tenantConfig';

// ================================
// CONTEXT TYPES
// ================================

interface TenantConfigContextType {
    /** The full tenant config object */
    tenantConfig: TenantConfig;
    /** The industry this tenant belongs to */
    industry: string;
    /** Map of enabled/disabled modules */
    enabledModules: Record<string, boolean>;
    /** Dynamic label for the catalog module (e.g. "Properties", "Products") */
    catalogModuleLabel: string;
    /** Active categories (sorted by order) */
    categories: CategoryItem[];
    /** The label for the category field (e.g., "Property Type", "Product Plan") */
    categoryFieldLabel: string;
    /** Active lead statuses (sorted by order) — the tenant's custom pipeline */
    leadStatuses: LeadStatus[];
    /** All lead status keys (active only) */
    leadStatusKeys: string[];
    /** Closed status keys (deal won/lost) */
    closedStatusKeys: string[];
    /** Get status label by key */
    getStatusLabel: (key: string) => string;
    /** Get status color by key */
    getStatusColor: (key: string) => string;
    /** Active appointment types (sorted by order) */
    appointmentTypes: AppointmentType[];
    /** The label for the appointment field (e.g., "Site Visit", "Meeting", "Appointment") */
    appointmentFieldLabel: string;
    /** The label for the location field (e.g., "Location", "Service Area", "Region") */
    locationFieldLabel: string;
    /** Whether a module is enabled */
    isModuleEnabled: (moduleName: string) => boolean;
    /** Get category label by key */
    getCategoryLabel: (key: string) => string;
    /** Get appointment type label by key */
    getAppointmentTypeLabel: (key: string) => string;
    /** Loading state */
    loading: boolean;
    /** Re-fetch config from server (call after updating config in Settings) */
    refreshConfig: () => Promise<void>;
}

const TenantConfigContext = createContext<TenantConfigContextType>({
    tenantConfig: DEFAULT_TENANT_CONFIG,
    industry: DEFAULT_TENANT_CONFIG.industry || 'generic',
    enabledModules: (DEFAULT_TENANT_CONFIG.enabledModules || {}) as unknown as Record<string, boolean>,
    catalogModuleLabel: DEFAULT_TENANT_CONFIG.catalogModuleLabel || 'Catalog',
    categories: DEFAULT_TENANT_CONFIG.categories,
    categoryFieldLabel: DEFAULT_TENANT_CONFIG.categoryFieldLabel,
    leadStatuses: DEFAULT_TENANT_CONFIG.leadStatuses,
    leadStatusKeys: DEFAULT_TENANT_CONFIG.leadStatuses.filter(s => s.isActive).map(s => s.key),
    closedStatusKeys: DEFAULT_TENANT_CONFIG.leadStatuses.filter(s => s.isActive && s.isClosed).map(s => s.key),
    getStatusLabel: (key) => key,
    getStatusColor: () => '#6b7280',
    appointmentTypes: DEFAULT_TENANT_CONFIG.appointmentTypes,
    appointmentFieldLabel: DEFAULT_TENANT_CONFIG.appointmentFieldLabel,
    locationFieldLabel: DEFAULT_TENANT_CONFIG.locationFieldLabel,
    isModuleEnabled: () => true,
    getCategoryLabel: (key) => key,
    getAppointmentTypeLabel: (key) => key,
    loading: false,
    refreshConfig: async () => {}
});

// ================================
// PROVIDER
// ================================

export function TenantConfigProvider({ children }: { children: React.ReactNode }) {
    const [tenantConfig, setTenantConfig] = useState<TenantConfig>(DEFAULT_TENANT_CONFIG);
    const [loading, setLoading] = useState(false);

    const loadConfig = useCallback(async () => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;

        try {
            setLoading(true);
            const config = await getTenantConfig();
            setTenantConfig(config);
        } catch (error) {
            console.error('[TenantConfig] Failed to load config:', error);
            // Keep defaults — don't crash the app
        } finally {
            setLoading(false);
        }
    }, []);

    // Load on mount if authenticated
    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    // Derived: active categories sorted by order
    const categories = (tenantConfig.categories || [])
        .filter((c: CategoryItem) => c.isActive)
        .sort((a: CategoryItem, b: CategoryItem) => a.order - b.order);

    const categoryFieldLabel = tenantConfig.categoryFieldLabel || 'Category';

    // Derived: active lead statuses sorted by order
    const leadStatuses = (tenantConfig.leadStatuses || DEFAULT_TENANT_CONFIG.leadStatuses)
        .filter((s: LeadStatus) => s.isActive)
        .sort((a: LeadStatus, b: LeadStatus) => a.order - b.order);

    const leadStatusKeys = leadStatuses.map((s: LeadStatus) => s.key);
    const closedStatusKeys = leadStatuses.filter((s: LeadStatus) => s.isClosed).map((s: LeadStatus) => s.key);

    // Derived: active appointment types sorted by order
    const appointmentTypes = (tenantConfig.appointmentTypes || [])
        .filter((a: AppointmentType) => a.isActive)
        .sort((a: AppointmentType, b: AppointmentType) => a.order - b.order);

    const appointmentFieldLabel = tenantConfig.appointmentFieldLabel || 'Appointment';
    const locationFieldLabel = tenantConfig.locationFieldLabel || 'Location';
    const industry = (tenantConfig as any).industry || 'generic';
    const enabledModules = ((tenantConfig as any).enabledModules || {}) as Record<string, boolean>;
    const catalogModuleLabel = (tenantConfig as any).catalogModuleLabel || 'Catalog';

    const isModuleEnabled = useCallback((moduleName: string): boolean => {
        const modules = tenantConfig.enabledModules;
        return (modules as any)?.[moduleName] !== false;
    }, [tenantConfig.enabledModules]);

    const getCategoryLabel = useCallback((key: string): string => {
        const cat = (tenantConfig.categories || []).find((c: CategoryItem) => c.key === key);
        return cat ? cat.label : key;
    }, [tenantConfig.categories]);

    const getAppointmentTypeLabel = useCallback((key: string): string => {
        const apt = (tenantConfig.appointmentTypes || []).find((a: AppointmentType) => a.key === key);
        return apt ? apt.label : key;
    }, [tenantConfig.appointmentTypes]);

    const getStatusLabel = useCallback((key: string): string => {
        const allStatuses = tenantConfig.leadStatuses || DEFAULT_TENANT_CONFIG.leadStatuses;
        const st = allStatuses.find((s: LeadStatus) => s.key === key);
        return st ? st.label : key;
    }, [tenantConfig.leadStatuses]);

    const getStatusColor = useCallback((key: string): string => {
        const allStatuses = tenantConfig.leadStatuses || DEFAULT_TENANT_CONFIG.leadStatuses;
        const st = allStatuses.find((s: LeadStatus) => s.key === key);
        return st ? st.color : '#6b7280';
    }, [tenantConfig.leadStatuses]);

    const value: TenantConfigContextType = {
        tenantConfig,
        industry,
        enabledModules,
        catalogModuleLabel,
        categories,
        categoryFieldLabel,
        leadStatuses,
        leadStatusKeys,
        closedStatusKeys,
        getStatusLabel,
        getStatusColor,
        appointmentTypes,
        appointmentFieldLabel,
        locationFieldLabel,
        isModuleEnabled,
        getCategoryLabel,
        getAppointmentTypeLabel,
        loading,
        refreshConfig: loadConfig
    };

    return (
        <TenantConfigContext.Provider value={value}>
            {children}
        </TenantConfigContext.Provider>
    );
}

// ================================
// HOOK
// ================================

export function useTenantConfig() {
    const context = useContext(TenantConfigContext);
    if (!context) {
        throw new Error('useTenantConfig must be used within a TenantConfigProvider');
    }
    return context;
}

export default TenantConfigContext;
