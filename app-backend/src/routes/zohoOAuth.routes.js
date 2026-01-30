/**
 * Zoho OAuth Routes
 * Handles OAuth 2.0 flow for Zoho CRM integration
 * ONE APP MODEL: Your SaaS owns the Zoho app, customers just click "Connect"
 */

const config = require('../config/env');
const Organization = require('../models/organization.model');
const requireAuth = require('../middleware/requireAuth');
const axios = require('axios');
const mongoose = require('mongoose');

// YOUR Zoho App Credentials (configured once in .env)
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || 'http://localhost:4000/auth/zoho/callback';
const SCOPES = 'ZohoCRM.modules.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.ALL,ZohoCRM.org.ALL';

// Data centers
const DATA_CENTERS = {
    'in': { accountsUrl: 'https://accounts.zoho.in', apiDomain: 'https://www.zohoapis.in' },
    'com': { accountsUrl: 'https://accounts.zoho.com', apiDomain: 'https://www.zohoapis.com' },
    'eu': { accountsUrl: 'https://accounts.zoho.eu', apiDomain: 'https://www.zohoapis.eu' },
    'au': { accountsUrl: 'https://accounts.zoho.com.au', apiDomain: 'https://www.zohoapis.com.au' },
    'jp': { accountsUrl: 'https://accounts.zoho.jp', apiDomain: 'https://www.zohoapis.jp' }
};

/**
 * Register Zoho OAuth routes
 */
async function zohoOAuthRoutes(fastify, options) {
    
    /**
     * GET /connect
     * Initiates OAuth flow - redirects user to Zoho login
     * SIMPLE: Customer just clicks "Connect with Zoho" - no credentials needed!
     */
    fastify.get('/connect', {
        schema: {
            querystring: {
                type: 'object',
                properties: {
                    dc: { type: 'string', default: 'in' },
                    userId: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        const { dc: dataCenter = 'in', userId } = request.query;
        
        if (!ZOHO_CLIENT_ID) {
            return reply.code(500).send({
                success: false,
                error: 'Zoho integration not configured. Please contact support.'
            });
        }

        const dcConfig = DATA_CENTERS[dataCenter] || DATA_CENTERS['in'];
        
        // Build OAuth URL with YOUR app's Client ID
        const authUrl = new URL(`${dcConfig.accountsUrl}/oauth/v2/auth`);
        authUrl.searchParams.set('scope', SCOPES);
        authUrl.searchParams.set('client_id', ZOHO_CLIENT_ID);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
        authUrl.searchParams.set('prompt', 'consent');
        
        // Pass state with userId and dataCenter
        const state = Buffer.from(JSON.stringify({ userId, dataCenter })).toString('base64');
        authUrl.searchParams.set('state', state);

        console.log('Redirecting user to Zoho OAuth:', userId);
        
        return reply.redirect(authUrl.toString());
    });

    /**
     * GET /callback
     * OAuth callback - receives code and exchanges for tokens
     */
    fastify.get('/callback', async (request, reply) => {
        const { code, state, error, error_description } = request.query;

        // Handle OAuth errors
        if (error) {
            console.error('Zoho OAuth error:', error, error_description);
            return reply.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=integrations&zoho_error=${encodeURIComponent(error_description || error)}`);
        }

        if (!code) {
            return reply.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=integrations&zoho_error=No authorization code received`);
        }

        try {
            // Decode state
            let userId, dataCenter = 'in';
            if (state) {
                try {
                    const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
                    userId = decoded.userId;
                    dataCenter = decoded.dataCenter || 'in';
                } catch (e) {
                    console.warn('Could not decode state:', e);
                }
            }

            const dc = DATA_CENTERS[dataCenter] || DATA_CENTERS['in'];

            // Exchange code for tokens using YOUR app credentials
            console.log('Exchanging code for tokens...');
            const tokenResponse = await axios.post(
                `${dc.accountsUrl}/oauth/v2/token`,
                null,
                {
                    params: {
                        grant_type: 'authorization_code',
                        client_id: ZOHO_CLIENT_ID,
                        client_secret: ZOHO_CLIENT_SECRET,
                        redirect_uri: REDIRECT_URI,
                        code: code
                    },
                    timeout: 15000
                }
            );

            console.log('Token response received');
            const { access_token, refresh_token, expires_in } = tokenResponse.data;

            if (!refresh_token) {
                throw new Error('No refresh token received from Zoho');
            }

            // Get organization info from Zoho
            let zohoOrgName = 'Connected Organization';
            try {
                const orgResponse = await axios.get(
                    `${dc.apiDomain}/crm/v2/org`,
                    {
                        headers: { 'Authorization': `Zoho-oauthtoken ${access_token}` },
                        timeout: 10000
                    }
                );
                zohoOrgName = orgResponse.data.org?.[0]?.company_name || zohoOrgName;
            } catch (orgError) {
                console.warn('Could not fetch Zoho org info:', orgError.message);
            }

            // Save CUSTOMER'S credentials to database
            if (userId) {
                // Search with both string and ObjectId to handle mixed types
                const objectIdUserId = mongoose.Types.ObjectId.isValid(userId) 
                    ? new mongoose.Types.ObjectId(userId) 
                    : userId;
                
                let org = await Organization.findOne({ 
                    $or: [
                        { ownerId: userId },
                        { ownerId: objectIdUserId }
                    ]
                });
                console.log('[OAuth Callback] Looking for org with userId:', userId, '- Found:', org ? org._id : 'null');
                
                if (!org) {
                    // Generate unique slug from org name + timestamp
                    const baseSlug = zohoOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                    const uniqueSlug = `${baseSlug}-${Date.now()}`;
                    
                    org = new Organization({
                        name: zohoOrgName,
                        slug: uniqueSlug,
                        ownerId: objectIdUserId
                    });
                }

                // Store customer's tokens (they authorized YOUR app to access THEIR data)
                org.zohoCrm = {
                    clientId: ZOHO_CLIENT_ID,
                    clientSecret: ZOHO_CLIENT_SECRET,
                    refreshToken: refresh_token,
                    accessToken: access_token,
                    accessTokenExpiresAt: new Date(Date.now() + (expires_in * 1000)),
                    apiDomain: dc.apiDomain,
                    accountsUrl: dc.accountsUrl,
                    isConnected: true,
                    lastSyncAt: new Date(),
                    lastError: null
                };

                await org.save();
                console.log('Zoho credentials saved for user:', userId, '- Organization:', zohoOrgName);
            }

            // Redirect back to frontend with success
            return reply.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=integrations&zoho_connected=true&org=${encodeURIComponent(zohoOrgName)}`);

        } catch (err) {
            console.error('Zoho OAuth callback error:', err.response?.data || err.message);
            const errorMsg = err.response?.data?.error || err.message;
            return reply.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/settings?tab=integrations&zoho_error=${encodeURIComponent(errorMsg)}`);
        }
    });

    /**
     * GET /auth/zoho/status
     * Check if Zoho is connected for current user
     */
    fastify.get('/status', {
        preHandler: [requireAuth]
    }, async (request, reply) => {
        try {
            const userId = request.user.id || request.user._id;
            const org = await Organization.findOne({ ownerId: userId });

            if (!org || !org.zohoCrm?.isConnected) {
                return reply.send({
                    success: true,
                    connected: false
                });
            }

            return reply.send({
                success: true,
                connected: true,
                organizationName: org.name,
                connectedAt: org.zohoCrm.lastSyncAt,
                lastSyncAt: org.zohoCrm.lastSyncAt
            });
        } catch (error) {
            console.error('Error checking Zoho status:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to check Zoho status'
            });
        }
    });

    /**
     * DELETE /auth/zoho/disconnect
     * Disconnect Zoho CRM
     */
    fastify.delete('/disconnect', {
        preHandler: [requireAuth]
    }, async (request, reply) => {
        try {
            const userId = request.user.id || request.user._id;
            const org = await Organization.findOne({ ownerId: userId });

            if (org && org.zohoCrm) {
                org.zohoCrm.isConnected = false;
                org.zohoCrm.refreshToken = null;
                org.zohoCrm.accessToken = null;
                await org.save();
            }

            return reply.send({
                success: true,
                message: 'Zoho CRM disconnected'
            });
        } catch (error) {
            console.error('Error disconnecting Zoho:', error);
            return reply.code(500).send({
                success: false,
                error: 'Failed to disconnect Zoho'
            });
        }
    });
}

module.exports = zohoOAuthRoutes;
