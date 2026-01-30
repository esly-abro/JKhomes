/**
 * Zoho Field Mapper
 * Maps Zoho CRM fields to frontend-friendly format
 * CRITICAL: Frontend must NEVER see raw Zoho field names
 */

/**
 * Map Zoho lead to frontend format
 */
function mapZohoLeadToFrontend(zohoLead) {
    if (!zohoLead) return null;

    return {
        id: zohoLead.id,
        name: zohoLead.Last_Name || zohoLead.Full_Name || '',
        email: zohoLead.Email || '',
        phone: zohoLead.Phone || zohoLead.Mobile || '',
        company: zohoLead.Company || '',
        source: mapZohoSourceToFrontend(zohoLead.Lead_Source),
        status: zohoLead.Lead_Status || 'New',
        priority: mapPriority(zohoLead.Rating),
        value: parseFloat(zohoLead.Annual_Revenue) || 0,
        budget: zohoLead.Budget || '',
        timeline: zohoLead.Timeline__c || '', // Custom field
        tags: parseTags(zohoLead.Tag),
        owner: {
            id: zohoLead.Owner?.id || '',
            name: zohoLead.Owner?.name || 'Unassigned'
        },
        createdAt: zohoLead.Created_Time || new Date().toISOString(),
        lastActivity: zohoLead.Modified_Time || zohoLead.Created_Time || new Date().toISOString()
    };
}

/**
 * Map Zoho source to frontend source
 */
function mapZohoSourceToFrontend(zohoSource) {
    const sourceMap = {
        'Facebook': 'Facebook',
        'Website': 'Website',
        'Google AdWords': 'Google Ads',
        'LinkedIn': 'LinkedIn Ads',
        'Employee Referral': 'Referral',
        'WhatsApp': 'WhatsApp',
        'External Referral': 'Referral',
        'Conference': 'Conference'
    };

    return sourceMap[zohoSource] || zohoSource || 'Unknown';
}

/**
 * Map Zoho rating to priority
 */
function mapPriority(rating) {
    if (!rating) return 'medium';

    const ratingLower = rating.toLowerCase();
    if (ratingLower.includes('hot') || ratingLower === 'high') return 'high';
    if (ratingLower.includes('warm') || ratingLower === 'medium') return 'medium';
    if (ratingLower.includes('cold') || ratingLower === 'low') return 'low';

    return 'medium';
}

/**
 * Parse tags from Zoho format
 */
function parseTags(zohoTags) {
    if (!zohoTags) return [];
    if (Array.isArray(zohoTags)) return zohoTags.map(t => t.name || t);
    if (typeof zohoTags === 'string') return zohoTags.split(',').map(t => t.trim());
    return [];
}

/**
 * Map Zoho note/activity to frontend format
 */
function mapZohoNoteToActivity(zohoNote) {
    if (!zohoNote) return null;

    return {
        id: zohoNote.id,
        type: 'note', // TODO: Detect type from content
        description: zohoNote.Note_Content || zohoNote.Note_Title || '',
        timestamp: zohoNote.Created_Time || new Date().toISOString(),
        user: zohoNote.Owner?.name || 'System'
    };
}

/**
 * Map frontend lead data to Zoho format (for updates)
 */
function mapFrontendLeadToZoho(frontendLead) {
    const zohoLead = {};

    if (frontendLead.name) zohoLead.Last_Name = frontendLead.name;
    if (frontendLead.email) zohoLead.Email = frontendLead.email;
    if (frontendLead.phone) {
        zohoLead.Phone = frontendLead.phone;
        zohoLead.Mobile = frontendLead.phone;
    }
    if (frontendLead.company) zohoLead.Company = frontendLead.company;
    if (frontendLead.source) zohoLead.Lead_Source = mapFrontendSourceToZoho(frontendLead.source);
    if (frontendLead.status) zohoLead.Lead_Status = frontendLead.status;

    return zohoLead;
}

/**
 * Map frontend source to Zoho source
 */
function mapFrontendSourceToZoho(frontendSource) {
    const sourceMap = {
        'Facebook': 'Facebook',
        'Website': 'Website',
        'Google Ads': 'Google AdWords',
        'LinkedIn Ads': 'LinkedIn',
        'Referral': 'Employee Referral',
        'WhatsApp': 'WhatsApp',
        'Conference': 'Conference'
    };

    return sourceMap[frontendSource] || 'Website';
}

module.exports = {
    mapZohoLeadToFrontend,
    mapZohoNoteToActivity,
    mapFrontendLeadToZoho
};
