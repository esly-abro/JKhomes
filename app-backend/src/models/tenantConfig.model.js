/**
 * TenantConfig Model
 * Per-organization configuration for customizable fields, categories, labels, and modules.
 * This is the core SaaS configurability layer — every tenant can customize
 * their CRM field names, dropdown options, currency, and enabled features.
 */

const mongoose = require('mongoose');

// ================================
// SUB-SCHEMAS
// ================================

const categorySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    label: {
        type: String,
        required: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, { _id: false });

// Reuse same sub-schema shape for appointment types
const appointmentTypeSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    label: {
        type: String,
        required: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, { _id: false });

// ================================
// INDUSTRY DEFAULTS
// ================================

/**
 * Returns the default category set for a given industry.
 * These are seeded when a new organization is created during onboarding.
 */
function getDefaultCategories(industry) {
    const industryDefaults = {
        real_estate: [
            { key: 'apartment', label: 'Apartment', isActive: true, order: 0 },
            { key: 'villa', label: 'Villa', isActive: true, order: 1 },
            { key: 'house', label: 'House', isActive: true, order: 2 },
            { key: 'land', label: 'Land', isActive: true, order: 3 },
            { key: 'commercial', label: 'Commercial', isActive: true, order: 4 },
            { key: 'penthouse', label: 'Penthouse', isActive: true, order: 5 },
            { key: 'townhouse', label: 'Townhouse', isActive: true, order: 6 }
        ],
        saas: [
            { key: 'starter', label: 'Starter Plan', isActive: true, order: 0 },
            { key: 'professional', label: 'Professional Plan', isActive: true, order: 1 },
            { key: 'enterprise', label: 'Enterprise Plan', isActive: true, order: 2 },
            { key: 'custom', label: 'Custom Solution', isActive: true, order: 3 }
        ],
        healthcare: [
            { key: 'consultation', label: 'Consultation', isActive: true, order: 0 },
            { key: 'procedure', label: 'Procedure', isActive: true, order: 1 },
            { key: 'checkup', label: 'Health Checkup', isActive: true, order: 2 },
            { key: 'therapy', label: 'Therapy', isActive: true, order: 3 },
            { key: 'surgery', label: 'Surgery', isActive: true, order: 4 }
        ],
        education: [
            { key: 'course', label: 'Course', isActive: true, order: 0 },
            { key: 'program', label: 'Program', isActive: true, order: 1 },
            { key: 'workshop', label: 'Workshop', isActive: true, order: 2 },
            { key: 'certification', label: 'Certification', isActive: true, order: 3 }
        ],
        insurance: [
            { key: 'life', label: 'Life Insurance', isActive: true, order: 0 },
            { key: 'health', label: 'Health Insurance', isActive: true, order: 1 },
            { key: 'auto', label: 'Auto Insurance', isActive: true, order: 2 },
            { key: 'home', label: 'Home Insurance', isActive: true, order: 3 },
            { key: 'business', label: 'Business Insurance', isActive: true, order: 4 }
        ],
        automotive: [
            { key: 'sedan', label: 'Sedan', isActive: true, order: 0 },
            { key: 'suv', label: 'SUV', isActive: true, order: 1 },
            { key: 'hatchback', label: 'Hatchback', isActive: true, order: 2 },
            { key: 'luxury', label: 'Luxury', isActive: true, order: 3 },
            { key: 'commercial', label: 'Commercial Vehicle', isActive: true, order: 4 }
        ],
        finance: [
            { key: 'savings', label: 'Savings Account', isActive: true, order: 0 },
            { key: 'investment', label: 'Investment Plan', isActive: true, order: 1 },
            { key: 'loan', label: 'Loan Product', isActive: true, order: 2 },
            { key: 'insurance', label: 'Insurance Policy', isActive: true, order: 3 },
            { key: 'wealth', label: 'Wealth Management', isActive: true, order: 4 }
        ],
        generic: [
            { key: 'type_a', label: 'Type A', isActive: true, order: 0 },
            { key: 'type_b', label: 'Type B', isActive: true, order: 1 },
            { key: 'type_c', label: 'Type C', isActive: true, order: 2 },
            { key: 'other', label: 'Other', isActive: true, order: 3 }
        ]
    };

    return industryDefaults[industry] || industryDefaults.generic;
}

/**
 * Returns the default location field label per industry.
 * Controls what "Location" is called in the UI (e.g., "Service Area", "Region").
 */
function getDefaultLocationFieldLabel(industry) {
    const labels = {
        real_estate: 'Location',
        saas: 'Region',
        healthcare: 'Service Area',
        education: 'Campus',
        insurance: 'Coverage Area',
        finance: 'Branch',
        automotive: 'Showroom',
        generic: 'Location'
    };
    return labels[industry] || 'Location';
}

/**
 * Returns the default category field label per industry.
 */
function getDefaultCategoryFieldLabel(industry) {
    const labels = {
        real_estate: 'Property Type',
        saas: 'Product Plan',
        healthcare: 'Service Type',
        education: 'Program Type',
        insurance: 'Policy Type',
        finance: 'Product Type',
        automotive: 'Vehicle Type',
        generic: 'Category'
    };
    return labels[industry] || 'Category';
}

/**
 * Returns the default appointment types for a given industry.
 * Each industry has its own meeting/visit terminology.
 */
function getDefaultAppointmentTypes(industry) {
    const industryDefaults = {
        real_estate: [
            { key: 'site_visit', label: 'Site Visit', isActive: true, order: 0 },
            { key: 'meeting', label: 'Meeting', isActive: true, order: 1 },
            { key: 'consultation', label: 'Consultation', isActive: true, order: 2 }
        ],
        saas: [
            { key: 'demo', label: 'Product Demo', isActive: true, order: 0 },
            { key: 'discovery_call', label: 'Discovery Call', isActive: true, order: 1 },
            { key: 'onboarding', label: 'Onboarding Session', isActive: true, order: 2 },
            { key: 'review', label: 'Business Review', isActive: true, order: 3 }
        ],
        healthcare: [
            { key: 'consultation', label: 'Consultation', isActive: true, order: 0 },
            { key: 'follow_up', label: 'Follow-up Visit', isActive: true, order: 1 },
            { key: 'checkup', label: 'Health Checkup', isActive: true, order: 2 },
            { key: 'procedure', label: 'Procedure', isActive: true, order: 3 }
        ],
        education: [
            { key: 'campus_visit', label: 'Campus Visit', isActive: true, order: 0 },
            { key: 'counseling', label: 'Counseling Session', isActive: true, order: 1 },
            { key: 'orientation', label: 'Orientation', isActive: true, order: 2 }
        ],
        insurance: [
            { key: 'consultation', label: 'Policy Consultation', isActive: true, order: 0 },
            { key: 'review', label: 'Policy Review', isActive: true, order: 1 },
            { key: 'claims_meeting', label: 'Claims Meeting', isActive: true, order: 2 }
        ],
        automotive: [
            { key: 'test_drive', label: 'Test Drive', isActive: true, order: 0 },
            { key: 'showroom_visit', label: 'Showroom Visit', isActive: true, order: 1 },
            { key: 'service_appointment', label: 'Service Appointment', isActive: true, order: 2 }
        ],
        finance: [
            { key: 'consultation', label: 'Financial Consultation', isActive: true, order: 0 },
            { key: 'review', label: 'Portfolio Review', isActive: true, order: 1 },
            { key: 'planning', label: 'Planning Session', isActive: true, order: 2 }
        ],
        generic: [
            { key: 'meeting', label: 'Meeting', isActive: true, order: 0 },
            { key: 'consultation', label: 'Consultation', isActive: true, order: 1 },
            { key: 'follow_up', label: 'Follow-up', isActive: true, order: 2 }
        ]
    };
    return industryDefaults[industry] || industryDefaults.generic;
}

/**
 * Returns the default appointment field label per industry.
 */
function getDefaultAppointmentFieldLabel(industry) {
    const labels = {
        real_estate: 'Site Visit',
        saas: 'Demo',
        healthcare: 'Appointment',
        education: 'Campus Visit',
        insurance: 'Policy Consultation',
        finance: 'Financial Consultation',
        automotive: 'Test Drive',
        generic: 'Appointment'
    };
    return labels[industry] || 'Appointment';
}

/**
 * Returns the default catalog module label (e.g., "Properties", "Services", "Products")
 * Used when catalog module is enabled for an organization.
 */
function getDefaultCatalogModuleLabel(industry) {
    const labels = {
        real_estate: 'Properties',
        saas: 'Products',
        healthcare: 'Services',
        education: 'Programs',
        insurance: 'Products',
        automotive: 'Vehicles',
        finance: 'Products',
        generic: 'Catalog'
    };
    return labels[industry] || 'Catalog';
}

/**
 * Returns the default enabled modules per industry.
 * Controls which features are available for each organization type.
 */
function getDefaultEnabledModules(industry) {
    const defaults = {
        real_estate: {
            catalog: true,              // ✅ Properties/Listings
            appointments: true,         // ✅ Site Visits
            broadcasts: true,           // ✅ Marketing Messages
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        saas: {
            catalog: false,             // ❌ NO Properties
            appointments: true,         // ✅ Demo Calls
            broadcasts: true,           // ✅ Marketing
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        healthcare: {
            catalog: false,             // ❌ NO Properties (patients, not properties)
            appointments: true,         // ✅ Consultations
            broadcasts: true,           // ✅ Health Messages
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        education: {
            catalog: false,             // ❌ NO Properties
            appointments: true,         // ✅ Campus Visits
            broadcasts: true,           // ✅ Announcements
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        insurance: {
            catalog: false,             // ❌ NO Properties
            appointments: true,         // ✅ Policy Consultations
            broadcasts: true,           // ✅ Notifications
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        automotive: {
            catalog: true,              // ✅ Vehicle Listings
            appointments: true,         // ✅ Test Drives
            broadcasts: true,           // ✅ Marketing
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        finance: {
            catalog: false,             // ❌ NO Properties
            appointments: true,         // ✅ Loan Consultations
            broadcasts: true,           // ✅ Notifications
            aiCalling: true,            // ✅ AI Calling
            knowledgeBase: true         // ✅ Knowledge Base
        },
        generic: {
            catalog: false,             // Can be enabled if needed
            appointments: true,         // ✅ Generic
            broadcasts: true,           // ✅ Generic
            aiCalling: true,            // ✅ Generic
            knowledgeBase: true         // ✅ Generic
        }
    };
    return defaults[industry] || defaults.generic;
}

function getDefaultAppointmentFieldLabel(industry) {
    const labels = {
        real_estate: 'Site Visit',
        saas: 'Demo',
        healthcare: 'Consultation',
        education: 'Campus Visit',
        insurance: 'Policy Consultation',
        finance: 'Financial Consultation',
        automotive: 'Test Drive',
        generic: 'Appointment'
    };
    return labels[industry] || 'Appointment';
}
// ================================
// MAIN SCHEMA
// ================================

const tenantConfigSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        sparse: true,
        index: true
    },

    // Industry identifier — drives default seeding
    industry: {
        type: String,
        enum: ['real_estate', 'saas', 'healthcare', 'education', 'insurance', 'automotive', 'finance', 'generic'],
        default: 'generic'
    },

    // ================================
    // CONFIGURABLE CATEGORIES
    // (replaces hardcoded PROPERTY_TYPES)
    // ================================
    categories: {
        type: [categorySchema],
        default: function () {
            return getDefaultCategories(this.industry || 'generic');
        }
    },

    // What the category field is called in the UI
    categoryFieldLabel: {
        type: String,
        default: 'Category',
        trim: true
    },

    // ================================
    // CONFIGURABLE APPOINTMENT TYPES
    // (replaces hardcoded "Site Visit")
    // ================================
    appointmentTypes: {
        type: [appointmentTypeSchema],
        default: function () {
            return getDefaultAppointmentTypes(this.industry || 'generic');
        }
    },

    // What the appointment concept is called in the UI ("Site Visit", "Demo", "Appointment")
    appointmentFieldLabel: {
        type: String,
        default: 'Appointment',
        trim: true
    },

    // What the catalog module is called in the UI ("Properties", "Services", "Products", etc.)
    catalogModuleLabel: {
        type: String,
        default: 'Catalog',
        trim: true
    },

    // What the location field is called in the UI ("Location", "Service Area", "Region", etc.)
    locationFieldLabel: {
        type: String,
        default: 'Location',
        trim: true
    },

    // Company name for templates/emails (denormalized from Organization for fast access)
    companyName: {
        type: String,
        trim: true
    },

    // Feature flags — which modules are enabled for this tenant
    enabledModules: {
        catalog: { type: Boolean },      // Catalog (Properties/Services/Products page)
        appointments: { type: Boolean },  // Site visits / appointments
        broadcasts: { type: Boolean },    // WhatsApp broadcasts
        aiCalling: { type: Boolean },     // ElevenLabs AI calls
        knowledgeBase: { type: Boolean }  // Knowledge base
    }
}, {
    timestamps: true
});

// ================================
// STATIC METHODS
// ================================

/**
 * Get the TenantConfig for an organization, or create one with defaults if it doesn't exist.
 * This is the primary access pattern — never fails, always returns a config.
 */
tenantConfigSchema.statics.getOrCreate = async function (organizationId, industry, catalogLabel) {
    // Build query: use orgId if available, otherwise find the "default" config (no org)
    const query = organizationId
        ? { organizationId }
        : { organizationId: { $exists: false } };

    let config = await this.findOne(query);
    if (!config) {
        const effectiveIndustry = industry || (organizationId ? 'generic' : 'real_estate');
        const doc = {
            industry: effectiveIndustry,
            categories: getDefaultCategories(effectiveIndustry),
            categoryFieldLabel: getDefaultCategoryFieldLabel(effectiveIndustry),
            appointmentTypes: getDefaultAppointmentTypes(effectiveIndustry),
            appointmentFieldLabel: getDefaultAppointmentFieldLabel(effectiveIndustry),
            catalogModuleLabel: catalogLabel || getDefaultCatalogModuleLabel(effectiveIndustry),
            locationFieldLabel: getDefaultLocationFieldLabel(effectiveIndustry),
            enabledModules: getDefaultEnabledModules(effectiveIndustry)
        };
        if (organizationId) doc.organizationId = organizationId;
        config = await this.create(doc);
    }
    return config;
};

/**
 * Get active category keys for validation.
 * Used by the service layer to validate incoming category values.
 */
tenantConfigSchema.methods.getActiveCategoryKeys = function () {
    return this.categories
        .filter(c => c.isActive)
        .map(c => c.key);
};

/**
 * Get category label by key.
 */
tenantConfigSchema.methods.getCategoryLabel = function (key) {
    const cat = this.categories.find(c => c.key === key);
    return cat ? cat.label : key;
};

// ================================
// EXPORT
// ================================

const TenantConfig = mongoose.model('TenantConfig', tenantConfigSchema);

// Also export helper functions for use in constants/seeding
TenantConfig.getDefaultCategories = getDefaultCategories;
TenantConfig.getDefaultCategoryFieldLabel = getDefaultCategoryFieldLabel;
TenantConfig.getDefaultLocationFieldLabel = getDefaultLocationFieldLabel;
TenantConfig.getDefaultAppointmentTypes = getDefaultAppointmentTypes;
TenantConfig.getDefaultAppointmentFieldLabel = getDefaultAppointmentFieldLabel;
TenantConfig.getDefaultCatalogModuleLabel = getDefaultCatalogModuleLabel;
TenantConfig.getDefaultEnabledModules = getDefaultEnabledModules;

module.exports = TenantConfig;
