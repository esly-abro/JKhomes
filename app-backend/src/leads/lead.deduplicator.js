/**
 * Lead Deduplicator Service
 * Handles duplicate detection and decides create vs update action
 * 
 * Single Responsibility: Duplicate detection logic only.
 * Uses injected dependencies for database/API access.
 */

const zohoClient = require('../clients/zoho.client');
const Lead = require('../models/Lead');

/**
 * Deduplication result types
 */
const MATCH_TYPE = {
    NONE: 'none',
    EMAIL: 'email',
    PHONE: 'phone',
    ZOHO_ID: 'zoho_id',
    MONGO_ID: 'mongo_id'
};

/**
 * Search for existing lead in Zoho CRM by email
 * 
 * @param {string} email - Normalized email address
 * @param {string} [organizationId] - Organization ID for multi-tenant
 * @returns {Promise<Object|null>} - Existing lead or null
 */
async function findByEmailInZoho(email, organizationId = null) {
    if (!email) return null;
    
    try {
        const criteria = `(Email:equals:${email})`;
        const response = await zohoClient.searchLeads(criteria, 1, 1, organizationId);
        
        if (response?.data?.length > 0) {
            return response.data[0];
        }
        return null;
    } catch (error) {
        // Log but don't fail - proceed with creation
        console.warn('Zoho email search failed:', error.message);
        return null;
    }
}

/**
 * Search for existing lead in Zoho CRM by phone
 * 
 * @param {string} phone - Normalized phone number
 * @param {string} [organizationId] - Organization ID for multi-tenant
 * @returns {Promise<Object|null>} - Existing lead or null
 */
async function findByPhoneInZoho(phone, organizationId = null) {
    if (!phone) return null;
    
    try {
        // Search both Phone and Mobile fields
        const criteria = `((Phone:equals:${phone})or(Mobile:equals:${phone}))`;
        const response = await zohoClient.searchLeads(criteria, 1, 1, organizationId);
        
        if (response?.data?.length > 0) {
            return response.data[0];
        }
        return null;
    } catch (error) {
        console.warn('Zoho phone search failed:', error.message);
        return null;
    }
}

/**
 * Search for existing lead in MongoDB by email or phone
 * 
 * @param {string} email - Normalized email
 * @param {string} phone - Normalized phone
 * @returns {Promise<Object|null>} - Existing lead or null
 */
async function findInMongoDB(email, phone) {
    if (!process.env.MONGODB_URI) return null;
    
    try {
        const query = { $or: [] };
        
        if (email) {
            query.$or.push({ email: email.toLowerCase() });
        }
        if (phone) {
            // Match last 10 digits for phone comparison
            const phoneDigits = phone.replace(/\D/g, '').slice(-10);
            query.$or.push({ 
                phone: { $regex: phoneDigits + '$' }
            });
        }
        
        if (query.$or.length === 0) return null;
        
        const lead = await Lead.findOne(query).lean();
        return lead;
    } catch (error) {
        console.warn('MongoDB search failed:', error.message);
        return null;
    }
}

/**
 * Find duplicate lead across all data sources
 * Priority: Zoho (source of truth) > MongoDB (local cache)
 * 
 * @param {Object} leadData - Normalized lead data
 * @param {string} leadData.Email - Email address
 * @param {string} leadData.Phone - Phone number
 * @param {Object} [options] - Search options
 * @param {string} [options.organizationId] - Organization ID for multi-tenant
 * @param {boolean} [options.checkMongoDB] - Also check MongoDB (default: true)
 * @returns {Promise<Object>} - Deduplication result
 */
async function findDuplicate(leadData, options = {}) {
    const { organizationId = null, checkMongoDB = true } = options;
    const { Email, Phone } = leadData;

    // Step 1: Search Zoho by email (highest priority match)
    if (Email) {
        const zohoLead = await findByEmailInZoho(Email, organizationId);
        if (zohoLead) {
            return {
                found: true,
                matchType: MATCH_TYPE.EMAIL,
                source: 'zoho',
                lead: zohoLead,
                zohoId: zohoLead.id
            };
        }
    }

    // Step 2: Search Zoho by phone
    if (Phone) {
        const zohoLead = await findByPhoneInZoho(Phone, organizationId);
        if (zohoLead) {
            return {
                found: true,
                matchType: MATCH_TYPE.PHONE,
                source: 'zoho',
                lead: zohoLead,
                zohoId: zohoLead.id
            };
        }
    }

    // Step 3: Check MongoDB (for leads not yet synced to Zoho)
    if (checkMongoDB) {
        const mongoLead = await findInMongoDB(Email, Phone);
        if (mongoLead) {
            return {
                found: true,
                matchType: mongoLead.zohoId ? MATCH_TYPE.ZOHO_ID : MATCH_TYPE.MONGO_ID,
                source: 'mongodb',
                lead: mongoLead,
                zohoId: mongoLead.zohoId || null,
                mongoId: mongoLead._id.toString()
            };
        }
    }

    // No duplicate found
    return {
        found: false,
        matchType: MATCH_TYPE.NONE,
        source: null,
        lead: null
    };
}

/**
 * Determine action to take for a lead based on deduplication result
 * 
 * @param {Object} dedupeResult - Result from findDuplicate
 * @returns {Object} - Action descriptor
 */
function determineAction(dedupeResult) {
    if (!dedupeResult.found) {
        return {
            action: 'create',
            target: 'zoho',
            reason: 'No existing lead found'
        };
    }

    return {
        action: 'update',
        target: dedupeResult.source,
        leadId: dedupeResult.zohoId || dedupeResult.mongoId,
        matchType: dedupeResult.matchType,
        reason: `Existing lead found by ${dedupeResult.matchType}`
    };
}

module.exports = {
    findDuplicate,
    findByEmailInZoho,
    findByPhoneInZoho,
    findInMongoDB,
    determineAction,
    MATCH_TYPE
};
