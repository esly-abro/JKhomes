/**
 * Zoho CRM API Client
 * Handles all interactions with Zoho CRM API
 * 
 * Features:
 * - Automatic token refresh on 401 errors
 * - Retry logic for transient failures
 * - Proper error handling
 */

const axios = require('axios');
const config = require('../config/config');
const tokenManager = require('./tokenManager');
const logger = require('../utils/logger');

class ZohoClient {
    constructor() {
        this.baseURL = `${config.zoho.apiDomain}/crm/v2`;
        this.maxRetries = 2;  // Retry failed requests up to 2 times
    }

    /**
     * Make authenticated request to Zoho CRM API
     * Automatically handles 401 errors by refreshing token and retrying
     * 
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data (for POST/PUT)
     * @param {number} retryCount - Current retry attempt
     * @returns {Promise<Object>} API response data
     */
    async makeRequest(method, endpoint, data = null, retryCount = 0) {
        try {
            // Get valid access token
            const accessToken = await tokenManager.getAccessToken();

            const url = `${this.baseURL}${endpoint}`;

            logger.debug(`Zoho API Request: ${method} ${url}`, {
                data: data ? JSON.stringify(data).substring(0, 200) : null
            });

            const config = {
                method,
                url,
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000  // 15 second timeout
            };

            if (data && (method === 'POST' || method === 'PUT')) {
                config.data = data;
            }

            const response = await axios(config);

            logger.debug(`Zoho API Response: ${response.status}`, {
                data: JSON.stringify(response.data).substring(0, 200)
            });

            return response.data;

        } catch (error) {
            return this._handleRequestError(error, method, endpoint, data, retryCount);
        }
    }

    /**
     * Handle API request errors with retry logic
     * @private
     */
    async _handleRequestError(error, method, endpoint, data, retryCount) {
        const status = error.response?.status;
        const errorCode = error.response?.data?.code;
        const errorMessage = error.response?.data?.message || error.message;

        logger.error(`Zoho API Error: ${status} - ${errorMessage}`, {
            endpoint,
            errorCode,
            retryCount
        });

        // Handle 401 INVALID_TOKEN error
        if (status === 401 && errorCode === 'INVALID_TOKEN') {
            logger.warn('Token invalid, forcing refresh...');

            // Clear current token and refresh
            tokenManager.clearToken();
            await tokenManager.refreshAccessToken();

            // Retry the request once with new token
            if (retryCount === 0) {
                logger.info('Retrying request with refreshed token');
                return this.makeRequest(method, endpoint, data, retryCount + 1);
            }
        }

        // Handle rate limiting (if status is 429)
        if (status === 429) {
            const retryAfter = error.response?.headers['retry-after'] || 2;
            logger.warn(`Rate limited, retry after ${retryAfter} seconds`);

            if (retryCount < this.maxRetries) {
                await this._sleep(retryAfter * 1000);
                return this.makeRequest(method, endpoint, data, retryCount + 1);
            }
        }

        // Handle transient errors (500, 502, 503, 504)
        if (status >= 500 && retryCount < this.maxRetries) {
            logger.warn(`Server error ${status}, retrying...`);
            await this._sleep(1000 * (retryCount + 1));  // Exponential backoff
            return this.makeRequest(method, endpoint, data, retryCount + 1);
        }

        // Re-throw error if all retries exhausted or non-retryable error
        throw {
            status,
            code: errorCode,
            message: errorMessage,
            details: error.response?.data
        };
    }

    /**
     * Sleep utility for retry delays
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Search for leads by email in Zoho CRM
     * @param {string} email - Email to search
     * @returns {Promise<Object|null>} Lead record or null if not found
     */
    async searchLeadsByEmail(email) {
        try {
            // Zoho search criteria format
            const criteria = `(Email:equals:${email})`;
            const endpoint = `/Leads/search?criteria=${encodeURIComponent(criteria)}`;

            const response = await this.makeRequest('GET', endpoint);

            // Check if any leads found
            if (response.data && response.data.length > 0) {
                const lead = response.data[0];  // Return first match
                logger.info(`Found existing lead by email: ${email}`, {
                    leadId: lead.id
                });
                return lead;
            }

            logger.debug(`No lead found with email: ${email}`);
            return null;

        } catch (error) {
            // If error code is NO_DATA_FOUND, it means no match
            if (error.code === 'NO_DATA_FOUND') {
                logger.debug(`No lead found with email: ${email}`);
                return null;
            }
            throw error;
        }
    }

    /**
     * Search for leads by phone in Zoho CRM
     * @param {string} phone - Phone number to search
     * @returns {Promise<Object|null>} Lead record or null if not found
     */
    async searchLeadsByPhone(phone) {
        try {
            const criteria = `(Phone:equals:${phone})`;
            const endpoint = `/Leads/search?criteria=${encodeURIComponent(criteria)}`;

            const response = await this.makeRequest('GET', endpoint);

            if (response.data && response.data.length > 0) {
                const lead = response.data[0];
                logger.info(`Found existing lead by phone: ${phone}`, {
                    leadId: lead.id
                });
                return lead;
            }

            logger.debug(`No lead found with phone: ${phone}`);
            return null;

        } catch (error) {
            if (error.code === 'NO_DATA_FOUND') {
                logger.debug(`No lead found with phone: ${phone}`);
                return null;
            }
            throw error;
        }
    }

    /**
     * Create a new lead in Zoho CRM
     * @param {Object} leadData - Lead data in Zoho format
     * @returns {Promise<Object>} Created lead details
     */
    async createLead(leadData) {
        logger.info('Creating new lead in Zoho CRM', {
            email: leadData.Email,
            name: leadData.Last_Name
        });

        const payload = {
            data: [leadData],
            trigger: ['approval', 'workflow', 'blueprint']  // Trigger Zoho automation
        };

        const response = await this.makeRequest('POST', '/Leads', payload);

        if (response.data && response.data[0]) {
            const result = response.data[0];

            if (result.code === 'SUCCESS') {
                logger.info('Lead created successfully', {
                    leadId: result.details.id
                });
                return {
                    id: result.details.id,
                    status: 'created'
                };
            } else {
                throw new Error(`Failed to create lead: ${result.message}`);
            }
        }

        throw new Error('Unexpected response format from Zoho');
    }

    /**
     * Update an existing lead in Zoho CRM
     * @param {string} leadId - Zoho lead ID
     * @param {Object} leadData - Updated lead data
     * @returns {Promise<Object>} Update result
     */
    async updateLead(leadId, leadData) {
        logger.info(`Updating lead ${leadId} in Zoho CRM`, {
            email: leadData.Email
        });

        const payload = {
            data: [leadData],
            trigger: ['approval', 'workflow', 'blueprint']
        };

        const response = await this.makeRequest('PUT', `/Leads/${leadId}`, payload);

        if (response.data && response.data[0]) {
            const result = response.data[0];

            if (result.code === 'SUCCESS') {
                logger.info('Lead updated successfully', {
                    leadId
                });
                return {
                    id: leadId,
                    status: 'updated'
                };
            } else {
                throw new Error(`Failed to update lead: ${result.message}`);
            }
        }

        throw new Error('Unexpected response format from Zoho');
    }
}

// Export singleton instance
module.exports = new ZohoClient();
