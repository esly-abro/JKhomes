/**
 * Activity Service
 * Manages activity logging and retrieval
 * Now also triggers task auto-completion when activities are logged
 */

const Activity = require('../models/Activity');

/**
 * Create activity and check for task auto-completion
 */
async function createActivity(activityData) {
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
