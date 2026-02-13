/**
 * useOrganization Hook
 * Provides organization and module access information in frontend components
 * 
 * Usage:
 *   const { organization, industry, isModuleEnabled, catalogModuleLabel } = useOrganization();
 */

import { useTenantConfig } from '../context/TenantConfigContext';
import { isModuleEnabledForIndustry } from '../config/organizationModules';

export interface UseOrganizationReturn {
  industry: string;
  enabledModules: Record<string, boolean>;
  isModuleEnabled: (module: string) => boolean;
  canAccessModule: (module: string) => boolean;
  categoryFieldLabel: string;
  appointmentFieldLabel: string;
  catalogModuleLabel: string;
}

/**
 * Hook that provides organization configuration and module access control
 * Returns organization details and methods to check module access
 */
export function useOrganization(): UseOrganizationReturn {
  const tenantConfig = useTenantConfig();

  if (!tenantConfig) {
    throw new Error('useOrganization must be used within TenantConfigProvider');
  }

  const {
    industry = 'generic',
    enabledModules = {},
    categoryFieldLabel = 'Category',
    appointmentFieldLabel = 'Appointment',
    catalogModuleLabel = 'Catalog'
  } = tenantConfig;

  /**
   * Check if a module is enabled for this organization
   */
  const isModuleEnabled = (module: string): boolean => {
    // First check the actual enabledModules from config
    if (enabledModules[module] !== undefined) {
      return enabledModules[module] === true;
    }

    // Fall back to industry defaults
    return isModuleEnabledForIndustry(industry as any, module as any);
  };

  /**
   * Alias for isModuleEnabled for semantic clarity
   */
  const canAccessModule = (module: string): boolean => {
    return isModuleEnabled(module);
  };

  return {
    industry,
    enabledModules,
    isModuleEnabled,
    canAccessModule,
    categoryFieldLabel,
    appointmentFieldLabel,
    catalogModuleLabel
  };
}
