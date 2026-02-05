/**
 * Activity Service
 * Manages activity logging and retrieval
 */

const Activity = require('../models/Activity');

/**
 * Create activity
 */
async function createActivity(activityData) {
    return Activity.create(activityData);
}

/**
 * Get recent activities (all users)
 */
async function getRecentActivities(limit = 50) {
    return Activity.getRecent(limit);
}

/**
 * Get activities by user ID (for agent's own activities)
 */
async function getActivitiesByUser(userId, limit = 50) {
    return Activity.find({ userId })
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email');
}

/**
 * Get all activities (for owner/admin/manager)
 */
async function getAllActivities(limit = 100) {
    return Activity.find()
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email');
}

module.exports = {
    createActivity,
    getRecentActivities,
    getActivitiesByUser,
    getAllActivities
};
