/**
 * User Service
 * Manages user retrieval and operations
 */

const User = require('../models/User');

/**
 * Get all users from MongoDB
 * By default, excludes pending and rejected users (only shows approved/active team members)
 */
async function getUsers() {
    // EXCLUDE pending and rejected users - only show approved users and legacy users
    return User.find({ approvalStatus: { $nin: ['pending', 'rejected'] } })
        .select('name email role createdAt approvalStatus isActive')
        .sort({ name: 1 });
}

/**
 * Get user by ID
 */
async function getUserById(userId) {
    return User.findById(userId)
        .select('name email role createdAt');
}

/**
 * Get users by role
 */
async function getUsersByRole(role) {
    return User.find({ role })
        .select('name email role createdAt')
        .sort({ name: 1 });
}

/**
 * Get agents (users with agent role)
 */
async function getAgents() {
    return User.find({ role: 'agent' })
        .select('name email role createdAt')
        .sort({ name: 1 });
}

module.exports = {
    getUsers,
    getUserById,
    getUsersByRole,
    getAgents
};
