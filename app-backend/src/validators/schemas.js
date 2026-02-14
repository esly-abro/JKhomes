/**
 * Validation Schemas using Zod
 * Provides type-safe input validation for all endpoints
 */

const { z } = require('zod');

// ================================
// COMMON SCHEMAS
// ================================

const phoneRegex = /^\+?[1-9]\d{9,14}$/;
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const phoneSchema = z.string()
    .regex(phoneRegex, { message: 'Invalid phone number format. Use international format: +1234567890' });

const emailSchema = z.string()
    .email({ message: 'Invalid email format' })
    .max(255, 'Email must be less than 255 characters');

const objectIdSchema = z.string()
    .regex(objectIdRegex, { message: 'Invalid ID format' });

const paginationSchema = z.object({
    page: z.string()
        .transform(val => parseInt(val, 10))
        .pipe(z.number().int().positive())
        .optional()
        .default('1'),
    limit: z.string()
        .transform(val => parseInt(val, 10))
        .pipe(z.number().int().positive().max(100))
        .optional()
        .default('20'),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
});

// ================================
// LEAD SCHEMAS
// ================================

const createLeadSchema = z.object({
    body: z.object({
        name: z.string()
            .min(2, 'Name must be at least 2 characters')
            .max(100, 'Name must be less than 100 characters'),
        phone: phoneSchema,
        email: emailSchema.optional(),
        source: z.enum(['website', 'referral', 'social', 'advertisement', 'whatsapp', 'call', 'walk-in', 'other']).optional(),
        status: z.string().max(100).optional(),
        budget: z.number().positive().optional(),
        notes: z.string().max(2000, 'Notes must be less than 2000 characters').optional(),
        propertyInterest: z.string().optional(),
        agentId: objectIdSchema.optional(),
        propertyId: objectIdSchema.optional(),
        tags: z.array(z.string().max(50)).max(10).optional(),
        customFields: z.record(z.any()).optional()
    })
});

const updateLeadSchema = z.object({
    params: z.object({
        id: objectIdSchema
    }),
    body: z.object({
        name: z.string().min(2).max(100).optional(),
        phone: phoneSchema.optional(),
        email: emailSchema.optional(),
        source: z.enum(['website', 'referral', 'social', 'advertisement', 'whatsapp', 'call', 'walk-in', 'other']).optional(),
        status: z.string().max(100).optional(),
        budget: z.number().positive().optional(),
        notes: z.string().max(2000).optional(),
        propertyInterest: z.string().optional(),
        agentId: objectIdSchema.nullable().optional(),
        propertyId: objectIdSchema.nullable().optional(),
        tags: z.array(z.string().max(50)).max(10).optional(),
        customFields: z.record(z.any()).optional(),
        lostReason: z.string().max(500).optional()
    })
});

const getLeadsSchema = z.object({
    query: paginationSchema.extend({
        status: z.string().max(100).optional(),
        agentId: objectIdSchema.optional(),
        source: z.string().optional(),
        search: z.string().max(100).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        minBudget: z.string().transform(val => parseFloat(val)).pipe(z.number().positive()).optional(),
        maxBudget: z.string().transform(val => parseFloat(val)).pipe(z.number().positive()).optional()
    })
});

// ================================
// AGENT/USER SCHEMAS
// ================================

const createAgentSchema = z.object({
    body: z.object({
        name: z.string().min(2, 'Name must be at least 2 characters').max(100),
        email: emailSchema,
        phone: phoneSchema,
        password: z.string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
            .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
            .regex(/[0-9]/, 'Password must contain at least one number'),
        role: z.enum(['agent', 'manager', 'admin']).optional().default('agent'),
        teamId: objectIdSchema.optional()
    })
});

const updateAgentSchema = z.object({
    params: z.object({
        id: objectIdSchema
    }),
    body: z.object({
        name: z.string().min(2).max(100).optional(),
        email: emailSchema.optional(),
        phone: phoneSchema.optional(),
        role: z.enum(['agent', 'manager', 'admin']).optional(),
        status: z.enum(['active', 'inactive', 'suspended']).optional(),
        teamId: objectIdSchema.nullable().optional(),
        notificationPreferences: z.object({
            email: z.boolean().optional(),
            sms: z.boolean().optional(),
            whatsapp: z.boolean().optional(),
            push: z.boolean().optional()
        }).optional()
    })
});

const getAgentsSchema = z.object({
    query: paginationSchema.extend({
        status: z.enum(['active', 'inactive', 'suspended']).optional(),
        role: z.enum(['agent', 'manager', 'admin']).optional(),
        search: z.string().max(100).optional(),
        teamId: objectIdSchema.optional()
    })
});

// ================================
// PROPERTY SCHEMAS
// ================================

const createPropertySchema = z.object({
    body: z.object({
        title: z.string().min(5, 'Title must be at least 5 characters').max(200),
        description: z.string().max(5000).optional(),
        propertyType: z.string().min(1, 'Category is required'),  // Dynamic: validated against TenantConfig.categories at service layer
        category: z.string().min(1).optional(),  // Alias for propertyType — accepts either field name
        status: z.enum(['available', 'sold', 'reserved', 'under-construction']).optional().default('available'),
        price: z.number().positive('Price must be positive'),
        currency: z.string().length(3).optional().default('INR'),
        location: z.object({
            address: z.string().min(5).max(500),
            city: z.string().min(2).max(100),
            state: z.string().min(2).max(100).optional(),
            pincode: z.string().max(20).optional(),
            coordinates: z.object({
                lat: z.number().min(-90).max(90),
                lng: z.number().min(-180).max(180)
            }).optional()
        }),
        specifications: z.object({
            bedrooms: z.number().int().nonnegative().optional(),
            bathrooms: z.number().int().nonnegative().optional(),
            area: z.number().positive().optional(),
            areaUnit: z.enum(['sqft', 'sqm', 'sqyd']).optional(),
            floor: z.number().int().optional(),
            totalFloors: z.number().int().positive().optional(),
            parking: z.number().int().nonnegative().optional(),
            furnishing: z.enum(['unfurnished', 'semi-furnished', 'fully-furnished']).optional(),
            facing: z.string().max(50).optional()
        }).optional(),
        amenities: z.array(z.string().max(100)).max(50).optional(),
        images: z.array(z.string().url()).max(20).optional(),
        virtualTourUrl: z.string().url().optional(),
        agentId: objectIdSchema.optional(),
        tags: z.array(z.string().max(50)).max(10).optional()
    })
});

const updatePropertySchema = z.object({
    params: z.object({
        id: objectIdSchema
    }),
    body: createPropertySchema.shape.body.partial()
});

const getPropertiesSchema = z.object({
    query: paginationSchema.extend({
        status: z.enum(['available', 'sold', 'reserved', 'under-construction']).optional(),
        propertyType: z.string().optional(),  // Dynamic: validated against TenantConfig.categories at service layer
        category: z.string().optional(),  // Alias for propertyType
        city: z.string().optional(),
        minPrice: z.string().transform(val => parseFloat(val)).pipe(z.number().positive()).optional(),
        maxPrice: z.string().transform(val => parseFloat(val)).pipe(z.number().positive()).optional(),
        minBedrooms: z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().nonnegative()).optional(),
        maxBedrooms: z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().nonnegative()).optional(),
        minArea: z.string().transform(val => parseFloat(val)).pipe(z.number().positive()).optional(),
        maxArea: z.string().transform(val => parseFloat(val)).pipe(z.number().positive()).optional(),
        search: z.string().max(100).optional(),
        agentId: objectIdSchema.optional()
    })
});

// ================================
// AUTH SCHEMAS
// ================================

const loginSchema = z.object({
    body: z.object({
        email: emailSchema,
        password: z.string().min(1, 'Password is required')
    })
});

const registerSchema = z.object({
    body: z.object({
        name: z.string().min(2).max(100),
        email: emailSchema,
        phone: phoneSchema,
        password: z.string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
            .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
            .regex(/[0-9]/, 'Password must contain at least one number')
    })
});

const refreshTokenSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required')
    })
});

const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z.string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
            .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
            .regex(/[0-9]/, 'Password must contain at least one number')
    })
});

const forgotPasswordSchema = z.object({
    body: z.object({
        email: emailSchema
    })
});

const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1, 'Reset token is required'),
        password: z.string()
            .min(8, 'Password must be at least 8 characters')
            .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
            .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
            .regex(/[0-9]/, 'Password must contain at least one number')
    })
});

// ================================
// VOICE/CALL SCHEMAS
// ================================

const initiateCallSchema = z.object({
    body: z.object({
        leadId: objectIdSchema,
        type: z.enum(['ai', 'manual']).optional().default('ai'),
        message: z.string().min(10).max(1000).optional(),
        callbackUrl: z.string().url().optional()
    })
});

// ================================
// WHATSAPP SCHEMAS
// ================================

const sendWhatsAppSchema = z.object({
    body: z.object({
        leadId: objectIdSchema.optional(),
        phone: phoneSchema.optional(),
        templateName: z.string().max(100).optional(),
        templateParams: z.array(z.string()).optional(),
        message: z.string().max(4096).optional()
    }).refine(data => data.leadId || data.phone, {
        message: 'Either leadId or phone is required'
    }).refine(data => data.templateName || data.message, {
        message: 'Either templateName or message is required'
    })
});

// ================================
// AUTOMATION SCHEMAS
// ================================

const createAutomationSchema = z.object({
    body: z.object({
        name: z.string().min(2).max(100),
        description: z.string().max(500).optional(),
        trigger: z.object({
            type: z.enum(['lead_created', 'lead_updated', 'status_changed', 'scheduled', 'webhook']),
            conditions: z.record(z.any()).optional()
        }),
        actions: z.array(z.object({
            type: z.enum(['send_whatsapp', 'send_email', 'assign_agent', 'update_status', 'create_task', 'wait', 'ai_call']),
            config: z.record(z.any()),
            delay: z.number().int().nonnegative().optional()
        })).min(1).max(20),
        isActive: z.boolean().optional().default(true)
    })
});

// ================================
// COMMON PARAM SCHEMAS
// ================================

const idParamSchema = z.object({
    params: z.object({
        id: objectIdSchema
    })
});

module.exports = {
    // Common
    phoneSchema,
    emailSchema,
    objectIdSchema,
    paginationSchema,
    idParamSchema,
    
    // Leads
    createLeadSchema,
    updateLeadSchema,
    getLeadsSchema,
    
    // Agents
    createAgentSchema,
    updateAgentSchema,
    getAgentsSchema,
    
    // Properties
    createPropertySchema,
    updatePropertySchema,
    getPropertiesSchema,
    
    // Auth
    loginSchema,
    registerSchema,
    refreshTokenSchema,
    changePasswordSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    
    // Voice
    initiateCallSchema,
    
    // WhatsApp
    sendWhatsAppSchema,
    
    // Automation
    createAutomationSchema
};
