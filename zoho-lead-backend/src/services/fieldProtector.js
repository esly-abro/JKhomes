/**
 * Field Protection Service
 * Defines which fields can be updated by API vs manual CRM edits
 * 
 * CRITICAL: Prevents API from overwriting important CRM data
 */

const logger = require('../utils/logger');

/**
 * Field Ownership Configuration
 * 
 * "system-owned" = Can be updated by API, CRM users should not edit manually
 * "human-owned" = Set by CRM users, API should NOT overwrite
 * "shared" = Can be updated by both (last write wins)
 */
const FIELD_OWNERSHIP = {
    // SYSTEM-OWNED FIELDS (API can update)
    systemOwned: [
        'Lead_Source',        // Marketing source
        'Description',        // Auto-generated from extra data
        'Email',              // Contact info from forms
        'Phone',              // Contact info from forms
        'Mobile',             // Same as Phone
        'First_Name',         // Derived from incoming name
        'Last_Name',          // Derived from incoming name
        'Company',            // From form or default
    ],

    // HUMAN-OWNED FIELDS (API must NOT overwrite if already set)
    humanOwned: [
        'Lead_Status',        // Sales stage managed by humans
        'Rating',             // Lead quality rating
        'Lead_Owner',         // Assigned sales rep
        'Annual_Revenue',     // Researched by sales team
        'No_of_Employees',    // Researched by sales team
        'Industry',           // Categorized by sales team
        'Skype_ID',           // Added manually
        'Twitter',            // Added manually
        'Secondary_Email',    // Added manually
        'Website',            // Added manually
        'Fax',                // Added manually
    ],

    // SHARED FIELDS (Can be updated by both, with caution)
    shared: [
        // Add fields that both API and humans can update
        // These will use "last write wins" strategy
    ],

    // NEVER TOUCH (System fields managed by Zoho)
    systemManaged: [
        'Created_Time',
        'Modified_Time',
        'Created_By',
        'Modified_By',
        'Id',
        'Owner',
    ]
};

class FieldProtector {
    /**
     * Filter update data to only include allowed fields
     * 
     * For CREATE: All system-owned fields allowed
     * For UPDATE: Only system-owned fields + empty human-owned fields
     * 
     * @param {Object} newData - New lead data from API
     * @param {Object} existingLead - Existing lead from Zoho (null for create)
     * @param {boolean} isUpdate - True if updating existing lead
     * @returns {Object} Filtered data safe to send to Zoho
     */
    filterUpdateData(newData, existingLead = null, isUpdate = false) {
        const safeData = {};

        for (const [field, value] of Object.entries(newData)) {
            // Skip null/undefined values
            if (value === null || value === undefined) {
                continue;
            }

            // Always allow system-owned fields
            if (FIELD_OWNERSHIP.systemOwned.includes(field)) {
                safeData[field] = value;
                continue;
            }

            // For shared fields, always allow
            if (FIELD_OWNERSHIP.shared.includes(field)) {
                safeData[field] = value;
                logger.debug(`Shared field allowed: ${field}`);
                continue;
            }

            // For human-owned fields
            if (FIELD_OWNERSHIP.humanOwned.includes(field)) {
                if (isUpdate && existingLead) {
                    // Only update if field is empty in CRM
                    const existingValue = existingLead[field];
                    if (!existingValue || existingValue === '' || existingValue === 'null') {
                        safeData[field] = value;
                        logger.info(`Human-owned field was empty, updating: ${field}`);
                    } else {
                        logger.warn(`PROTECTED: Skipping human-owned field: ${field} (already set in CRM)`);
                    }
                } else {
                    // For new leads, allow setting human-owned fields
                    safeData[field] = value;
                }
                continue;
            }

            // Never touch system-managed fields
            if (FIELD_OWNERSHIP.systemManaged.includes(field)) {
                logger.warn(`BLOCKED: Attempted to update system-managed field: ${field}`);
                continue;
            }

            // Unknown field - allow it but log
            logger.debug(`Unknown field (allowing): ${field}`);
            safeData[field] = value;
        }

        return safeData;
    }

    /**
     * Get field ownership info
     */
    getFieldOwnership(field) {
        if (FIELD_OWNERSHIP.systemOwned.includes(field)) return 'system-owned';
        if (FIELD_OWNERSHIP.humanOwned.includes(field)) return 'human-owned';
        if (FIELD_OWNERSHIP.shared.includes(field)) return 'shared';
        if (FIELD_OWNERSHIP.systemManaged.includes(field)) return 'system-managed';
        return 'unknown';
    }

    /**
     * Get all field ownership rules
     */
    getAllRules() {
        return FIELD_OWNERSHIP;
    }

    /**
     * Add a custom field to ownership rules
     */
    addCustomField(fieldName, ownership) {
        const validOwnership = ['systemOwned', 'humanOwned', 'shared'];

        if (!validOwnership.includes(ownership)) {
            throw new Error(`Invalid ownership: ${ownership}. Must be one of: ${validOwnership.join(', ')}`);
        }

        if (!FIELD_OWNERSHIP[ownership].includes(fieldName)) {
            FIELD_OWNERSHIP[ownership].push(fieldName);
            logger.info(`Added custom field: ${fieldName} as ${ownership}`);
        }
    }
}

// Export singleton
module.exports = new FieldProtector();
