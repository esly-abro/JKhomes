/**
 * User Service
 * Manages user retrieval and operations
 */

const User = require('../models/User');

/**
 * Get all users from MongoDB
 */
async function getUsers() {
    return User.find()
        .select('name email role createdAt')
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
