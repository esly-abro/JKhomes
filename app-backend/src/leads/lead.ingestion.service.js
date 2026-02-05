/**
 * Lead Ingestion Service
 * Orchestrates the lead creation/update flow from external sources
 * 
 * This is the primary entry point for leads from:
 * - Meta/Facebook Ads webhooks
 * - Google Ads webhooks
 * - Website forms
 * - Manual API calls
 * 
 * Single Responsibility: Orchestration of lead ingestion pipeline
 */

const leadNormalizer = require('./lead.normalizer');
const leadDeduplicator = require('./lead.deduplicator');
const zohoClient = require('../clients/zoho.client');
const Lead = require('../models/Lead');

/**
 * Process incoming lead from external source
 * 
 * Pipeline:
 * 1. Validate input
 * 2. Normalize data
 * 3. Check for duplicates
 * 4. Create or update in Zoho CRM
 * 5. Sync to MongoDB
 * 6. Trigger automations (async)
 * 
 * @param {Object} rawLeadData - Raw lead data from external source
 * @param {Object} [options] - Processing options
 * @param {string} [options.organizationId] - Organization ID for multi-tenant
 * @param {boolean} [options.triggerAutomations] - Trigger workflow automations (default: true)
 * @param {boolean} [options.syncToMongo] - Sync to MongoDB (default: true)
 * @returns {Promise<Object>} - Processing result
 */
async function ingestLead(rawLeadData, options = {}) {
    const {
        organizationId = null,
        triggerAutomations = true,
        syncToMongo = true
    } = options;

    const startTime = Date.now();
    
    // Step 1: Normalize lead data
    let normalizedData;
    try {
        normalizedData = leadNormalizer.normalize(rawLeadData);
    } catch (error) {
        return {
            success: false,
            action: 'rejected',
            error: error.message,
            errorCode: 'NORMALIZATION_FAILED',
            processingTime: Date.now() - startTime
        };
    }

    // Step 2: Check for duplicates
    const dedupeResult = await leadDeduplicator.findDuplicate(normalizedData, {
        organizationId,
        checkMongoDB: syncToMongo
    });

    const actionPlan = leadDeduplicator.determineAction(dedupeResult);

    // Step 3: Execute action (create or update)
    let zohoResult;
    let zohoLeadId;

    try {
        if (actionPlan.action === 'create') {
            zohoResult = await createInZoho(normalizedData, organizationId);
            zohoLeadId = zohoResult.leadId;
        } else {
            zohoLeadId = dedupeResult.zohoId;
            
            if (zohoLeadId) {
                zohoResult = await updateInZoho(zohoLeadId, normalizedData, organizationId);
            } else {
                // Lead exists in MongoDB but not Zoho - create in Zoho
                zohoResult = await createInZoho(normalizedData, organizationId);
                zohoLeadId = zohoResult.leadId;
            }
        }
    } catch (error) {
        return {
            success: false,
            action: actionPlan.action,
            error: error.message,
            errorCode: 'ZOHO_OPERATION_FAILED',
            matchedBy: dedupeResult.matchType,
            processingTime: Date.now() - startTime
        };
    }

    // Step 4: Sync to MongoDB
    let mongoLead = null;
    if (syncToMongo && process.env.MONGODB_URI) {
        try {
            mongoLead = await syncToMongoDB(zohoLeadId, normalizedData, rawLeadData);
        } catch (error) {
            // Log but don't fail - Zoho is source of truth
            console.error('MongoDB sync failed:', error.message);
        }
    }

    // Step 5: Trigger automations (async - don't await)
    if (triggerAutomations && actionPlan.action === 'create' && mongoLead) {
        triggerNewLeadAutomations(mongoLead).catch(err => {
            console.error('Automation trigger failed:', err.message);
        });
    }

    return {
        success: true,
        action: actionPlan.action === 'create' ? 'created' : 'updated',
        leadId: zohoLeadId,
        mongoId: mongoLead?._id?.toString() || null,
        matchedBy: dedupeResult.matchType !== 'none' ? dedupeResult.matchType : null,
        message: actionPlan.action === 'create' 
            ? 'New lead created successfully'
            : `Existing lead updated (matched by ${dedupeResult.matchType})`,
        processingTime: Date.now() - startTime
    };
}

/**
 * Create lead in Zoho CRM
 * 
 * @param {Object} leadData - Normalized lead data
 * @param {string} [organizationId] - Organization ID
 * @returns {Promise<Object>} - Creation result
 */
async function createInZoho(leadData, organizationId = null) {
    // Remove internal tracking fields before sending to Zoho
    const zohoData = { ...leadData };
    delete zohoData._original;

    const response = await zohoClient.createLead(zohoData, organizationId);
    
    if (!response?.data?.[0]?.details?.id) {
        throw new Error('Zoho CRM did not return lead ID');
    }

    return {
        success: true,
        leadId: response.data[0].details.id,
        response
    };
}

/**
 * Update lead in Zoho CRM
 * 
 * @param {string} leadId - Zoho lead ID
 * @param {Object} leadData - Normalized lead data
 * @param {string} [organizationId] - Organization ID
 * @returns {Promise<Object>} - Update result
 */
async function updateInZoho(leadId, leadData, organizationId = null) {
    // Remove internal tracking fields
    const zohoData = { ...leadData };
    delete zohoData._original;

    const response = await zohoClient.updateLead(leadId, zohoData, organizationId);
    
    return {
        success: true,
        leadId,
        response
    };
}

/**
 * Sync lead to MongoDB
 * 
 * @param {string} zohoId - Zoho lead ID
 * @param {Object} normalizedData - Normalized lead data
 * @param {Object} rawData - Original raw data
 * @returns {Promise<Object>} - MongoDB document
 */
async function syncToMongoDB(zohoId, normalizedData, rawData) {
    const mongoData = {
        zohoId,
        name: normalizedData.Last_Name,
        email: normalizedData.Email,
        phone: normalizedData.Phone,
        company: normalizedData.Company,
        source: rawData.source || 'Website',
        status: 'New',
        syncedWithZoho: true,
        lastSyncedAt: new Date()
    };

    const lead = await Lead.findOneAndUpdate(
        { zohoId },
        { $set: mongoData },
        { upsert: true, new: true }
    );

    return lead;
}

/**
 * Trigger automation workflows for new lead
 * Runs asynchronously - does not block response
 * 
 * @param {Object} mongoLead - MongoDB lead document
 */
async function triggerNewLeadAutomations(mongoLead) {
    try {
        const workflowEngine = require('../services/workflow.engine');
        await workflowEngine.triggerNewLead(mongoLead);
    } catch (error) {
        // Swallow error - automations failing shouldn't affect lead creation
        console.error('Failed to trigger automations for lead:', mongoLead._id, error.message);
    }
}

/**
 * Get valid lead sources for API documentation
 * 
 * @returns {string[]} - Array of valid source identifiers
 */
function getValidSources() {
    return leadNormalizer.getValidSources();
}

module.exports = {
    ingestLead,
    getValidSources,
    createInZoho,
    updateInZoho,
    syncToMongoDB
};
