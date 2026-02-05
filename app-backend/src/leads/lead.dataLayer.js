/**
 * Lead Data Layer
 * 
 * Establishes clear data ownership rules:
 * - Zoho CRM: Source of truth for lead core data (name, email, phone, company, status)
 * - MongoDB: Local-only fields (propertyId, assignedTo, notes, automations)
 * 
 * WRITE RULES:
 * - Status changes → ALWAYS write to Zoho first, then cache in MongoDB
 * - Local fields (propertyId, assignedTo) → MongoDB only
 * - Core fields (name, email, phone) → Zoho only
 * 
 * READ RULES:
 * - Core data comes from Zoho
 * - Local fields merged from MongoDB
 * - Status NEVER overridden from MongoDB (it's a cache, not source)
 */

const zohoClient = require('../clients/zoho.client');
const Lead = require('../models/Lead');

// Fields that live in MongoDB only (never sent to Zoho)
const LOCAL_ONLY_FIELDS = [
    'propertyId',
    'assignedTo',
    'assignedToName',
    'assignedAt',
    'assignedBy',
    'notes',           // AI call notes
    'internalNotes',   // Agent notes
    'lastCallAt',
    'callCount',
    'automationData',
    '_mongoId'
];

// Fields that must sync to Zoho (Zoho is source of truth)
const ZOHO_FIELDS = [
    'status',
    'name',
    'email', 
    'phone',
    'company',
    'source'
];

// Zoho field name mapping
const FRONTEND_TO_ZOHO_MAP = {
    name: 'Last_Name',
    firstName: 'First_Name',
    email: 'Email',
    phone: 'Phone',
    mobile: 'Mobile',
    company: 'Company',
    source: 'Lead_Source',
    status: 'Lead_Status'
};

const ZOHO_TO_FRONTEND_MAP = Object.fromEntries(
    Object.entries(FRONTEND_TO_ZOHO_MAP).map(([k, v]) => [v, k])
);

/**
 * Check if MongoDB is available
 */
function useDatabase() {
    return !!process.env.MONGODB_URI;
}

/**
 * Update lead status - ALWAYS writes to Zoho first
 * 
 * @param {string} leadId - Zoho lead ID
 * @param {string} newStatus - New status value
 * @param {Object} options - Additional options
 * @param {string} options.reason - Reason for status change (for audit)
 * @param {boolean} options.skipZoho - Only for emergency/offline mode
 * @returns {Promise<Object>} - Update result
 */
async function updateLeadStatus(leadId, newStatus, options = {}) {
    const { reason = 'status_update', skipZoho = false } = options;
    
    console.log(`[DataLayer] Updating lead ${leadId} status to "${newStatus}" (reason: ${reason})`);
    
    // Step 1: Update Zoho CRM (source of truth)
    let zohoUpdated = false;
    if (!skipZoho) {
        try {
            const zohoResult = await zohoClient.updateLead(leadId, {
                Lead_Status: newStatus
            });
            
            if (zohoResult.success) {
                zohoUpdated = true;
                console.log(`[DataLayer] ✅ Zoho status updated for ${leadId}`);
            } else {
                console.error(`[DataLayer] ⚠️ Zoho update failed:`, zohoResult.error);
                // Don't throw - we'll cache in MongoDB and retry later
            }
        } catch (error) {
            console.error(`[DataLayer] ⚠️ Zoho API error:`, error.message);
            // Cache the change in MongoDB for later sync
        }
    }
    
    // Step 2: Update MongoDB cache (for fast reads and offline resilience)
    if (useDatabase()) {
        try {
            const update = {
                status: newStatus,
                statusUpdatedAt: new Date(),
                statusSyncedToZoho: zohoUpdated,
                lastStatusChange: {
                    from: null, // Will be populated by pre-save hook if needed
                    to: newStatus,
                    reason,
                    timestamp: new Date(),
                    syncedToZoho: zohoUpdated
                }
            };
            
            // If Zoho update failed, mark for retry
            if (!zohoUpdated && !skipZoho) {
                update.pendingZohoSync = true;
                update.$push = {
                    pendingSyncQueue: {
                        field: 'Lead_Status',
                        value: newStatus,
                        timestamp: new Date(),
                        reason
                    }
                };
            }
            
            await Lead.findOneAndUpdate(
                { zohoId: leadId },
                update,
                { upsert: false } // Don't create if doesn't exist
            );
            
            console.log(`[DataLayer] ✅ MongoDB cache updated for ${leadId}`);
        } catch (dbError) {
            console.error(`[DataLayer] MongoDB update failed:`, dbError.message);
            // If both fail, throw
            if (!zohoUpdated) {
                throw new Error(`Failed to update status in both Zoho and MongoDB: ${dbError.message}`);
            }
        }
    }
    
    return {
        success: zohoUpdated || useDatabase(),
        zohoSynced: zohoUpdated,
        leadId,
        status: newStatus
    };
}

/**
 * Update local-only fields (propertyId, assignedTo, notes)
 * These NEVER go to Zoho
 * 
 * @param {string} leadId - Zoho lead ID
 * @param {Object} localData - Local field updates
 */
async function updateLocalFields(leadId, localData) {
    if (!useDatabase()) {
        console.warn('[DataLayer] MongoDB not available, local fields not persisted');
        return { success: false, reason: 'no_database' };
    }
    
    // Filter to only allow local fields
    const sanitizedData = {};
    for (const [key, value] of Object.entries(localData)) {
        if (LOCAL_ONLY_FIELDS.includes(key)) {
            sanitizedData[key] = value;
        } else {
            console.warn(`[DataLayer] Ignoring non-local field: ${key}`);
        }
    }
    
    if (Object.keys(sanitizedData).length === 0) {
        return { success: true, reason: 'no_local_fields' };
    }
    
    sanitizedData.localFieldsUpdatedAt = new Date();
    
    await Lead.findOneAndUpdate(
        { zohoId: leadId },
        sanitizedData,
        { upsert: true, new: true }
    );
    
    console.log(`[DataLayer] Local fields updated for ${leadId}:`, Object.keys(sanitizedData));
    
    return { success: true, fields: Object.keys(sanitizedData) };
}

/**
 * Merge Zoho lead with MongoDB local fields
 * MongoDB status is IGNORED - Zoho is source of truth
 * 
 * @param {Object} zohoLead - Lead data from Zoho (already mapped to frontend format)
 * @returns {Object} - Merged lead with local fields
 */
async function mergeWithLocalData(zohoLead) {
    if (!useDatabase() || !zohoLead?.id) {
        return zohoLead;
    }
    
    try {
        const mongoLead = await Lead.findOne({ zohoId: zohoLead.id }).lean();
        
        if (!mongoLead) {
            return zohoLead;
        }
        
        // Merge ONLY local fields from MongoDB
        const merged = { ...zohoLead };
        
        for (const field of LOCAL_ONLY_FIELDS) {
            if (mongoLead[field] !== undefined && mongoLead[field] !== null) {
                if (field === 'propertyId' || field === 'assignedTo') {
                    merged[field] = mongoLead[field].toString();
                } else {
                    merged[field] = mongoLead[field];
                }
            }
        }
        
        // Add MongoDB ID for reference
        merged._mongoId = mongoLead._id.toString();
        
        // NOTE: We deliberately do NOT merge status from MongoDB
        // Zoho status is authoritative
        
        return merged;
    } catch (error) {
        console.error('[DataLayer] Failed to merge local data:', error.message);
        return zohoLead;
    }
}

/**
 * Batch merge multiple leads with local data
 * Optimized for list views
 * 
 * @param {Array} zohoLeads - Array of leads from Zoho
 * @returns {Array} - Merged leads
 */
async function batchMergeWithLocalData(zohoLeads) {
    if (!useDatabase() || !zohoLeads?.length) {
        return zohoLeads;
    }
    
    try {
        const zohoIds = zohoLeads.map(l => l.id).filter(Boolean);
        const mongoLeads = await Lead.find({ zohoId: { $in: zohoIds } }).lean();
        const mongoMap = new Map(mongoLeads.map(l => [l.zohoId, l]));
        
        return zohoLeads.map(lead => {
            const mongoLead = mongoMap.get(lead.id);
            if (!mongoLead) return lead;
            
            const merged = { ...lead };
            
            for (const field of LOCAL_ONLY_FIELDS) {
                if (mongoLead[field] !== undefined && mongoLead[field] !== null) {
                    if (field === 'propertyId' || field === 'assignedTo') {
                        merged[field] = mongoLead[field].toString();
                    } else {
                        merged[field] = mongoLead[field];
                    }
                }
            }
            
            merged._mongoId = mongoLead._id.toString();
            
            return merged;
        });
    } catch (error) {
        console.error('[DataLayer] Batch merge failed:', error.message);
        return zohoLeads;
    }
}

/**
 * Create or get MongoDB record for a Zoho lead
 * Used when we need to store local data for a Zoho lead
 * 
 * @param {string} zohoId - Zoho lead ID
 * @param {Object} seedData - Initial data (name, phone for reference)
 */
async function ensureMongoRecord(zohoId, seedData = {}) {
    if (!useDatabase()) {
        return null;
    }
    
    const existing = await Lead.findOne({ zohoId });
    if (existing) {
        return existing;
    }
    
    // Create minimal record - we don't duplicate Zoho data
    const mongoLead = await Lead.create({
        zohoId,
        name: seedData.name || 'Unknown',
        phone: seedData.phone || '',
        email: seedData.email || '',
        createdAt: new Date(),
        source: seedData.source || 'Zoho'
    });
    
    console.log(`[DataLayer] Created MongoDB record for Zoho lead ${zohoId}`);
    
    return mongoLead;
}

/**
 * Sync pending status changes to Zoho
 * Run this periodically to catch up any failed syncs
 */
async function syncPendingToZoho() {
    if (!useDatabase()) {
        return { synced: 0 };
    }
    
    const pendingLeads = await Lead.find({ pendingZohoSync: true }).lean();
    
    let synced = 0;
    let failed = 0;
    
    for (const lead of pendingLeads) {
        if (!lead.pendingSyncQueue?.length) continue;
        
        for (const pending of lead.pendingSyncQueue) {
            try {
                const result = await zohoClient.updateLead(lead.zohoId, {
                    [pending.field]: pending.value
                });
                
                if (result.success) {
                    synced++;
                } else {
                    failed++;
                }
            } catch (error) {
                failed++;
                console.error(`[DataLayer] Sync failed for ${lead.zohoId}:`, error.message);
            }
        }
        
        // Clear pending queue
        await Lead.findByIdAndUpdate(lead._id, {
            pendingZohoSync: false,
            pendingSyncQueue: [],
            statusSyncedToZoho: true
        });
    }
    
    console.log(`[DataLayer] Sync complete: ${synced} synced, ${failed} failed`);
    
    return { synced, failed, total: pendingLeads.length };
}

/**
 * Get data ownership info for a field
 */
function getFieldOwnership(fieldName) {
    if (LOCAL_ONLY_FIELDS.includes(fieldName)) {
        return { owner: 'mongodb', syncToZoho: false };
    }
    if (ZOHO_FIELDS.includes(fieldName)) {
        return { owner: 'zoho', syncToZoho: true };
    }
    return { owner: 'unknown', syncToZoho: false };
}

module.exports = {
    // Core operations
    updateLeadStatus,
    updateLocalFields,
    mergeWithLocalData,
    batchMergeWithLocalData,
    ensureMongoRecord,
    syncPendingToZoho,
    
    // Field utilities
    getFieldOwnership,
    LOCAL_ONLY_FIELDS,
    ZOHO_FIELDS,
    FRONTEND_TO_ZOHO_MAP,
    ZOHO_TO_FRONTEND_MAP,
    
    // Helpers
    useDatabase
};
