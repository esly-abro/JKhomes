/**
 * Organization Module Configuration
 * Maps organization industry type to available features/modules
 */

export type Industry = 'real_estate' | 'saas' | 'healthcare' | 'education' | 'insurance' | 'automotive' | 'finance' | 'generic';

export interface ModuleConfig {
  catalog: boolean;
  appointments: boolean;
  broadcasts: boolean;
  aiCalling: boolean;
  knowledgeBase: boolean;
}

export interface OrganizationConfig {
  industry: Industry;
  enabledModules: ModuleConfig;
  categoryFieldLabel: string;
  appointmentFieldLabel: string;
}

/**
 * Default module configurations per industry
 * This determines which features are available for each organization type
 * NOTE: Catalog is now enabled for ALL industries with custom labels per industry
 */
export const INDUSTRY_DEFAULTS: Record<Industry, ModuleConfig> = {
  real_estate: {
    catalog: true,              // ✅ "Properties" - Real Estate listings
    appointments: true,         // ✅ Site Visits
    broadcasts: true,           // ✅ Marketing Messages
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  healthcare: {
    catalog: true,              // ✅ "Services" - Medical services/departments (customizable label)
    appointments: true,         // ✅ Consultations/Check-ins
    broadcasts: true,           // ✅ Health Messages
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  saas: {
    catalog: true,              // ✅ "Products" - Software products/offerings (customizable label)
    appointments: true,         // ✅ Demo Calls
    broadcasts: true,           // ✅ Marketing
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  education: {
    catalog: true,              // ✅ "Programs" - Educational programs/courses (customizable label)
    appointments: true,         // ✅ Campus Visits/Counseling
    broadcasts: true,           // ✅ Announcements
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  insurance: {
    catalog: true,              // ✅ "Products" - Insurance products/plans (customizable label)
    appointments: true,         // ✅ Policy Consultations
    broadcasts: true,           // ✅ Notifications
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  automotive: {
    catalog: true,              // ✅ "Vehicles" - Vehicle inventory (customizable label)
    appointments: true,         // ✅ Test Drives
    broadcasts: true,           // ✅ Marketing
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  finance: {
    catalog: true,              // ✅ "Products" - Financial products/services (customizable label)
    appointments: true,         // ✅ Financial Consultations
    broadcasts: true,           // ✅ Notifications
    aiCalling: true,            // ✅ AI Calling
    knowledgeBase: true         // ✅ Knowledge Base
  },
  
  generic: {
    catalog: true,              // ✅ "Catalog" - Generic catalog with custom label
    appointments: true,         // ✅ Generic appointments
    broadcasts: true,           // ✅ Generic broadcasts
    aiCalling: true,            // ✅ Generic AI Calling
    knowledgeBase: true         // ✅ Generic Knowledge Base
  }
};

/**
 * Get module configuration for an industry
 */
export function getModuleConfigForIndustry(industry: Industry): ModuleConfig {
  return INDUSTRY_DEFAULTS[industry] || INDUSTRY_DEFAULTS.generic;
}

/**
 * Check if a specific module is enabled for an industry
 */
export function isModuleEnabledForIndustry(industry: Industry, module: keyof ModuleConfig): boolean {
  const config = getModuleConfigForIndustry(industry);
  return config[module] === true;
}
