/**
 * Ingestion Service Client
 * Proxy for lead creation/updates through the existing ingestion service
 */

const axios = require('axios');
const config = require('../config/env');
const { ExternalServiceError } = require('../utils/errors');

/**
 * Create lead via ingestion service
 */
async function createLead(leadData) {
    const url = `${config.ingestion.url}/leads`;

    // Log outgoing request (DO NOT log API key value in production)
    console.log('[Ingestion Client] Creating lead:', {
        url,
        hasApiKey: !!config.ingestion.apiKey,
        apiKeyPrefix: config.ingestion.apiKey ? config.ingestion.apiKey.substring(0, 8) + '...' : 'NONE',
        leadData: {
            name: leadData.name,
            hasEmail: !!leadData.email,
            hasPhone: !!leadData.phone,
            source: leadData.source
        }
    });

    try {
        const response = await axios.post(
            url,
            leadData,
            {
                headers: {
                    'X-API-Key': config.ingestion.apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000  // 10 second timeout
            }
        );

        console.log('[Ingestion Client] Lead created successfully:', {
            status: response.status,
            leadId: response.data?.leadId,
            action: response.data?.action
        });

        return response.data;
    } catch (error) {
        // Detailed error logging
        console.error('[Ingestion Client] Request failed:', {
            url,
            errorCode: error.code,
            errorMessage: error.message,
            responseStatus: error.response?.status,
            responseData: error.response?.data,
            isTimeout: error.code === 'ECONNABORTED',
            isConnectionRefused: error.code === 'ECONNREFUSED',
            isNetworkError: !error.response
        });

        if (error.response) {
            // Forward error from ingestion service
            throw new ExternalServiceError('Ingestion Service', error);
        }
        // Network error (no response received)
        throw new ExternalServiceError('Ingestion Service', error);
    }
}

module.exports = {
    createLead
};
