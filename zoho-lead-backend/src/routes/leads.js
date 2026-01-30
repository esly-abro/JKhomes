/**
 * Lead Ingestion Routes
 * Handles POST /leads endpoint
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const leadNormalizer = require('../services/leadNormalizer');
const duplicateDetector = require('../services/duplicateDetector');
const logger = require('../utils/logger');

/**
 * Request body validation schema
 */
const leadSchema = Joi.object({
    source: Joi.string().required().messages({
        'any.required': 'Source is required',
        'string.empty': 'Source cannot be empty'
    }),
    name: Joi.string().required().min(2).messages({
        'any.required': 'Name is required',
        'string.empty': 'Name cannot be empty',
        'string.min': 'Name must be at least 2 characters'
    }),
    email: Joi.string().email().optional().allow(null, '').messages({
        'string.email': 'Invalid email format'
    }),
    phone: Joi.string().optional().allow(null, '').messages({
        'string.base': 'Phone must be a string'
    }),
    company: Joi.string().optional().allow(null, ''),
    extra: Joi.object().optional().allow(null)
}).custom((value, helpers) => {
    // At least one of email or phone must be provided
    if (!value.email && !value.phone) {
        return helpers.error('any.custom', {
            message: 'Either email or phone is required'
        });
    }
    return value;
});

/**
 * POST /leads
 * Create or update a lead in Zoho CRM
 * 
 * Request Body:
 * {
 *   "source": "meta_ads",
 *   "name": "John Doe",
 *   "email": "john@example.com",
 *   "phone": "9876543210",
 *   "company": "TechCorp" (optional),
 *   "extra": { } (optional)
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "action": "created" | "updated",
 *   "leadId": "zoho_lead_id",
 *   "message": "Lead created successfully"
 * }
 */
router.post('/', async (req, res, next) => {
    try {
        logger.info('Received lead ingestion request', {
            source: req.body.source,
            hasEmail: !!req.body.email,
            hasPhone: !!req.body.phone
        });

        // Step 1: Validate request body
        const { error, value } = leadSchema.validate(req.body, {
            abortEarly: false,  // Return all errors
            stripUnknown: true  // Remove unknown fields
        });

        if (error) {
            const errors = error.details.map(detail => detail.message);
            logger.warn('Validation failed', { errors });

            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors
            });
        }

        // Step 2: Normalize lead data to Zoho format
        let normalizedLead;
        try {
            normalizedLead = leadNormalizer.normalize(value);
        } catch (normError) {
            logger.error('Normalization failed', {
                error: normError.message,
                data: value
            });

            return res.status(400).json({
                success: false,
                error: 'Data normalization failed',
                details: normError.message
            });
        }

        // Step 3: Process lead (check duplicates + create/update)
        const result = await duplicateDetector.processLead(normalizedLead);

        logger.info('Lead processed successfully', {
            action: result.action,
            leadId: result.leadId
        });

        // Step 4: Return success response
        res.status(result.action === 'created' ? 201 : 200).json({
            success: true,
            action: result.action,
            leadId: result.leadId,
            message: result.message,
            matchedBy: result.matchedBy || null
        });

    } catch (error) {
        next(error);  // Pass to error handler middleware
    }
});

/**
 * GET /leads/sources
 * Get list of valid source values
 */
router.get('/sources', (req, res) => {
    const sources = leadNormalizer.getValidSources();

    res.json({
        success: true,
        sources: sources,
        count: sources.length
    });
});

module.exports = router;
