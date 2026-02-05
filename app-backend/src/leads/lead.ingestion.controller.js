/**
 * Lead Ingestion Controller
 * HTTP handlers for external lead ingestion endpoints
 * 
 * These endpoints are PUBLIC (no auth required) for webhook integrations
 * with Meta Ads, Google Ads, and other external lead sources.
 * 
 * Security: Rate limiting and source validation applied via middleware
 */

const leadIngestionService = require('./lead.ingestion.service');
const { ValidationError } = require('../utils/errors');

/**
 * Joi-like validation schema for lead ingestion
 * Lightweight validation without external dependency
 */
const VALIDATION_RULES = {
    name: {
        required: true,
        minLength: 2,
        maxLength: 200,
        message: 'Name is required and must be 2-200 characters'
    },
    email: {
        required: false,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Invalid email format'
    },
    phone: {
        required: false,
        minLength: 6,
        maxLength: 20,
        message: 'Phone must be 6-20 characters'
    },
    source: {
        required: true,
        message: 'Source is required'
    }
};

/**
 * Validate lead input data
 * 
 * @param {Object} data - Request body
 * @returns {Object} - Validation result { valid: boolean, errors: string[] }
 */
function validateLeadInput(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
        return { valid: false, errors: ['Request body must be an object'] };
    }

    // Validate name
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
        errors.push(VALIDATION_RULES.name.message);
    }

    // Validate source
    if (!data.source || typeof data.source !== 'string' || data.source.trim().length === 0) {
        errors.push(VALIDATION_RULES.source.message);
    }

    // Validate email (if provided)
    if (data.email && typeof data.email === 'string' && data.email.trim()) {
        if (!VALIDATION_RULES.email.pattern.test(data.email)) {
            errors.push(VALIDATION_RULES.email.message);
        }
    }

    // Validate phone (if provided)
    if (data.phone && typeof data.phone === 'string' && data.phone.trim()) {
        const phoneDigits = data.phone.replace(/\D/g, '');
        if (phoneDigits.length < 6 || phoneDigits.length > 20) {
            errors.push(VALIDATION_RULES.phone.message);
        }
    }

    // At least one contact method required
    const hasEmail = data.email && typeof data.email === 'string' && data.email.trim();
    const hasPhone = data.phone && typeof data.phone === 'string' && data.phone.trim();
    
    if (!hasEmail && !hasPhone) {
        errors.push('Either email or phone is required');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * POST /api/ingest/leads
 * Ingest a new lead from external source
 * 
 * @route POST /api/ingest/leads
 * @group Lead Ingestion - External lead capture
 * @param {LeadInput.model} body.body.required - Lead data
 * @returns {LeadResult.model} 201 - Lead created
 * @returns {LeadResult.model} 200 - Lead updated (duplicate)
 * @returns {Error.model} 400 - Validation error
 * @returns {Error.model} 500 - Server error
 */
async function ingestLead(request, reply) {
    const startTime = Date.now();

    // Validate input
    const validation = validateLeadInput(request.body);
    if (!validation.valid) {
        return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.errors,
            processingTime: Date.now() - startTime
        });
    }

    // Extract organization context (if available from API key or header)
    const organizationId = request.headers['x-organization-id'] || null;

    // Process lead
    const result = await leadIngestionService.ingestLead(request.body, {
        organizationId,
        triggerAutomations: true,
        syncToMongo: true
    });

    if (!result.success) {
        const statusCode = result.errorCode === 'NORMALIZATION_FAILED' ? 400 : 502;
        return reply.code(statusCode).send({
            success: false,
            error: result.error,
            errorCode: result.errorCode,
            processingTime: result.processingTime
        });
    }

    const statusCode = result.action === 'created' ? 201 : 200;
    return reply.code(statusCode).send({
        success: true,
        action: result.action,
        leadId: result.leadId,
        mongoId: result.mongoId,
        matchedBy: result.matchedBy,
        message: result.message,
        processingTime: result.processingTime
    });
}

/**
 * GET /api/ingest/sources
 * Get list of valid lead sources
 * 
 * @route GET /api/ingest/sources
 * @group Lead Ingestion - External lead capture
 * @returns {SourceList.model} 200 - List of valid sources
 */
async function getSources(request, reply) {
    const sources = leadIngestionService.getValidSources();
    
    return reply.send({
        success: true,
        sources,
        count: sources.length
    });
}

/**
 * POST /api/ingest/leads/batch
 * Ingest multiple leads at once (max 50)
 * 
 * @route POST /api/ingest/leads/batch
 * @group Lead Ingestion - External lead capture
 * @param {Array<LeadInput>} body.body.required - Array of lead data
 * @returns {BatchResult.model} 200 - Batch processing result
 */
async function ingestLeadsBatch(request, reply) {
    const { leads } = request.body;

    if (!Array.isArray(leads)) {
        return reply.code(400).send({
            success: false,
            error: 'Request body must contain a "leads" array'
        });
    }

    if (leads.length === 0) {
        return reply.code(400).send({
            success: false,
            error: 'Leads array cannot be empty'
        });
    }

    if (leads.length > 50) {
        return reply.code(400).send({
            success: false,
            error: 'Maximum 50 leads per batch request'
        });
    }

    const organizationId = request.headers['x-organization-id'] || null;
    const results = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    // Process sequentially to avoid rate limiting
    for (let i = 0; i < leads.length; i++) {
        const leadData = leads[i];
        
        const validation = validateLeadInput(leadData);
        if (!validation.valid) {
            results.push({
                index: i,
                success: false,
                error: validation.errors.join(', ')
            });
            failed++;
            continue;
        }

        try {
            const result = await leadIngestionService.ingestLead(leadData, {
                organizationId,
                triggerAutomations: false, // Trigger automations separately for batch
                syncToMongo: true
            });

            if (result.success) {
                results.push({
                    index: i,
                    success: true,
                    action: result.action,
                    leadId: result.leadId
                });
                
                if (result.action === 'created') created++;
                else updated++;
            } else {
                results.push({
                    index: i,
                    success: false,
                    error: result.error
                });
                failed++;
            }
        } catch (error) {
            results.push({
                index: i,
                success: false,
                error: error.message
            });
            failed++;
        }
    }

    return reply.send({
        success: true,
        summary: {
            total: leads.length,
            created,
            updated,
            failed
        },
        results
    });
}

module.exports = {
    ingestLead,
    getSources,
    ingestLeadsBatch,
    validateLeadInput
};
