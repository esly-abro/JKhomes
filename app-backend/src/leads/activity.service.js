/**
 * Activity Service
 * Manages activity logging and retrieval
 * Now also triggers task auto-completion when activities are logged
 */

const Activity = require('../models/Activity');

/**
 * Create activity and check for task auto-completion
 */
async function createActivity(activityData, organizationId) {
    // Ensure organizationId is set
    if (organizationId) {
        activityData.organizationId = organizationId;
    }
    const activity = await Activity.create(activityData);
    
    // Check for task auto-completion based on activity type
    if (activity.lead && activity.type) {
        try {
            const { taskService } = require('../tasks');
            const completedCount = await taskService.checkAutoCompleteForActivity({
                lead: activity.lead,
                type: activity.type
            });
            if (completedCount > 0) {
                console.log(`✅ Auto-completed ${completedCount} task(s) from activity: ${activity.type}`);
            }
        } catch (err) {
            // Don't fail activity creation if task auto-complete fails
            console.error('Task auto-complete check failed:', err.message);
        }
    }
    
    return activity;
}

/**
 * Get recent activities (scoped to organization)
 */
async function getRecentActivities(organizationId, limit = 50) {
    const query = {};
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return Activity.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email');
}

/**
 * Get activities by user ID (for agent's own activities)
 */
async function getActivitiesByUser(organizationId, userId, limit = 50) {
    const query = { userId };
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return Activity.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('userId', 'name email');
}

/**
 * Get all activities (for owner/admin/manager, scoped to organization)
 */
async function getAllActivities(organizationId, limit = 100) {
    const query = {};
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return Activity.find(query)
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
