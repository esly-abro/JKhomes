/**
 * Zoho CRM Client
 * Handles OAuth token management and API calls to Zoho CRM
 * 
 * Supports multi-tenant mode (credentials from database) with fallback to env vars
 */

const axios = require('axios');
const config = require('../config/env');
const { ExternalServiceError } = require('../utils/errors');

// In-memory token cache (keyed by organization ID for multi-tenant)
const tokenCacheMap = new Map();

// Default token cache for env-based credentials
let defaultTokenCache = {
    accessToken: null,
    expiresAt: null
};

/**
 * Get Zoho credentials - from organization (multi-tenant) or env vars (fallback)
 */
async function getCredentials(organizationId = null) {
    // If organizationId provided, try to get from database
    if (organizationId) {
        try {
            const Organization = require('../models/organization.model');
            const org = await Organization.findById(organizationId);
            if (org && org.isZohoConfigured()) {
                return {
                    ...org.getZohoCredentials(),
                    organizationId: org._id.toString(),
                    source: 'database'
                };
            }
        } catch (error) {
            console.warn('Failed to get org credentials, falling back to env:', error.message);
        }
    }

    // Fallback to environment variables
    return {
        clientId: config.zoho.clientId,
        clientSecret: config.zoho.clientSecret,
        refreshToken: config.zoho.refreshToken,
        apiDomain: config.zoho.apiDomain || 'https://www.zohoapis.in',
        accountsUrl: config.zoho.accountsUrl || 'https://accounts.zoho.in',
        source: 'env'
    };
}

/**
 * Get or create token cache for an organization
 */
function getTokenCache(organizationId) {
    if (!organizationId) return defaultTokenCache;
    
    if (!tokenCacheMap.has(organizationId)) {
        tokenCacheMap.set(organizationId, { accessToken: null, expiresAt: null });
    }
    return tokenCacheMap.get(organizationId);
}

/**
 * Get valid access token (with auto-refresh)
 */
async function getAccessToken(organizationId = null) {
    const cache = getTokenCache(organizationId);
    
    // Check if cached token is still valid
    if (cache.accessToken && cache.expiresAt > Date.now() + 60000) {
        return cache.accessToken;
    }

    // Refresh token
    return await refreshAccessToken(organizationId);
}

/**
 * Refresh access token using refresh_token
 */
async function refreshAccessToken(organizationId = null) {
    const credentials = await getCredentials(organizationId);
    const cache = getTokenCache(organizationId);
    
    try {
        const response = await axios.post(
            `${credentials.accountsUrl}/oauth/v2/token`,
            null,
            {
                params: {
                    refresh_token: credentials.refreshToken,
                    client_id: credentials.clientId,
                    client_secret: credentials.clientSecret,
                    grant_type: 'refresh_token'
                }
            }
        );

        const { access_token, expires_in } = response.data;

        // Cache token
        cache.accessToken = access_token;
        cache.expiresAt = Date.now() + (expires_in * 1000);

        // If using database credentials, also update the stored token
        if (credentials.source === 'database' && organizationId) {
            try {
                const Organization = require('../models/organization.model');
                await Organization.findByIdAndUpdate(organizationId, {
                    'zohoCrm.accessToken': access_token,
                    'zohoCrm.accessTokenExpiresAt': new Date(cache.expiresAt),
                    'zohoCrm.lastSyncAt': new Date(),
                    'zohoCrm.isConnected': true,
                    'zohoCrm.lastError': null
                });
            } catch (e) {
                console.warn('Failed to persist access token:', e.message);
            }
        }

        return access_token;
    } catch (error) {
        // Mark connection as failed if using database credentials
        if (credentials.source === 'database' && organizationId) {
            try {
                const Organization = require('../models/organization.model');
                await Organization.findByIdAndUpdate(organizationId, {
                    'zohoCrm.isConnected': false,
                    'zohoCrm.lastError': error.response?.data?.error || error.message
                });
            } catch (e) {
                // Ignore
            }
        }
        throw new ExternalServiceError('Zoho OAuth', error);
    }
}

/**
 * Make authenticated request to Zoho CRM
 */
async function makeRequest(method, endpoint, data = null, params = null, organizationId = null) {
    const credentials = await getCredentials(organizationId);
    const token = await getAccessToken(organizationId);

    try {
        const response = await axios({
            method,
            url: `${credentials.apiDomain}/crm/v2${endpoint}`,
            headers: {
                'Authorization': `Zoho-oauthtoken ${token}`,
                'Content-Type': 'application/json'
            },
            data,
            params
        });

        return response.data;
    } catch (error) {
        // Handle 401 - token might be invalid
        if (error.response?.status === 401) {
            // Clear cache and retry once
            const cache = getTokenCache(organizationId);
            cache.accessToken = null;
            cache.expiresAt = null;
            
            const newToken = await getAccessToken(organizationId);

            // Retry request
            const retryResponse = await axios({
                method,
                url: `${credentials.apiDomain}/crm/v2${endpoint}`,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${newToken}`,
                    'Content-Type': 'application/json'
                },
                data,
                params
            });

            return retryResponse.data;
        }

        throw new ExternalServiceError('Zoho CRM API', error);
    }
}

/**
 * Search leads by criteria
 */
async function searchLeads(criteria, page = 1, perPage = 200, organizationId = null) {
    const params = {
        page,
        per_page: perPage
    };

    if (criteria) {
        params.criteria = criteria;
    }

    return await makeRequest('GET', '/Leads/search', null, params, organizationId);
}

/**
 * Get all leads (with pagination)
 */
async function getLeads(page = 1, perPage = 200, organizationId = null) {
    const params = {
        page,
        per_page: perPage
    };

    return await makeRequest('GET', '/Leads', null, params, organizationId);
}

/**
 * Get single lead by ID
 */
async function getLead(leadId, organizationId = null) {
    return await makeRequest('GET', `/Leads/${leadId}`, null, null, organizationId);
}

/**
 * Get lead notes/activities
 */
async function getLeadNotes(leadId, organizationId = null) {
    try {
        return await makeRequest('GET', `/Leads/${leadId}/Notes`, null, null, organizationId);
    } catch (error) {
        // Notes might not exist, return empty array
        return { data: [] };
    }
}

/**
 * Create a note for a lead
 */
async function createLeadNote(leadId, noteData, organizationId = null) {
    try {
        const data = {
            data: [
                {
                    Parent_Id: {
                        id: leadId
                    },
                    Note_Title: noteData.Note_Title || 'Note',
                    Note_Content: noteData.Note_Content || '',
                    se_module: noteData.$se_module || 'Leads'
                }
            ]
        };
        
        const result = await makeRequest('POST', '/Notes', data, null, organizationId);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('Error creating lead note:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create a call activity for a lead
 */
async function createLeadCall(leadId, callData, organizationId = null) {
    try {
        const data = {
            data: [
                {
                    Call_Type: callData.Call_Type || 'Outbound',
                    Subject: callData.Subject || 'Call Activity',
                    Call_Start_Time: callData.Call_Start_Time,
                    Call_Duration: callData.Call_Duration || '0',
                    Call_Result: callData.Call_Result || 'Connected',
                    Description: callData.Description || '',
                    Who_Id: {
                        id: leadId
                    },
                    se_module: callData.$se_module || 'Leads'
                }
            ]
        };
        
        const result = await makeRequest('POST', '/Calls', data, null, organizationId);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('Error creating lead call:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create a task for a lead
 */
async function createTask(leadId, taskData, organizationId = null) {
    try {
        const data = {
            data: [
                {
                    Subject: taskData.Subject || 'Task',
                    Status: taskData.Status || 'Not Started',
                    Due_Date: taskData.Due_Date,
                    Description: taskData.Description || '',
                    What_Id: {
                        id: leadId
                    },
                    se_module: taskData.$se_module || 'Leads'
                }
            ]
        };
        
        const result = await makeRequest('POST', '/Tasks', data, null, organizationId);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('Error creating task:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Update a lead
 */
async function updateLead(leadId, updateData, organizationId = null) {
    try {
        const data = {
            data: [
                {
                    id: leadId,
                    ...updateData
                }
            ]
        };
        
        const result = await makeRequest('PUT', '/Leads', data, null, organizationId);
        return { success: true, data: result.data };
    } catch (error) {
        console.error('Error updating lead:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Create a new lead in Zoho CRM
 * 
 * @param {Object} leadData - Lead data with Zoho field names (Last_Name, Email, Phone, etc.)
 * @param {string} [organizationId] - Organization ID for multi-tenant
 * @returns {Promise<Object>} - Creation result with lead ID
 */
async function createLead(leadData, organizationId = null) {
    try {
        // Remove internal tracking fields that Zoho doesn't understand
        const zohoData = { ...leadData };
        delete zohoData._original;
        
        const data = {
            data: [zohoData]
        };
        
        const result = await makeRequest('POST', '/Leads', data, null, organizationId);
        
        if (result?.data?.[0]?.code === 'SUCCESS') {
            return { 
                success: true, 
                data: result.data,
                leadId: result.data[0].details.id
            };
        }
        
        // Handle Zoho-specific error codes
        const errorCode = result?.data?.[0]?.code;
        const errorMessage = result?.data?.[0]?.message || 'Unknown Zoho error';
        
        return { 
            success: false, 
            error: errorMessage,
            code: errorCode,
            data: result.data
        };
    } catch (error) {
        console.error('Error creating lead:', error.message);
        throw error;
    }
}

/**
 * Get organization info from Zoho
 */
async function getZohoOrganization(organizationId = null) {
    return await makeRequest('GET', '/org', null, null, organizationId);
}

/**
 * Clear token cache for an organization (useful when credentials change)
 */
function clearTokenCache(organizationId = null) {
    if (organizationId) {
        tokenCacheMap.delete(organizationId);
    } else {
        defaultTokenCache = { accessToken: null, expiresAt: null };
    }
}

module.exports = {
    getAccessToken,
    getCredentials,
    searchLeads,
    getLeads,
    getLead,
    getLeadNotes,
    createLead,
    createLeadNote,
    createLeadCall,
    createTask,
    updateLead,
    getZohoOrganization,
    clearTokenCache
};
