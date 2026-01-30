/**
 * Lead Normalizer Service
 * Transforms incoming lead data into Zoho CRM format
 */

const logger = require('../utils/logger');

/**
 * Valid source values
 */
const VALID_SOURCES = [
    'Website',
    'LinkedIn Ads',
    'Google Ads',
    'Facebook',
    'Referral',
    'Conference',
    'meta_ads',
    'google_ads',
    'organic'
];

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone number
 * @returns {string} - Normalized phone number
 */
function normalizePhone(phone) {
    if (!phone) return null;

    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Add + prefix if not present
    if (!cleaned.startsWith('+')) {
        // Assume Indian number if 10 digits
        if (cleaned.length === 10) {
            cleaned = '+91' + cleaned;
        } else {
            cleaned = '+' + cleaned;
        }
    }

    return cleaned;
}

/**
 * Normalize email address
 * @param {string} email - Raw email
 * @returns {string} - Normalized email
 */
function normalizeEmail(email) {
    if (!email) return null;
    return email.trim().toLowerCase();
}

/**
 * Normalize lead data to Zoho CRM format
 * @param {object} leadData - Raw lead data
 * @returns {object} - Normalized lead data for Zoho
 */
function normalize(leadData) {
    try {
        const normalized = {
            Last_Name: leadData.name || 'Unknown',
            Email: normalizeEmail(leadData.email),
            Phone: normalizePhone(leadData.phone),
            Company: leadData.company || 'Not Provided',
            Lead_Source: leadData.source || 'Website'
        };

        // Add any extra fields
        if (leadData.extra && typeof leadData.extra === 'object') {
            Object.assign(normalized, leadData.extra);
        }

        logger.debug('Lead normalized successfully', {
            source: leadData.source,
            hasEmail: !!normalized.Email,
            hasPhone: !!normalized.Phone
        });

        return normalized;
    } catch (error) {
        logger.error('Lead normalization failed', { error: error.message });
        throw new Error(`Normalization failed: ${error.message}`);
    }
}

/**
 * Get list of valid source values
 * @returns {array} - Valid sources
 */
function getValidSources() {
    return VALID_SOURCES;
}

module.exports = {
    normalize,
    normalizePhone,
    normalizeEmail,
    getValidSources
};
