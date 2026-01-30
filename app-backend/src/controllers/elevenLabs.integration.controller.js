/**
 * ElevenLabs Integration Controller
 * Handles ElevenLabs AI calling configuration per tenant
 */

const Organization = require('../models/organization.model');
const axios = require('axios');

/**
 * Get ElevenLabs configuration for the user's organization
 */
async function getElevenLabsConfig(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        
        let org = await Organization.findByUser(userId);
        
        if (!org) {
            return reply.send({
                success: true,
                data: {
                    isConnected: false,
                    hasApiKey: false,
                    agentId: '',
                    phoneNumberId: ''
                }
            });
        }

        // Return safe config (mask sensitive data)
        const config = {
            isConnected: org.elevenLabs?.isConnected || false,
            hasApiKey: !!org.elevenLabs?.apiKey,
            apiKey: org.elevenLabs?.apiKey ? maskString(org.elevenLabs.apiKey) : '',
            agentId: org.elevenLabs?.agentId || '',
            phoneNumberId: org.elevenLabs?.phoneNumberId || '',
            lastTestedAt: org.elevenLabs?.lastTestedAt,
            lastError: org.elevenLabs?.lastError
        };

        return reply.send({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('Error getting ElevenLabs config:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to retrieve ElevenLabs configuration'
        });
    }
}

/**
 * Save ElevenLabs configuration
 */
async function saveElevenLabsConfig(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const { apiKey, agentId, phoneNumberId } = request.body;

        // Validate required fields
        if (!apiKey || !agentId) {
            return reply.code(400).send({
                success: false,
                error: 'API Key and Agent ID are required'
            });
        }

        let org = await Organization.findByUser(userId);
        
        if (!org) {
            org = new Organization({
                name: request.user.name || 'My Organization',
                ownerId: userId,
                slug: `org-${Date.now()}`
            });
        }

        // Update ElevenLabs configuration
        org.elevenLabs = {
            apiKey: apiKey,
            agentId: agentId,
            phoneNumberId: phoneNumberId || '',
            isConnected: false, // Will be set to true after successful test
            lastError: null
        };

        await org.save();

        return reply.send({
            success: true,
            message: 'ElevenLabs configuration saved successfully'
        });
    } catch (error) {
        console.error('Error saving ElevenLabs config:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to save ElevenLabs configuration'
        });
    }
}

/**
 * Test ElevenLabs connection
 */
async function testElevenLabsConnection(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        
        let org = await Organization.findByUser(userId);
        
        if (!org || !org.elevenLabs?.apiKey) {
            return reply.code(400).send({
                success: false,
                error: 'ElevenLabs not configured. Please save your API key first.'
            });
        }

        const apiKey = org.elevenLabs.apiKey;
        const agentId = org.elevenLabs.agentId;

        // Test API key by fetching user info
        try {
            const userResponse = await axios.get(
                'https://api.elevenlabs.io/v1/user',
                {
                    headers: {
                        'xi-api-key': apiKey
                    },
                    timeout: 10000
                }
            );

            // If agent ID provided, verify it exists
            if (agentId) {
                try {
                    await axios.get(
                        `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
                        {
                            headers: {
                                'xi-api-key': apiKey
                            },
                            timeout: 10000
                        }
                    );
                } catch (agentError) {
                    org.elevenLabs.isConnected = false;
                    org.elevenLabs.lastError = 'Invalid Agent ID';
                    org.elevenLabs.lastTestedAt = new Date();
                    await org.save();
                    
                    return reply.code(400).send({
                        success: false,
                        error: 'API Key valid but Agent ID not found'
                    });
                }
            }

            // Update connection status
            org.elevenLabs.isConnected = true;
            org.elevenLabs.lastTestedAt = new Date();
            org.elevenLabs.lastError = null;
            await org.save();

            return reply.send({
                success: true,
                message: 'ElevenLabs connection successful!',
                data: {
                    userName: userResponse.data.first_name || 'User',
                    subscription: userResponse.data.subscription?.tier || 'Unknown'
                }
            });

        } catch (apiError) {
            const errorMsg = apiError.response?.data?.detail?.message || 
                           apiError.response?.data?.error || 
                           'Invalid API key';
            
            org.elevenLabs.isConnected = false;
            org.elevenLabs.lastError = errorMsg;
            org.elevenLabs.lastTestedAt = new Date();
            await org.save();

            return reply.code(400).send({
                success: false,
                error: errorMsg
            });
        }

    } catch (error) {
        console.error('Error testing ElevenLabs connection:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to test ElevenLabs connection'
        });
    }
}

/**
 * Disconnect ElevenLabs
 */
async function disconnectElevenLabs(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        
        const org = await Organization.findByUser(userId);
        
        if (org && org.elevenLabs) {
            org.elevenLabs = {
                apiKey: null,
                agentId: null,
                phoneNumberId: null,
                isConnected: false,
                lastError: null,
                lastTestedAt: null
            };
            await org.save();
        }

        return reply.send({
            success: true,
            message: 'ElevenLabs disconnected successfully'
        });
    } catch (error) {
        console.error('Error disconnecting ElevenLabs:', error);
        return reply.code(500).send({
            success: false,
            error: 'Failed to disconnect ElevenLabs'
        });
    }
}

/**
 * Get ElevenLabs credentials for making calls (internal use)
 */
async function getCredentialsForUser(userId) {
    const org = await Organization.findByUser(userId);
    
    if (!org || !org.elevenLabs?.isConnected) {
        return null;
    }

    return {
        apiKey: org.elevenLabs.apiKey,
        agentId: org.elevenLabs.agentId,
        phoneNumberId: org.elevenLabs.phoneNumberId
    };
}

/**
 * Mask sensitive strings for display
 */
function maskString(str, visibleChars = 8) {
    if (!str || str.length <= visibleChars) return str;
    return str.substring(0, visibleChars) + '•'.repeat(Math.min(12, str.length - visibleChars));
}

module.exports = {
    getElevenLabsConfig,
    saveElevenLabsConfig,
    testElevenLabsConnection,
    disconnectElevenLabs,
    getCredentialsForUser
};
