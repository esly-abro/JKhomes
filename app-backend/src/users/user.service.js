/**
 * User Service
 * Manages user retrieval and operations
 */

const User = require('../models/User');

/**
 * Get all users from MongoDB (scoped to organization)
 */
async function getUsers(organizationId) {
    const query = {};
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return User.find(query)
        .select('name email role phone isActive approvalStatus createdAt lastLogin')
        .sort({ name: 1 });
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
    return User.findById(userId)
        .select('name email role phone isActive approvalStatus createdAt lastLogin');
}

/**
 * Get users by role (scoped to organization)
 */
async function getUsersByRole(role, organizationId) {
    const query = { role };
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return User.find(query)
        .select('name email role phone isActive approvalStatus createdAt lastLogin')
        .sort({ name: 1 });
}

/**
 * Get agents (users with agent role, scoped to organization)
 */
async function getAgents(organizationId) {
    const query = { role: 'agent' };
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return User.find(query)
        .select('name email role phone isActive approvalStatus createdAt lastLogin')
        .sort({ name: 1 });
}

module.exports = {
    getUsers,
    getUserById,
    getUsersByRole,
    getAgents
};
