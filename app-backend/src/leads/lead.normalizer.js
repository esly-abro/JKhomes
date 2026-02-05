/**
 * Lead Normalizer Service
 * Transforms incoming lead data into standardized format for Zoho CRM
 * 
 * Single Responsibility: Data transformation and normalization only.
 * No database access, no external API calls.
 */

/**
 * Valid lead source values accepted by the system
 * Maps external source identifiers to Zoho CRM Lead_Source values
 */
const SOURCE_MAPPING = {
    // Direct matches
    'Website': 'Website',
    'LinkedIn Ads': 'LinkedIn',
    'Google Ads': 'Google AdWords',
    'Facebook': 'Facebook',
    'Referral': 'Employee Referral',
    'Conference': 'Conference',
    'WhatsApp': 'WhatsApp',
    
    // External platform identifiers
    'meta_ads': 'Facebook',
    'google_ads': 'Google AdWords',
    'organic': 'Website',
    'linkedin_ads': 'LinkedIn',
    'instagram': 'Facebook',
    'youtube': 'Google AdWords',
    
    // Fallback
    'default': 'Website'
};

/**
 * Valid sources for external validation
 */
const VALID_SOURCES = Object.keys(SOURCE_MAPPING).filter(k => k !== 'default');

/**
 * Normalize phone number to E.164 format
 * Handles Indian (+91), US (+1), and international formats
 * 
 * @param {string} phone - Raw phone number input
 * @returns {string|null} - Normalized E.164 phone number or null
 */
function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') {
        return null;
    }

    // Remove all non-digit characters except leading +
    let cleaned = phone.trim();
    const hasPlus = cleaned.startsWith('+');
    cleaned = cleaned.replace(/\D/g, '');

    if (!cleaned) {
        return null;
    }

    // Determine country code
    if (hasPlus) {
        // Already has country code indicator
        return `+${cleaned}`;
    }
    
    // Indian number detection (10 digits starting with 6-9)
    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
        return `+91${cleaned}`;
    }
    
    // US number detection (10 digits starting with 2-9)
    if (cleaned.length === 10 && /^[2-9]/.test(cleaned)) {
        return `+1${cleaned}`;
    }
    
    // Indian with country code but no +
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
        return `+${cleaned}`;
    }
    
    // US with country code but no +
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
    }

    // Default: add + prefix
    return `+${cleaned}`;
}

/**
 * Normalize email address
 * Lowercases and trims whitespace
 * 
 * @param {string} email - Raw email input
 * @returns {string|null} - Normalized email or null
 */
function normalizeEmail(email) {
    if (!email || typeof email !== 'string') {
        return null;
    }
    
    const normalized = email.trim().toLowerCase();
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
        return null;
    }
    
    return normalized;
}

/**
 * Map external source to Zoho CRM Lead_Source value
 * 
 * @param {string} source - External source identifier
 * @returns {string} - Zoho CRM Lead_Source value
 */
function mapSourceToZoho(source) {
    if (!source) {
        return SOURCE_MAPPING.default;
    }
    
    const normalized = source.trim();
    return SOURCE_MAPPING[normalized] || SOURCE_MAPPING.default;
}

/**
 * Normalize raw lead data to Zoho CRM format
 * 
 * @param {Object} rawData - Raw lead data from external source
 * @param {string} rawData.name - Lead name (required)
 * @param {string} [rawData.email] - Lead email
 * @param {string} [rawData.phone] - Lead phone
 * @param {string} [rawData.company] - Company name
 * @param {string} [rawData.source] - Lead source
 * @param {Object} [rawData.extra] - Additional fields
 * @returns {Object} - Normalized lead data for Zoho CRM
 * @throws {Error} - If required fields are missing
 */
function normalize(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        throw new Error('Lead data must be an object');
    }

    const name = rawData.name?.trim();
    if (!name) {
        throw new Error('Lead name is required');
    }

    const email = normalizeEmail(rawData.email);
    const phone = normalizePhone(rawData.phone);

    // At least one contact method required
    if (!email && !phone) {
        throw new Error('Either email or phone is required');
    }

    const normalized = {
        // Zoho CRM field names
        Last_Name: name,
        Email: email,
        Phone: phone,
        Company: rawData.company?.trim() || 'Not Provided',
        Lead_Source: mapSourceToZoho(rawData.source),
        
        // Internal tracking
        _original: {
            source: rawData.source,
            receivedAt: new Date().toISOString()
        }
    };

    // Merge extra fields (sanitized)
    if (rawData.extra && typeof rawData.extra === 'object') {
        const allowedExtraFields = [
            'Description', 'Industry', 'Annual_Revenue', 'No_of_Employees',
            'Street', 'City', 'State', 'Zip_Code', 'Country'
        ];
        
        for (const [key, value] of Object.entries(rawData.extra)) {
            if (allowedExtraFields.includes(key) && value != null) {
                normalized[key] = String(value).trim();
            }
        }
    }

    return normalized;
}

/**
 * Normalize lead data for frontend response
 * Maps Zoho CRM fields to frontend-friendly format
 * 
 * @param {Object} zohoLead - Lead data from Zoho CRM
 * @returns {Object} - Frontend-friendly lead object
 */
function normalizeForFrontend(zohoLead) {
    return {
        id: zohoLead.id,
        name: zohoLead.Last_Name || zohoLead.Full_Name || 'Unknown',
        email: zohoLead.Email || null,
        phone: zohoLead.Phone || zohoLead.Mobile || null,
        company: zohoLead.Company || null,
        source: zohoLead.Lead_Source || 'Website',
        status: zohoLead.Lead_Status || 'New',
        owner: zohoLead.Owner ? {
            id: zohoLead.Owner.id,
            name: zohoLead.Owner.name
        } : null,
        createdAt: zohoLead.Created_Time,
        updatedAt: zohoLead.Modified_Time
    };
}

/**
 * Get list of valid source values for API documentation
 * @returns {string[]} - Array of valid source identifiers
 */
function getValidSources() {
    return VALID_SOURCES;
}

module.exports = {
    normalize,
    normalizePhone,
    normalizeEmail,
    normalizeForFrontend,
    mapSourceToZoho,
    getValidSources,
    SOURCE_MAPPING
};
