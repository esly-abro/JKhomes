/**
 * Zoho Integration Controller
 * Handles Zoho CRM connection, configuration, and testing
 */

const mongoose = require('mongoose');
const Organization = require('../models/organization.model');
const axios = require('axios');

// Zoho Data Centers
const ZOHO_DATA_CENTERS = {
    'in': {
        name: 'India',
        apiDomain: 'https://www.zohoapis.in',
        accountsUrl: 'https://accounts.zoho.in'
    },
    'com': {
        name: 'United States',
        apiDomain: 'https://www.zohoapis.com',
        accountsUrl: 'https://accounts.zoho.com'
    },
    'eu': {
        name: 'Europe',
        apiDomain: 'https://www.zohoapis.eu',
        accountsUrl: 'https://accounts.zoho.eu'
    },
    'au': {
        name: 'Australia',
        apiDomain: 'https://www.zohoapis.com.au',
        accountsUrl: 'https://accounts.zoho.com.au'
    },
    'jp': {
        name: 'Japan',
        apiDomain: 'https://www.zohoapis.jp',
        accountsUrl: 'https://accounts.zoho.jp'
    }
};

/**
 * Get Zoho CRM configuration for the user's organization
 */
async function getZohoConfig(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        console.log('[getZohoConfig] Looking for org with ownerId:', userId);
        
        let org = await Organization.findByUser(userId);
        console.log('[getZohoConfig] Found org:', org ? { id: org._id, ownerId: org.ownerId, isConnected: org.zohoCrm?.isConnected } : 'null');
        
        if (!org) {
            // Create default organization for user
            console.log('[getZohoConfig] Creating new org for user:', userId);
            org = new Organization({
                name: request.user.name || 'My Organization',
                ownerId: userId,
                zohoCrm: {}
            });
            await org.save();
        }

        // Return safe config (mask sensitive data)
        const config = {
            isConnected: org.zohoCrm?.isConnected || false,
            clientId: org.zohoCrm?.clientId ? maskString(org.zohoCrm.clientId) : '',
            hasClientSecret: !!org.zohoCrm?.clientSecret,
            hasRefreshToken: !!org.zohoCrm?.refreshToken,
            dataCenter: getDataCenterCode(org.zohoCrm?.apiDomain),
            lastSyncAt: org.zohoCrm?.lastSyncAt,
            lastError: org.zohoCrm?.lastError
        };

        return reply.send({
            success: true,
            data: config,
            dataCenters: Object.entries(ZOHO_DATA_CENTERS).map(([code, info]) => ({
                code,
                name: info.name
            }))
        });
    } catch (error) {
        console.error('Error getting Zoho config:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to retrieve Zoho configuration'
        });
    }
}

/**
 * Save Zoho CRM credentials
 */
async function saveZohoConfig(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const { clientId, clientSecret, refreshToken, dataCenter } = request.body;

        // Validate required fields
        if (!clientId || !clientSecret || !refreshToken) {
            return reply.code(400).send({
                success: false,
                error: 'Client ID, Client Secret, and Refresh Token are required'
            });
        }

        // Get data center URLs
        const dcInfo = ZOHO_DATA_CENTERS[dataCenter] || ZOHO_DATA_CENTERS['in'];

        // Find or create organization
        let org = await Organization.findByUser(userId);
        
        if (!org) {
            org = new Organization({
                name: request.user.name || 'My Organization',
                ownerId: userId
            });
        }

        // Update Zoho credentials
        org.zohoCrm = {
            clientId,
            clientSecret,
            refreshToken,
            apiDomain: dcInfo.apiDomain,
            accountsUrl: dcInfo.accountsUrl,
            isConnected: false,  // Will be set to true after successful test
            lastError: null
        };

        await org.save();

        return reply.send({
            success: true,
            message: 'Zoho credentials saved. Click "Test Connection" to verify.'
        });
    } catch (error) {
        console.error('Error saving Zoho config:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to save Zoho configuration'
        });
    }
}

/**
 * Test Zoho CRM connection
 */
async function testZohoConnection(request, reply) {
    try {
        const userId = request.user.id;
        
        // Allow testing with provided credentials or saved credentials
        let { clientId, clientSecret, refreshToken, dataCenter } = request.body || {};
        
        let org = await Organization.findByUser(userId);
        
        // If credentials provided, use them; otherwise use saved ones
        if (!clientId && org?.zohoCrm) {
            clientId = org.zohoCrm.clientId;
            clientSecret = org.zohoCrm.clientSecret;
            refreshToken = org.zohoCrm.refreshToken;
            dataCenter = getDataCenterCode(org.zohoCrm.apiDomain);
        }

        if (!clientId || !clientSecret || !refreshToken) {
            return reply.code(400).send({
                success: false,
                error: 'Zoho credentials not configured. Please save your credentials first.'
            });
        }

        const dcInfo = ZOHO_DATA_CENTERS[dataCenter] || ZOHO_DATA_CENTERS['in'];

        // Test by requesting an access token
        console.log('Testing Zoho connection with data center:', dataCenter, dcInfo.accountsUrl);
        
        let tokenResponse;
        try {
            tokenResponse = await axios.post(
                `${dcInfo.accountsUrl}/oauth/v2/token`,
                null,
                {
                    params: {
                        refresh_token: refreshToken,
                        client_id: clientId,
                        client_secret: clientSecret,
                        grant_type: 'refresh_token'
                    },
                    timeout: 15000
                }
            );
            console.log('Zoho token response:', JSON.stringify(tokenResponse.data));
        } catch (tokenError) {
            console.error('Zoho token error:', tokenError.response?.data || tokenError.message);
            const errorMsg = tokenError.response?.data?.error || tokenError.message;
            throw new Error(`Zoho authentication failed: ${errorMsg}`);
        }

        if (!tokenResponse.data.access_token) {
            console.error('No access token in response:', tokenResponse.data);
            throw new Error(`No access token received. Zoho response: ${JSON.stringify(tokenResponse.data)}`);
        }

        const accessToken = tokenResponse.data.access_token;
        const expiresIn = tokenResponse.data.expires_in || 3600;

        // Test API access by fetching organization info
        const orgResponse = await axios.get(
            `${dcInfo.apiDomain}/crm/v2/org`,
            {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`
                },
                timeout: 10000
            }
        );

        const zohoOrg = orgResponse.data.org?.[0] || {};

        // Update organization with successful connection
        if (org) {
            org.zohoCrm.isConnected = true;
            org.zohoCrm.lastSyncAt = new Date();
            org.zohoCrm.lastError = null;
            org.zohoCrm.accessToken = accessToken;
            org.zohoCrm.accessTokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));
            await org.save();
        }

        return reply.send({
            success: true,
            message: 'Successfully connected to Zoho CRM!',
            data: {
                organizationName: zohoOrg.company_name,
                country: zohoOrg.country,
                currency: zohoOrg.currency_symbol,
                timeZone: zohoOrg.time_zone,
                licenseType: zohoOrg.license_details?.edition
            }
        });
    } catch (error) {
        console.error('Zoho connection test failed:', error);

        // Update organization with error
        try {
            const org = await Organization.findByUser(request.user.id);
            if (org) {
                org.zohoCrm.isConnected = false;
                org.zohoCrm.lastError = error.response?.data?.error || error.message;
                await org.save();
            }
        } catch (e) {
            // Ignore save error
        }

        let errorMessage = 'Connection failed';
        let details = null;

        if (error.response?.data?.error) {
            errorMessage = error.response.data.error;
            if (errorMessage === 'invalid_code' || errorMessage === 'invalid_client') {
                errorMessage = 'Invalid credentials. Please check your Client ID, Client Secret, and Refresh Token.';
            }
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Could not reach Zoho servers. Please check your internet connection.';
        }

        return reply.send({
            success: false,
            error: errorMessage,
            details: error.response?.data
        });
    }
}

/**
 * Disconnect Zoho CRM
 */
async function disconnectZoho(request, reply) {
    try {
        const userId = request.user.id;
        
        const org = await Organization.findByUser(userId);
        
        if (!org) {
            return reply.code(404).send({
                success: false,
                error: 'Organization not found'
            });
        }

        // Clear Zoho credentials
        org.zohoCrm = {
            isConnected: false,
            apiDomain: 'https://www.zohoapis.in',
            accountsUrl: 'https://accounts.zoho.in'
        };
        
        await org.save();

        return reply.send({
            success: true,
            message: 'Zoho CRM disconnected successfully'
        });
    } catch (error) {
        console.error('Error disconnecting Zoho:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to disconnect Zoho CRM'
        });
    }
}

/**
 * Get available data centers
 */
async function getDataCenters(request, reply) {
    return reply.send({
        success: true,
        data: Object.entries(ZOHO_DATA_CENTERS).map(([code, info]) => ({
            code,
            name: info.name,
            apiDomain: info.apiDomain
        }))
    });
}

// Helper functions
function maskString(str) {
    if (!str || str.length < 8) return '••••••••';
    return str.substring(0, 8) + '•'.repeat(Math.min(str.length - 8, 20)) + '...';
}

function getDataCenterCode(apiDomain) {
    if (!apiDomain) return 'in';
    for (const [code, info] of Object.entries(ZOHO_DATA_CENTERS)) {
        if (apiDomain === info.apiDomain) return code;
    }
    return 'in';
}

module.exports = {
    getZohoConfig,
    saveZohoConfig,
    testZohoConnection,
    disconnectZoho,
    getDataCenters,
    ZOHO_DATA_CENTERS
};
