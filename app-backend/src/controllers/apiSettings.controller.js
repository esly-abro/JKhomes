/**
 * API Settings Controller
 * Handles encrypted storage and retrieval of API credentials
 */

const Organization = require('../models/organization.model');
const Settings = require('../models/settings.model');
const { validateEncryptionConfig, maskSensitiveValue } = require('../utils/encryption');

/**
 * Get encryption status (for admin dashboard)
 */
async function getEncryptionStatus(request, reply) {
    try {
        const status = validateEncryptionConfig();
        
        return reply.send({
            success: true,
            encryption: {
                isConfigured: status.isValid,
                message: status.message,
                algorithm: 'AES-256-CBC'
            }
        });
    } catch (error) {
        console.error('Error getting encryption status:', error);
        return reply.status(500).send({
            success: false,
            error: 'Failed to get encryption status'
        });
    }
}

/**
 * Get all API connection statuses for the current user
 */
async function getApiConnectionStatus(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        
        // Get organization for this user
        const organization = await Organization.findOne({ ownerId: userId });
        
        // Get user settings (for WhatsApp if not using organization model)
        const userSettings = await Settings.findOne({ userId });
        
        const connections = {
            zoho: {
                name: 'Zoho CRM',
                isConnected: organization?.zohoCrm?.isConnected || false,
                lastSync: organization?.zohoCrm?.lastSyncAt,
                lastError: organization?.zohoCrm?.lastError,
                hasCredentials: !!(organization?.zohoCrm?.clientId)
            },
            elevenLabs: {
                name: 'ElevenLabs AI',
                isConnected: organization?.elevenLabs?.isConnected || false,
                lastTested: organization?.elevenLabs?.lastTestedAt,
                lastError: organization?.elevenLabs?.lastError,
                hasCredentials: !!(organization?.elevenLabs?.apiKey)
            },
            twilio: {
                name: 'Twilio',
                isConnected: organization?.twilio?.isConnected || false,
                lastTested: organization?.twilio?.lastTestedAt,
                lastError: organization?.twilio?.lastError,
                hasCredentials: !!(organization?.twilio?.accountSid)
            },
            whatsapp: {
                name: 'WhatsApp Business',
                isConnected: organization?.whatsapp?.isConnected || userSettings?.whatsapp?.isConnected || false,
                lastTested: organization?.whatsapp?.lastTestedAt || userSettings?.whatsapp?.lastTestedAt,
                lastError: organization?.whatsapp?.lastError || userSettings?.whatsapp?.lastError,
                hasCredentials: !!(organization?.whatsapp?.accessToken || userSettings?.whatsapp?.accessToken),
                enabled: organization?.whatsapp?.enabled || userSettings?.whatsapp?.enabled || false
            }
        };
        
        return reply.send({
            success: true,
            connections,
            encryption: validateEncryptionConfig()
        });
    } catch (error) {
        console.error('Error getting API connection status:', error);
        return reply.status(500).send({
            success: false,
            error: 'Failed to get connection status'
        });
    }
}

/**
 * Get masked API credentials (for display in settings UI)
 */
async function getMaskedCredentials(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const { provider } = request.params;
        
        const organization = await Organization.findOne({ ownerId: userId });
        
        if (!organization) {
            return reply.status(404).send({
                success: false,
                error: 'Organization not found'
            });
        }
        
        let credentials = {};
        
        switch (provider) {
            case 'zoho':
                if (organization.zohoCrm) {
                    credentials = {
                        clientId: maskSensitiveValue(organization.zohoCrm.clientId),
                        clientSecret: maskSensitiveValue(organization.zohoCrm.clientSecret),
                        refreshToken: maskSensitiveValue(organization.zohoCrm.refreshToken),
                        apiDomain: organization.zohoCrm.apiDomain,
                        isConnected: organization.zohoCrm.isConnected
                    };
                }
                break;
                
            case 'elevenlabs':
                if (organization.elevenLabs) {
                    credentials = {
                        apiKey: maskSensitiveValue(organization.elevenLabs.apiKey),
                        agentId: organization.elevenLabs.agentId || '',
                        phoneNumberId: organization.elevenLabs.phoneNumberId || '',
                        isConnected: organization.elevenLabs.isConnected
                    };
                }
                break;
                
            case 'twilio':
                if (organization.twilio) {
                    credentials = {
                        accountSid: maskSensitiveValue(organization.twilio.accountSid),
                        authToken: maskSensitiveValue(organization.twilio.authToken),
                        phoneNumber: organization.twilio.phoneNumber || '',
                        isConnected: organization.twilio.isConnected
                    };
                }
                break;
                
            case 'whatsapp':
                if (organization.whatsapp) {
                    credentials = {
                        provider: organization.whatsapp.provider || 'meta',
                        // Meta fields
                        accessToken: maskSensitiveValue(organization.whatsapp.accessToken),
                        phoneNumberId: organization.whatsapp.phoneNumberId || '',
                        businessAccountId: organization.whatsapp.businessAccountId || '',
                        appId: organization.whatsapp.appId || '',
                        // Twilio fields
                        twilioAccountSid: maskSensitiveValue(organization.whatsapp.twilioAccountSid),
                        twilioAuthToken: maskSensitiveValue(organization.whatsapp.twilioAuthToken),
                        twilioWhatsappNumber: organization.whatsapp.twilioWhatsappNumber || '',
                        // Status
                        isConnected: organization.whatsapp.isConnected,
                        enabled: organization.whatsapp.enabled
                    };
                }
                break;
                
            default:
                return reply.status(400).send({
                    success: false,
                    error: `Unknown provider: ${provider}`
                });
        }
        
        return reply.send({
            success: true,
            provider,
            credentials
        });
    } catch (error) {
        console.error('Error getting masked credentials:', error);
        return reply.status(500).send({
            success: false,
            error: error.message || 'Failed to get credentials'
        });
    }
}

/**
 * Save Twilio credentials (encrypted)
 */
async function saveTwilioCredentials(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const { accountSid, authToken, phoneNumber, twimlAppSid, apiKeySid, apiKeySecret } = request.body;
        
        if (!accountSid || !authToken) {
            return reply.status(400).send({
                success: false,
                error: 'Account SID and Auth Token are required'
            });
        }
        
        // Find or create organization
        let organization = await Organization.findOne({ ownerId: userId });
        
        if (!organization) {
            organization = new Organization({
                name: `Org-${userId}`,
                ownerId: userId
            });
        }
        
        // Update Twilio credentials (automatically encrypted via schema)
        organization.twilio = {
            accountSid,
            authToken,
            phoneNumber: phoneNumber || '',
            twimlAppSid: twimlAppSid || '',
            apiKeySid: apiKeySid || '',
            apiKeySecret: apiKeySecret || '',
            isConnected: false, // Will be set to true after test
            lastTestedAt: null,
            lastError: null
        };
        
        await organization.save();
        
        return reply.send({
            success: true,
            message: 'Twilio credentials saved (encrypted)'
        });
    } catch (error) {
        console.error('Error saving Twilio credentials:', error);
        return reply.status(500).send({
            success: false,
            error: 'Failed to save credentials'
        });
    }
}

/**
 * Save WhatsApp credentials with provider selection (Meta or Twilio)
 */
async function saveWhatsappCredentials(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const {
            provider,  // 'meta' or 'twilio'
            // Meta fields
            accessToken, phoneNumberId, businessAccountId, appId, appSecret, verifyToken, webhookUrl,
            // Twilio fields
            twilioAccountSid, twilioAuthToken, twilioWhatsappNumber
        } = request.body;

        const selectedProvider = provider || 'meta';

        // Validate based on provider
        if (selectedProvider === 'twilio') {
            if (!twilioAccountSid || !twilioAuthToken) {
                return reply.status(400).send({
                    success: false,
                    error: 'Twilio Account SID and Auth Token are required'
                });
            }
        } else {
            if (!accessToken) {
                return reply.status(400).send({
                    success: false,
                    error: 'Meta Access Token is required'
                });
            }
        }

        // Find or create organization
        let organization = await Organization.findOne({ ownerId: userId });
        if (!organization) {
            organization = new Organization({ name: `Org-${userId}`, ownerId: userId });
        }

        if (selectedProvider === 'twilio') {
            // Save Twilio WhatsApp credentials
            organization.whatsapp = {
                provider: 'twilio',
                twilioAccountSid,
                twilioAuthToken,
                twilioWhatsappNumber: twilioWhatsappNumber || '',
                // Preserve existing Meta fields if any
                accessToken: organization.whatsapp?.accessToken || '',
                phoneNumberId: organization.whatsapp?.phoneNumberId || '',
                businessAccountId: organization.whatsapp?.businessAccountId || '',
                appId: organization.whatsapp?.appId || '',
                appSecret: organization.whatsapp?.appSecret || '',
                verifyToken: organization.whatsapp?.verifyToken || '',
                webhookUrl: organization.whatsapp?.webhookUrl || '',
                enabled: true,
                isConnected: true,
                lastTestedAt: new Date(),
                lastError: null
            };

            await organization.save();

            return reply.send({
                success: true,
                message: 'Twilio WhatsApp credentials saved (encrypted)',
                provider: 'twilio'
            });
        } else {
            // Save Meta WhatsApp credentials (existing logic with auto-discovery)
            let resolvedPhoneNumberId = phoneNumberId || '';
            let resolvedBusinessAccountId = businessAccountId || '';
            let discoveredPhoneDisplay = '';
            let discoveredBusinessName = '';

            if (!resolvedPhoneNumberId || !resolvedBusinessAccountId) {
                if (!resolvedPhoneNumberId) resolvedPhoneNumberId = organization.whatsapp?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
                if (!resolvedBusinessAccountId) resolvedBusinessAccountId = organization.whatsapp?.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';

                // Try Meta API discovery if still missing
                if ((!resolvedPhoneNumberId || !resolvedBusinessAccountId) && accessToken) {
                    try {
                        const axios = require('axios');
                        if (resolvedBusinessAccountId && !resolvedPhoneNumberId) {
                            const phoneRes = await axios.get(
                                `https://graph.facebook.com/v18.0/${resolvedBusinessAccountId}/phone_numbers`,
                                { headers: { Authorization: `Bearer ${accessToken}` }, params: { fields: 'id,display_phone_number,verified_name' } }
                            );
                            if (phoneRes.data?.data?.length > 0) {
                                resolvedPhoneNumberId = phoneRes.data.data[0].id;
                                discoveredPhoneDisplay = phoneRes.data.data[0].display_phone_number || '';
                            }
                        }
                    } catch (discoverErr) {
                        console.warn('⚠️ Could not auto-discover WhatsApp IDs:', discoverErr.response?.data?.error?.message || discoverErr.message);
                    }
                }

                // Get display names for discovered IDs
                if (resolvedBusinessAccountId) {
                    try {
                        const axios = require('axios');
                        const wabaInfo = await axios.get(
                            `https://graph.facebook.com/v18.0/${resolvedBusinessAccountId}`,
                            { headers: { Authorization: `Bearer ${accessToken}` }, params: { fields: 'id,name' } }
                        );
                        discoveredBusinessName = wabaInfo.data?.name || '';
                    } catch (e) { /* ignore */ }
                }
                if (resolvedPhoneNumberId && !discoveredPhoneDisplay) {
                    try {
                        const axios = require('axios');
                        const phoneInfo = await axios.get(
                            `https://graph.facebook.com/v18.0/${resolvedPhoneNumberId}`,
                            { headers: { Authorization: `Bearer ${accessToken}` }, params: { fields: 'display_phone_number,verified_name' } }
                        );
                        discoveredPhoneDisplay = phoneInfo.data?.display_phone_number || '';
                        discoveredBusinessName = discoveredBusinessName || phoneInfo.data?.verified_name || '';
                    } catch (e) { /* ignore */ }
                }
            }

            if (!resolvedPhoneNumberId) {
                return reply.status(400).send({
                    success: false,
                    error: 'Could not determine Phone Number ID. Please provide it manually or check your access token permissions.'
                });
            }

            organization.whatsapp = {
                provider: 'meta',
                accessToken,
                phoneNumberId: resolvedPhoneNumberId,
                businessAccountId: resolvedBusinessAccountId,
                appId: appId || '',
                appSecret: appSecret || '',
                verifyToken: verifyToken || '',
                webhookUrl: webhookUrl || '',
                // Preserve existing Twilio fields if any
                twilioAccountSid: organization.whatsapp?.twilioAccountSid || '',
                twilioAuthToken: organization.whatsapp?.twilioAuthToken || '',
                twilioWhatsappNumber: organization.whatsapp?.twilioWhatsappNumber || '',
                isConnected: false,
                enabled: true,
                lastTestedAt: null,
                lastError: null
            };

            await organization.save();

            return reply.send({
                success: true,
                message: 'Meta WhatsApp credentials saved (encrypted)',
                provider: 'meta',
                discovered: {
                    phoneNumberId: resolvedPhoneNumberId,
                    businessAccountId: resolvedBusinessAccountId,
                    phoneDisplay: discoveredPhoneDisplay,
                    businessName: discoveredBusinessName
                }
            });
        }
    } catch (error) {
        console.error('Error saving WhatsApp credentials:', error);
        return reply.status(500).send({
            success: false,
            error: error.message || 'Failed to save credentials',
            details: error.errors ? Object.keys(error.errors).map(k => `${k}: ${error.errors[k].message}`) : undefined
        });
    }
}

/**
 * Test Twilio connection
 */
async function testTwilioConnection(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const organization = await Organization.findOne({ ownerId: userId });
        
        if (!organization?.twilio?.accountSid) {
            return reply.status(400).send({
                success: false,
                error: 'Twilio credentials not configured'
            });
        }
        
        // Credentials are automatically decrypted via schema getters
        const { accountSid, authToken } = organization.twilio;
        
        // Test Twilio API
        const twilio = require('twilio')(accountSid, authToken);
        const account = await twilio.api.accounts(accountSid).fetch();
        
        // Update connection status
        organization.twilio.isConnected = true;
        organization.twilio.lastTestedAt = new Date();
        organization.twilio.lastError = null;
        await organization.save();
        
        return reply.send({
            success: true,
            message: 'Twilio connection successful',
            account: {
                friendlyName: account.friendlyName,
                status: account.status,
                type: account.type
            }
        });
    } catch (error) {
        console.error('Error testing Twilio connection:', error);
        
        // Update error status
        const userId = request.user.id || request.user._id;
        const organization = await Organization.findOne({ ownerId: userId });
        if (organization?.twilio) {
            organization.twilio.isConnected = false;
            organization.twilio.lastTestedAt = new Date();
            organization.twilio.lastError = error.message;
            await organization.save();
        }
        
        return reply.status(400).send({
            success: false,
            error: `Twilio connection failed: ${error.message}`
        });
    }
}

/**
 * Test WhatsApp connection — routes to correct provider (Meta or Twilio)
 */
async function testWhatsappConnection(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const organization = await Organization.findOne({ ownerId: userId });

        if (!organization?.whatsapp) {
            return reply.status(400).send({
                success: false,
                error: 'WhatsApp credentials not configured'
            });
        }

        const provider = organization.whatsapp.provider || 'meta';

        if (provider === 'twilio') {
            // Test Twilio WhatsApp
            const { twilioAccountSid, twilioAuthToken } = organization.whatsapp;
            if (!twilioAccountSid || !twilioAuthToken) {
                return reply.status(400).send({
                    success: false,
                    error: 'Twilio WhatsApp credentials not configured'
                });
            }

            const twilio = require('twilio')(twilioAccountSid, twilioAuthToken);
            const account = await twilio.api.accounts(twilioAccountSid).fetch();

            organization.whatsapp.isConnected = true;
            organization.whatsapp.lastTestedAt = new Date();
            organization.whatsapp.lastError = null;
            await organization.save();

            return reply.send({
                success: true,
                message: 'Twilio WhatsApp connection successful',
                provider: 'twilio',
                phoneInfo: {
                    id: twilioAccountSid,
                    displayPhoneNumber: organization.whatsapp.twilioWhatsappNumber || 'Not set',
                    verifiedName: account.friendlyName
                }
            });
        } else {
            // Test Meta WhatsApp
            const { accessToken, phoneNumberId } = organization.whatsapp;
            if (!accessToken) {
                return reply.status(400).send({
                    success: false,
                    error: 'Meta WhatsApp credentials not configured'
                });
            }

            const axios = require('axios');
            const response = await axios.get(
                `https://graph.facebook.com/v18.0/${phoneNumberId}`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: { fields: 'id,display_phone_number,verified_name' }
                }
            );

            organization.whatsapp.isConnected = true;
            organization.whatsapp.lastTestedAt = new Date();
            organization.whatsapp.lastError = null;
            await organization.save();

            return reply.send({
                success: true,
                message: 'Meta WhatsApp connection successful',
                provider: 'meta',
                phoneInfo: {
                    id: response.data.id,
                    displayPhoneNumber: response.data.display_phone_number,
                    verifiedName: response.data.verified_name
                }
            });
        }
    } catch (error) {
        console.error('Error testing WhatsApp connection:', error.response?.data || error.message);

        // Update error status
        const userId = request.user.id || request.user._id;
        const organization = await Organization.findOne({ ownerId: userId });
        if (organization?.whatsapp) {
            organization.whatsapp.isConnected = false;
            organization.whatsapp.lastTestedAt = new Date();
            organization.whatsapp.lastError = error.response?.data?.error?.message || error.message;
            await organization.save();
        }

        return reply.status(400).send({
            success: false,
            error: `WhatsApp connection failed: ${error.response?.data?.error?.message || error.message}`
        });
    }
}

/**
 * Delete API credentials for a provider
 */
async function deleteCredentials(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const { provider } = request.params;
        
        const organization = await Organization.findOne({ ownerId: userId });
        
        if (!organization) {
            return reply.status(404).send({
                success: false,
                error: 'Organization not found'
            });
        }
        
        switch (provider) {
            case 'zoho':
                organization.zohoCrm = undefined;
                break;
            case 'elevenlabs':
                organization.elevenLabs = undefined;
                break;
            case 'twilio':
                organization.twilio = undefined;
                break;
            case 'whatsapp':
                organization.whatsapp = undefined;
                break;
            default:
                return reply.status(400).send({
                    success: false,
                    error: `Unknown provider: ${provider}`
                });
        }
        
        await organization.save();
        
        return reply.send({
            success: true,
            message: `${provider} credentials deleted`
        });
    } catch (error) {
        console.error('Error deleting credentials:', error);
        return reply.status(500).send({
            success: false,
            error: 'Failed to delete credentials'
        });
    }
}

module.exports = {
    getEncryptionStatus,
    getApiConnectionStatus,
    getMaskedCredentials,
    saveTwilioCredentials,
    saveWhatsappCredentials,
    testTwilioConnection,
    testWhatsappConnection,
    deleteCredentials
};
