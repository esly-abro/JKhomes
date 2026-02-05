/**
 * Task Service
 * Manages tasks and reminders for users
 */

const Activity = require('../models/Activity');
const { NotFoundError } = require('../utils/errors');

/**
 * Get tasks/reminders for a user
 */
async function getTasks(userId, { status, priority } = {}) {
    const query = { userId, type: 'task' };

    if (status === 'completed') {
        query.isCompleted = true;
    } else if (status === 'pending') {
        query.isCompleted = false;
    }

    if (priority) {
        query['metadata.priority'] = priority;
    }

    return Activity.find(query)
        .sort({ scheduledAt: 1, createdAt: -1 })
        .limit(100);
}

/**
 * Create a new task
 */
async function createTask(taskData) {
    const { userId, userName, title, description, scheduledAt, priority, leadId } = taskData;

    const task = new Activity({
        leadId: leadId || 'general',
        type: 'task',
        title,
        description,
        userId,
        userName,
        scheduledAt: scheduledAt || new Date(),
        isCompleted: false,
        metadata: {
            priority: priority || 'medium'
        }
    });

    return task.save();
}

/**
 * Update a task
 */
async function updateTask(taskId, userId, updates) {
    const task = await Activity.findOne({ _id: taskId, userId, type: 'task' });

    if (!task) {
        throw new NotFoundError('Task not found or access denied');
    }

    if (updates.isCompleted !== undefined) {
        task.isCompleted = updates.isCompleted;
        if (updates.isCompleted) {
            task.completedAt = new Date();
            
            // Check if this task is linked to an automation run (Issue #5 fix)
            if (task.metadata?.automationRunId) {
                try {
                    const workflowEngine = require('../services/workflow.engine');
                    await workflowEngine.resumeFromTaskCompletion(task);
                    console.log(`✅ Automation resumed from task completion: ${taskId}`);
                } catch (err) {
                    console.error('Error resuming automation from task:', err);
                }
            }
        }
    }

    if (updates.title) task.title = updates.title;
    if (updates.description) task.description = updates.description;
    if (updates.scheduledAt) task.scheduledAt = updates.scheduledAt;

    if (updates.priority) {
        task.metadata = task.metadata || {};
        task.metadata.priority = updates.priority;
    }

    return task.save();
}

/**
 * Delete a task
 */
async function deleteTask(taskId, userId) {
    const result = await Activity.deleteOne({ _id: taskId, userId, type: 'task' });

    if (result.deletedCount === 0) {
        throw new NotFoundError('Task not found or access denied');
    }

    return result;
}

module.exports = {
    getTasks,
    createTask,
    updateTask,
    deleteTask
};
