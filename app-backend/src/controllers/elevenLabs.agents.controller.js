/**
 * ElevenLabs Agent Management Controller
 * 
 * Architecture: ONE shared ElevenLabs account (platform owner's env API key).
 * Organizations create agents under this shared account.
 * Isolation is enforced via DB — each agent is mapped to an org.
 * Usage is tracked per org for billing.
 */

const axios = require('axios');
const config = require('../config/env');
const Organization = require('../models/organization.model');
const ElevenLabsAgent = require('../models/elevenLabsAgent.model');

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

/**
 * Get the PLATFORM's shared ElevenLabs API key (from .env)
 */
function getPlatformApiKey() {
    return config.elevenLabs?.apiKey || null;
}

/**
 * Get the user's organization ID
 */
async function getUserOrgId(userId) {
    const org = await Organization.findByUser(userId);
    return org ? org._id : null;
}

/**
 * GET /agents - List agents belonging to the user's organization
 */
async function listAgents(request, reply) {
    try {
        const apiKey = getPlatformApiKey();
        if (!apiKey) {
            return reply.code(500).send({
                success: false,
                error: 'ElevenLabs is not configured on the platform. Contact your administrator.'
            });
        }

        const userId = request.user.id || request.user._id;
        const orgId = await getUserOrgId(userId);
        if (!orgId) {
            return reply.code(400).send({ success: false, error: 'No organization found for your account' });
        }

        // Get agent IDs that belong to this org from our DB
        const orgAgents = await ElevenLabsAgent.findByOrg(orgId);

        if (orgAgents.length === 0) {
            return reply.send({ success: true, data: [], usage: { totalCalls: 0, totalMinutes: 0 } });
        }

        // Fetch full details from ElevenLabs for each agent
        const agentDetails = [];
        for (const dbAgent of orgAgents) {
            try {
                const response = await axios.get(
                    `${ELEVENLABS_BASE}/v1/convai/agents/${dbAgent.agentId}`,
                    { headers: { 'xi-api-key': apiKey } }
                );
                agentDetails.push({
                    ...response.data,
                    _usage: {
                        totalCalls: dbAgent.usage.totalCalls,
                        totalMinutes: dbAgent.usage.totalMinutes,
                        lastCallAt: dbAgent.usage.lastCallAt
                    }
                });
            } catch (err) {
                // Agent may have been deleted on ElevenLabs side — include stub
                if (err.response?.status === 404) {
                    agentDetails.push({
                        agent_id: dbAgent.agentId,
                        name: dbAgent.name || 'Deleted Agent',
                        _deleted: true,
                        _usage: {
                            totalCalls: dbAgent.usage.totalCalls,
                            totalMinutes: dbAgent.usage.totalMinutes,
                            lastCallAt: dbAgent.usage.lastCallAt
                        }
                    });
                }
            }
        }

        // Get monthly usage summary
        const monthKey = new Date().toISOString().slice(0, 7);
        const usageSummary = await ElevenLabsAgent.getOrgUsageSummary(orgId, monthKey);

        return reply.send({
            success: true,
            data: agentDetails,
            usage: {
                thisMonth: {
                    calls: usageSummary.totalCalls,
                    minutes: usageSummary.totalMinutes
                },
                agentCount: usageSummary.agentCount
            }
        });
    } catch (error) {
        console.error('Error listing agents:', error.response?.data || error.message);
        return reply.code(error.response?.status || 500).send({
            success: false,
            error: error.response?.data?.detail || 'Failed to list agents'
        });
    }
}

/**
 * POST /agents - Create a new agent (under shared ElevenLabs account, owned by org)
 */
async function createAgent(request, reply) {
    try {
        const apiKey = getPlatformApiKey();
        if (!apiKey) {
            return reply.code(500).send({
                success: false,
                error: 'ElevenLabs is not configured on the platform'
            });
        }

        const userId = request.user.id || request.user._id;
        const orgId = await getUserOrgId(userId);
        if (!orgId) {
            return reply.code(400).send({ success: false, error: 'No organization found' });
        }

        const { name, conversation_config } = request.body;

        // Create agent on ElevenLabs
        const payload = { conversation_config };
        if (name) payload.name = name;

        const response = await axios.post(
            `${ELEVENLABS_BASE}/v1/convai/agents/create`,
            payload,
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        const newAgentId = response.data.agent_id;

        // Map agent → org in our DB
        await ElevenLabsAgent.create({
            agentId: newAgentId,
            organizationId: orgId,
            createdBy: userId,
            name: name || ''
        });

        console.log(`🤖 Agent "${name}" created (${newAgentId}) for org ${orgId}`);

        return reply.send({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Error creating agent:', error.response?.data || error.message);
        return reply.code(error.response?.status || 500).send({
            success: false,
            error: error.response?.data?.detail || 'Failed to create agent'
        });
    }
}

/**
 * GET /agents/:agentId - Get agent details (only if owned by user's org)
 */
async function getAgent(request, reply) {
    try {
        const apiKey = getPlatformApiKey();
        if (!apiKey) {
            return reply.code(500).send({ success: false, error: 'ElevenLabs not configured' });
        }

        const userId = request.user.id || request.user._id;
        const orgId = await getUserOrgId(userId);
        const { agentId } = request.params;

        // Verify this agent belongs to user's org
        const dbAgent = await ElevenLabsAgent.findByAgentIdAndOrg(agentId, orgId);
        if (!dbAgent) {
            return reply.code(403).send({
                success: false,
                error: 'Agent not found or does not belong to your organization'
            });
        }

        const response = await axios.get(
            `${ELEVENLABS_BASE}/v1/convai/agents/${agentId}`,
            { headers: { 'xi-api-key': apiKey } }
        );

        return reply.send({
            success: true,
            data: {
                ...response.data,
                _usage: {
                    totalCalls: dbAgent.usage.totalCalls,
                    totalMinutes: dbAgent.usage.totalMinutes,
                    lastCallAt: dbAgent.usage.lastCallAt
                }
            }
        });
    } catch (error) {
        console.error('Error getting agent:', error.response?.data || error.message);
        return reply.code(error.response?.status || 500).send({
            success: false,
            error: error.response?.data?.detail || 'Failed to get agent'
        });
    }
}

/**
 * PATCH /agents/:agentId - Update agent (only if owned by user's org)
 */
async function updateAgent(request, reply) {
    try {
        const apiKey = getPlatformApiKey();
        if (!apiKey) {
            return reply.code(500).send({ success: false, error: 'ElevenLabs not configured' });
        }

        const userId = request.user.id || request.user._id;
        const orgId = await getUserOrgId(userId);
        const { agentId } = request.params;

        // Verify ownership
        const dbAgent = await ElevenLabsAgent.findByAgentIdAndOrg(agentId, orgId);
        if (!dbAgent) {
            return reply.code(403).send({
                success: false,
                error: 'Agent not found or does not belong to your organization'
            });
        }

        const response = await axios.patch(
            `${ELEVENLABS_BASE}/v1/convai/agents/${agentId}`,
            request.body,
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Update cached name if changed
        if (request.body.name) {
            dbAgent.name = request.body.name;
            await dbAgent.save();
        }

        return reply.send({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Error updating agent:', error.response?.data || error.message);
        return reply.code(error.response?.status || 500).send({
            success: false,
            error: error.response?.data?.detail || 'Failed to update agent'
        });
    }
}

/**
 * DELETE /agents/:agentId - Delete agent (only if owned by user's org)
 */
async function deleteAgent(request, reply) {
    try {
        const apiKey = getPlatformApiKey();
        if (!apiKey) {
            return reply.code(500).send({ success: false, error: 'ElevenLabs not configured' });
        }

        const userId = request.user.id || request.user._id;
        const orgId = await getUserOrgId(userId);
        const { agentId } = request.params;

        // Verify ownership
        const dbAgent = await ElevenLabsAgent.findByAgentIdAndOrg(agentId, orgId);
        if (!dbAgent) {
            return reply.code(403).send({
                success: false,
                error: 'Agent not found or does not belong to your organization'
            });
        }

        // Delete from ElevenLabs
        await axios.delete(
            `${ELEVENLABS_BASE}/v1/convai/agents/${agentId}`,
            { headers: { 'xi-api-key': apiKey } }
        );

        // Remove from our DB
        await ElevenLabsAgent.deleteOne({ agentId });

        console.log(`🗑️ Agent "${dbAgent.name}" (${agentId}) deleted by org ${orgId}`);

        return reply.send({
            success: true,
            message: 'Agent deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting agent:', error.response?.data || error.message);
        return reply.code(error.response?.status || 500).send({
            success: false,
            error: error.response?.data?.detail || 'Failed to delete agent'
        });
    }
}

/**
 * GET /voices - List available voices (shared, no org scoping needed)
 */
async function listVoices(request, reply) {
    try {
        const apiKey = getPlatformApiKey();
        if (!apiKey) {
            return reply.code(500).send({ success: false, error: 'ElevenLabs not configured' });
        }

        const response = await axios.get(`${ELEVENLABS_BASE}/v2/voices`, {
            headers: { 'xi-api-key': apiKey },
            params: { page_size: 100 }
        });

        const voices = (response.data.voices || []).map(v => ({
            voice_id: v.voice_id,
            name: v.name,
            category: v.category,
            labels: v.labels,
            preview_url: v.preview_url,
            description: v.description
        }));

        return reply.send({
            success: true,
            data: voices
        });
    } catch (error) {
        console.error('Error listing voices:', error.response?.data || error.message);
        return reply.code(error.response?.status || 500).send({
            success: false,
            error: error.response?.data?.detail || 'Failed to list voices'
        });
    }
}

/**
 * GET /usage - Get usage summary for current org
 */
async function getUsage(request, reply) {
    try {
        const userId = request.user.id || request.user._id;
        const orgId = await getUserOrgId(userId);
        if (!orgId) {
            return reply.code(400).send({ success: false, error: 'No organization found' });
        }

        const month = request.query.month; // optional: '2026-02'
        const monthKey = month || new Date().toISOString().slice(0, 7);

        const summary = await ElevenLabsAgent.getOrgUsageSummary(orgId, monthKey);

        // Also get all-time totals
        const allTime = await ElevenLabsAgent.getOrgUsageSummary(orgId, null);

        return reply.send({
            success: true,
            data: {
                currentMonth: {
                    month: monthKey,
                    calls: summary.totalCalls,
                    minutes: summary.totalMinutes
                },
                allTime: {
                    calls: allTime.totalCalls,
                    minutes: allTime.totalMinutes
                },
                agentCount: summary.agentCount,
                agents: summary.agents
            }
        });
    } catch (error) {
        console.error('Error getting usage:', error.message);
        return reply.code(500).send({
            success: false,
            error: 'Failed to get usage data'
        });
    }
}

module.exports = {
    listAgents,
    createAgent,
    getAgent,
    updateAgent,
    deleteAgent,
    listVoices,
    getUsage
};
