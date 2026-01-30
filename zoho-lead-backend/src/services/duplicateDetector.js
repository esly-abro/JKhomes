/**
 * Duplicate Detector Service
 * Handles duplicate detection and lead creation/update in Zoho CRM
 */

const zohoClient = require('./zohoClient');
const logger = require('../utils/logger');

/**
 * Search for existing lead by email or phone
 * @param {object} leadData - Normalized lead data
 * @returns {object|null} - Existing lead if found
 */
async function findDuplicate(leadData) {
    try {
        const { Email, Phone } = leadData;

        // Search by email first
        if (Email) {
            const emailResults = await zohoClient.searchLeads('Email', Email);
            if (emailResults && emailResults.length > 0) {
                logger.debug('Duplicate found by email', { email: Email });
                return { lead: emailResults[0], matchedBy: 'email' };
            }
        }

        // Search by phone if no email match
        if (Phone) {
            const phoneResults = await zohoClient.searchLeads('Phone', Phone);
            if (phoneResults && phoneResults.length > 0) {
                logger.debug('Duplicate found by phone', { phone: Phone });
                return { lead: phoneResults[0], matchedBy: 'phone' };
            }
        }

        return null;
    } catch (error) {
        logger.warn('Duplicate detection failed', { error: error.message });
        // Don't fail the request - proceed with creation
        return null;
    }
}

/**
 * Process lead - create new or update existing
 * @param {object} leadData - Normalized lead data
 * @returns {object} - Result with action, leadId, message
 */
async function processLead(leadData) {
    try {
        // Check for duplicates
        const duplicate = await findDuplicate(leadData);

        if (duplicate) {
            // Update existing lead
            const updatedLead = await zohoClient.updateLead(duplicate.lead.id, leadData);

            logger.info('Lead updated successfully', {
                leadId: duplicate.lead.id,
                matchedBy: duplicate.matchedBy
            });

            return {
                action: 'updated',
                leadId: duplicate.lead.id,
                message: 'Existing lead updated successfully',
                matchedBy: duplicate.matchedBy
            };
        } else {
            // Create new lead
            const newLead = await zohoClient.createLead(leadData);

            logger.info('Lead created successfully', {
                leadId: newLead.id
            });

            // Schedule automated call (5 second delay)
            try {
                const callScheduler = require('./callScheduler');
                callScheduler.scheduleCall(leadData.Phone, {
                    leadId: newLead.id,
                    name: leadData.name
                }, { delay: 5000 });
            } catch (err) {
                logger.error('Failed to schedule automated call', { error: err.message });
            }

            return {
                action: 'created',
                leadId: newLead.id,
                message: 'New lead created successfully'
            };
        }
    } catch (error) {
        logger.error('Lead processing failed', { error: error.message });
        throw error;
    }
}

module.exports = {
    findDuplicate,
    processLead
};
