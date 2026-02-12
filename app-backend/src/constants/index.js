/**
 * Application Constants
 * Centralized static configuration values
 */

// ================================
// LEAD STATUSES
// ================================

const LEAD_STATUSES = {
    NEW: 'New',
    CALL_ATTENDED: 'Call Attended',
    NO_RESPONSE: 'No Response',
    NOT_INTERESTED: 'Not Interested',
    // Generic appointment statuses (new)
    APPOINTMENT_BOOKED: 'Appointment Booked',
    APPOINTMENT_SCHEDULED: 'Appointment Scheduled',
    // Backward compatibility aliases (old names still work)
    SITE_VISIT_BOOKED: 'Appointment Booked',
    SITE_VISIT_SCHEDULED: 'Appointment Scheduled',
    INTERESTED: 'Interested'
};

const LEAD_STATUS_LIST = [...new Set(Object.values(LEAD_STATUSES))];

const LEAD_STATUS_TRANSITIONS = {
    [LEAD_STATUSES.NEW]: [LEAD_STATUSES.CALL_ATTENDED, LEAD_STATUSES.NO_RESPONSE, LEAD_STATUSES.NOT_INTERESTED],
    [LEAD_STATUSES.CALL_ATTENDED]: [LEAD_STATUSES.INTERESTED, LEAD_STATUSES.NOT_INTERESTED, LEAD_STATUSES.APPOINTMENT_BOOKED],
    [LEAD_STATUSES.NO_RESPONSE]: [LEAD_STATUSES.CALL_ATTENDED, LEAD_STATUSES.NOT_INTERESTED],
    [LEAD_STATUSES.NOT_INTERESTED]: [LEAD_STATUSES.NEW],
    [LEAD_STATUSES.APPOINTMENT_BOOKED]: [LEAD_STATUSES.APPOINTMENT_SCHEDULED, LEAD_STATUSES.NOT_INTERESTED],
    [LEAD_STATUSES.APPOINTMENT_SCHEDULED]: [LEAD_STATUSES.INTERESTED, LEAD_STATUSES.NOT_INTERESTED],
    [LEAD_STATUSES.INTERESTED]: [LEAD_STATUSES.APPOINTMENT_BOOKED, LEAD_STATUSES.NOT_INTERESTED]
};

// ================================
// LEAD SOURCES
// ================================

const LEAD_SOURCES = {
    WEBSITE: 'website',
    REFERRAL: 'referral',
    SOCIAL: 'social',
    ADVERTISEMENT: 'advertisement',
    WHATSAPP: 'whatsapp',
    CALL: 'call',
    WALK_IN: 'walk-in',
    OTHER: 'other'
};

const LEAD_SOURCE_LIST = Object.values(LEAD_SOURCES);

// ================================
// USER ROLES
// ================================

const USER_ROLES = {
    ADMIN: 'admin',
    MANAGER: 'manager',
    AGENT: 'agent',
    VIEWER: 'viewer'
};

const USER_ROLE_LIST = Object.values(USER_ROLES);

const ROLE_HIERARCHY = {
    [USER_ROLES.ADMIN]: 100,
    [USER_ROLES.MANAGER]: 50,
    [USER_ROLES.AGENT]: 20,
    [USER_ROLES.VIEWER]: 10
};

// ================================
// USER STATUSES
// ================================

const USER_STATUSES = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    PENDING: 'pending'
};

const USER_STATUS_LIST = Object.values(USER_STATUSES);

// ================================
// PROPERTY STATUSES
// ================================

const PROPERTY_STATUSES = {
    AVAILABLE: 'available',
    SOLD: 'sold',
    RESERVED: 'reserved',
    UNDER_CONSTRUCTION: 'under-construction'
};

const PROPERTY_STATUS_LIST = Object.values(PROPERTY_STATUSES);

// ================================
// DEFAULT CATEGORIES (was PROPERTY_TYPES)
// These serve as seed defaults for new tenants.
// Runtime validation uses TenantConfig, NOT these constants.
// ================================

const DEFAULT_CATEGORIES = {
    APARTMENT: 'apartment',
    VILLA: 'villa',
    HOUSE: 'house',
    LAND: 'land',
    COMMERCIAL: 'commercial',
    PENTHOUSE: 'penthouse',
    TOWNHOUSE: 'townhouse'
};

const DEFAULT_CATEGORY_LIST = Object.values(DEFAULT_CATEGORIES);

// Backward compatibility aliases — existing code that imports PROPERTY_TYPES still works
const PROPERTY_TYPES = DEFAULT_CATEGORIES;
const PROPERTY_TYPE_LIST = DEFAULT_CATEGORY_LIST;

// ================================
// AUTOMATION TRIGGERS
// ================================

const AUTOMATION_TRIGGERS = {
    LEAD_CREATED: 'lead_created',
    LEAD_UPDATED: 'lead_updated',
    STATUS_CHANGED: 'status_changed',
    APPOINTMENT_SCHEDULED: 'appointment_scheduled',
    // Backward compat alias
    SITE_VISIT_SCHEDULED: 'appointment_scheduled',
    SCHEDULED: 'scheduled',
    WEBHOOK: 'webhook'
};

const AUTOMATION_TRIGGER_LIST = Object.values(AUTOMATION_TRIGGERS);

// ================================
// AUTOMATION ACTIONS
// ================================

const AUTOMATION_ACTIONS = {
    SEND_WHATSAPP: 'send_whatsapp',
    SEND_EMAIL: 'send_email',
    ASSIGN_AGENT: 'assign_agent',
    UPDATE_STATUS: 'update_status',
    CREATE_TASK: 'create_task',
    WAIT: 'wait',
    AI_CALL: 'ai_call',
    HUMAN_CALL: 'human_call',
    CONDITION: 'condition'
};

const AUTOMATION_ACTION_LIST = Object.values(AUTOMATION_ACTIONS);

// ================================
// TASK STATUSES
// ================================

const TASK_STATUSES = {
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    OVERDUE: 'overdue'
};

const TASK_STATUS_LIST = Object.values(TASK_STATUSES);

// ================================
// TASK TYPES
// ================================

const TASK_TYPES = {
    CALL: 'call',
    FOLLOW_UP: 'follow-up',
    APPOINTMENT: 'appointment',
    // Backward compat alias
    SITE_VISIT: 'appointment',
    MEETING: 'meeting',
    DOCUMENT: 'document',
    OTHER: 'other'
};

const TASK_TYPE_LIST = [...new Set(Object.values(TASK_TYPES))];

// ================================
// CALL STATUSES
// ================================

const CALL_STATUSES = {
    PENDING: 'pending',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    NO_ANSWER: 'no-answer',
    BUSY: 'busy',
    CANCELLED: 'cancelled'
};

const CALL_STATUS_LIST = Object.values(CALL_STATUSES);

// ================================
// ERROR CODES
// ================================

const ERROR_CODES = {
    // Authentication
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    FORBIDDEN: 'FORBIDDEN',
    
    // Validation
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    INVALID_INPUT: 'INVALID_INPUT',
    MISSING_FIELD: 'MISSING_FIELD',
    INVALID_FORMAT: 'INVALID_FORMAT',
    
    // Resources
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
    CONFLICT: 'CONFLICT',
    DUPLICATE_KEY: 'DUPLICATE_KEY',
    
    // Rate Limiting
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    
    // External Services
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
    ZOHO_ERROR: 'ZOHO_ERROR',
    TWILIO_ERROR: 'TWILIO_ERROR',
    ELEVENLABS_ERROR: 'ELEVENLABS_ERROR',
    WHATSAPP_ERROR: 'WHATSAPP_ERROR',
    
    // Server
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

// ================================
// HTTP STATUS CODES
// ================================

const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503
};

// ================================
// PAGINATION DEFAULTS
// ================================

const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
};

// ================================
// CACHE KEYS
// ================================

const CACHE_KEYS = {
    LEAD: 'lead',
    LEADS: 'leads',
    AGENT: 'agent',
    AGENTS: 'agents',
    PROPERTY: 'property',
    PROPERTIES: 'properties',
    STATS: 'stats',
    CONFIG: 'config'
};

const CACHE_TTL = {
    SHORT: 60,          // 1 minute
    MEDIUM: 300,        // 5 minutes
    LONG: 3600,         // 1 hour
    VERY_LONG: 86400    // 24 hours
};

// ================================
// EXPORT
// ================================

module.exports = {
    // Lead
    LEAD_STATUSES,
    LEAD_STATUS_LIST,
    LEAD_STATUS_TRANSITIONS,
    LEAD_SOURCES,
    LEAD_SOURCE_LIST,
    
    // User
    USER_ROLES,
    USER_ROLE_LIST,
    ROLE_HIERARCHY,
    USER_STATUSES,
    USER_STATUS_LIST,
    
    // Property / Category (backward compat + new names)
    PROPERTY_STATUSES,
    PROPERTY_STATUS_LIST,
    PROPERTY_TYPES,
    PROPERTY_TYPE_LIST,
    DEFAULT_CATEGORIES,
    DEFAULT_CATEGORY_LIST,
    
    // Automation
    AUTOMATION_TRIGGERS,
    AUTOMATION_TRIGGER_LIST,
    AUTOMATION_ACTIONS,
    AUTOMATION_ACTION_LIST,
    
    // Task
    TASK_STATUSES,
    TASK_STATUS_LIST,
    TASK_TYPES,
    TASK_TYPE_LIST,
    
    // Call
    CALL_STATUSES,
    CALL_STATUS_LIST,
    
    // Error
    ERROR_CODES,
    HTTP_STATUS,
    
    // Pagination
    PAGINATION,
    
    // Cache
    CACHE_KEYS,
    CACHE_TTL
};
