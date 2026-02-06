/**
 * 
 * Lead Assignment Service
 * Handles automatic lead assignment based on CRM settings
 */

const User = require('../models/User');
const Settings = require('../models/settings.model');
const logger = require('../utils/logger');

class LeadAssignmentService {
    /**
     * Get the next agent for lead assignment based on the assignment method
     * @param {string} ownerUserId - The owner's user ID (to get their settings)
     * @param {Object} leadData - The lead data (for location-based assignment)
     * @returns {Promise<Object|null>} The assigned agent or null for manual assignment
     */
    async getNextAgent(ownerUserId, leadData = {}) {
        try {
            // Get CRM settings for this owner
            const settings = await Settings.findOne({ userId: ownerUserId });
            const assignmentMethod = settings?.crm?.assignmentMethod || 'round_robin';

            logger.info('Getting next agent for assignment', { 
                ownerUserId, 
                assignmentMethod,
                leadLocation: leadData.preferredLocation || leadData.location
            });

            switch (assignmentMethod) {
                case 'round_robin':
                    return await this.roundRobinAssignment(ownerUserId);
                
                case 'by_location':
                    return await this.locationBasedAssignment(ownerUserId, leadData);
                
                case 'manual':
                    logger.info('Manual assignment mode - no auto-assignment');
                    return null;
                
                default:
                    logger.warn('Unknown assignment method, falling back to round robin', { assignmentMethod });
                    return await this.roundRobinAssignment(ownerUserId);
            }
        } catch (error) {
            logger.error('Error in lead assignment', { error: error.message });
            throw error;
        }
    }

    /**
     * Round Robin Assignment
     * Assigns leads equally among all active agents
     */
    async roundRobinAssignment(ownerUserId) {
        // Get all active, approved agents (excluding owner and admin)
        const agents = await User.find({
            isActive: true,
            approvalStatus: 'approved',
            role: { $in: ['agent', 'manager'] }
        }).sort({ leadAssignmentCount: 1, createdAt: 1 }); // Sort by least leads first

        if (agents.length === 0) {
            logger.warn('No agents available for round-robin assignment');
            return null;
        }

        // Get the agent with the least assignments
        const selectedAgent = agents[0];

        // Increment the assignment count
        await User.findByIdAndUpdate(selectedAgent._id, {
            $inc: { leadAssignmentCount: 1 }
        });

        logger.info('Round-robin assignment', { 
            agentId: selectedAgent._id, 
            agentName: selectedAgent.name,
            previousCount: selectedAgent.leadAssignmentCount
        });

        return selectedAgent;
    }

    /**
     * Location-Based Assignment
     * Assigns leads to agents based on their assigned locations
     */
    async locationBasedAssignment(ownerUserId, leadData) {
        const leadLocation = (leadData.preferredLocation || leadData.location || '').toLowerCase().trim();

        if (!leadLocation) {
            logger.warn('No location in lead data, falling back to round-robin');
            return await this.roundRobinAssignment(ownerUserId);
        }

        // Find agents with matching location
        const agents = await User.find({
            isActive: true,
            approvalStatus: 'approved',
            role: { $in: ['agent', 'manager'] }
        });

        // Find agents whose assigned locations match the lead location
        const matchingAgents = agents.filter(agent => {
            if (!agent.assignedLocations || agent.assignedLocations.length === 0) {
                return false;
            }
            return agent.assignedLocations.some(loc => {
                const normalizedLoc = loc.toLowerCase().trim();
                // Check for exact match or partial match
                return normalizedLoc === leadLocation || 
                       leadLocation.includes(normalizedLoc) || 
                       normalizedLoc.includes(leadLocation);
            });
        });

        if (matchingAgents.length === 0) {
            logger.warn('No agents found for location, falling back to round-robin', { leadLocation });
            return await this.roundRobinAssignment(ownerUserId);
        }

        // If multiple agents match, use round-robin among them
        const selectedAgent = matchingAgents.reduce((min, agent) => 
            (agent.leadAssignmentCount || 0) < (min.leadAssignmentCount || 0) ? agent : min
        , matchingAgents[0]);

        // Increment the assignment count
        await User.findByIdAndUpdate(selectedAgent._id, {
            $inc: { leadAssignmentCount: 1 }
        });

        logger.info('Location-based assignment', { 
            agentId: selectedAgent._id,
            agentName: selectedAgent.name, 
            leadLocation,
            agentLocations: selectedAgent.assignedLocations
        });

        return selectedAgent;
    }

    /**
     * Get all unique locations assigned to agents
     */
    async getAllAssignedLocations() {
        const agents = await User.find({
            isActive: true,
            approvalStatus: 'approved',
            assignedLocations: { $exists: true, $ne: [] }
        }).select('name assignedLocations');

        const locationMap = {};
        agents.forEach(agent => {
            agent.assignedLocations.forEach(loc => {
                if (!locationMap[loc]) {
                    locationMap[loc] = [];
                }
                locationMap[loc].push({ id: agent._id, name: agent.name });
            });
        });

        return locationMap;
    }

    /**
     * Update agent's assigned locations
     */
    async updateAgentLocations(agentId, locations) {
        const agent = await User.findByIdAndUpdate(
            agentId,
            { assignedLocations: locations },
            { new: true }
        );

        if (!agent) {
            throw new Error('Agent not found');
        }

        logger.info('Agent locations updated', { 
            agentId, 
            locations 
        });

        return agent;
    }

    /**
     * Reset lead assignment counts (can be called periodically)
     */
    async resetAssignmentCounts() {
        await User.updateMany(
            { role: { $in: ['agent', 'manager'] } },
            { leadAssignmentCount: 0 }
        );

        logger.info('Lead assignment counts reset');
    }
}

module.exports = new LeadAssignmentService();
