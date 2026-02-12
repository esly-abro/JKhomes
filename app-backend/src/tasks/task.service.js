/**
 * Task Service
 * Business logic for task management
 * Handles task creation, completion, auto-detection, and automation sync
 */

const Task = require('./Task.model');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');

/**
 * Task type configurations with defaults
 */
const TASK_TYPE_CONFIG = {
  call_lead: {
    title: 'Call Lead',
    priority: 'high',
    autoCompleteOn: { activityType: 'call' },
    redirectType: 'lead'
  },
  confirm_appointment: {
    title: 'Confirm Appointment',
    priority: 'high',
    autoCompleteOn: { activityType: 'call' },
    redirectType: 'lead'
  },
  // Backward compat alias
  confirm_site_visit: {
    title: 'Confirm Appointment',
    priority: 'high',
    autoCompleteOn: { activityType: 'call' },
    redirectType: 'lead'
  },
  update_after_appointment: {
    title: 'Update CRM After Appointment',
    priority: 'medium',
    autoCompleteOn: { statusChange: 'appointment_done' },
    redirectType: 'lead'
  },
  // Backward compat alias
  update_after_visit: {
    title: 'Update CRM After Appointment',
    priority: 'medium',
    autoCompleteOn: { statusChange: 'appointment_done' },
    redirectType: 'lead'
  },
  followup_call: {
    title: 'Follow-up Call',
    priority: 'medium',
    autoCompleteOn: { activityType: 'call' },
    redirectType: 'lead'
  },
  negotiate_deal: {
    title: 'Negotiate Deal Terms',
    priority: 'high',
    autoCompleteOn: { statusChange: 'negotiation' },
    redirectType: 'lead'
  },
  prepare_docs: {
    title: 'Prepare Documentation',
    priority: 'medium',
    autoCompleteOn: null,
    redirectType: 'lead'
  },
  schedule_appointment: {
    title: 'Schedule Appointment',
    priority: 'high',
    autoCompleteOn: { statusChange: 'appointment_scheduled' },
    redirectType: 'lead'
  },
  // Backward compat alias
  schedule_visit: {
    title: 'Schedule Appointment',
    priority: 'high',
    autoCompleteOn: { statusChange: 'appointment_scheduled' },
    redirectType: 'lead'
  },
  send_quote: {
    title: 'Send Price Quote',
    priority: 'medium',
    autoCompleteOn: { activityType: 'email' },
    redirectType: 'lead'
  },
  manual_action: {
    title: 'Manual Action Required',
    priority: 'medium',
    autoCompleteOn: null,
    redirectType: 'lead'
  }
};

/**
 * Create a task for an agent
 */
async function createTask(options) {
  const {
    leadId,
    automationRunId,
    automationId,
    nodeId,
    assignedTo,
    createdBy,
    type = 'manual_action',
    title,
    description,
    priority,
    dueDate,
    context = {},
    metadata = {}
  } = options;

  // Get type config defaults
  const typeConfig = TASK_TYPE_CONFIG[type] || TASK_TYPE_CONFIG.manual_action;

  // Determine assignee - use lead's assigned agent if not specified
  let assignee = assignedTo;
  if (!assignee && leadId) {
    const lead = await Lead.findById(leadId).select('assignedTo assignedAgent');
    assignee = lead?.assignedTo || lead?.assignedAgent;
  }

  // Build redirect URL
  const redirectUrl = `/leads/${leadId}`;

  const task = new Task({
    lead: leadId,
    automationRun: automationRunId,
    automation: automationId,
    nodeId,
    assignedTo: assignee, // Can be null for unassigned tasks
    createdBy,
    type,
    title: title || typeConfig.title,
    description,
    priority: priority || typeConfig.priority,
    dueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000), // Default: 24 hours
    redirectUrl,
    redirectType: typeConfig.redirectType,
    autoCompleteOn: typeConfig.autoCompleteOn,
    context,
    metadata
  });

  await task.save();
  console.log(`✅ Task created: ${task.title} for lead ${leadId}${assignee ? ` assigned to ${assignee}` : ' (unassigned)'}`);

  return task;
}

/**
 * Get tasks for a specific user (agent)
 */
async function getTasksForUser(userId, filters = {}) {
  const query = { assignedTo: userId };

  if (filters.status) {
    query.status = filters.status;
  } else {
    // Default: show pending and in_progress
    query.status = { $in: ['pending', 'in_progress', 'overdue'] };
  }

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.priority) {
    query.priority = filters.priority;
  }

  if (filters.leadId) {
    query.lead = filters.leadId;
  }

  const tasks = await Task.find(query)
    .populate('lead', 'name phone email status source budget category')
    .populate('assignedTo', 'name email')
    .populate('automation', 'name')
    .sort({ 
      priority: -1, // urgent first
      dueDate: 1,   // earliest due date
      createdAt: -1 
    });

  return tasks;
}

/**
 * Get all tasks (for admin/manager view)
 */
async function getAllTasks(filters = {}) {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.assignedTo === 'unassigned') {
    query.assignedTo = null;
  } else if (filters.assignedTo) {
    query.assignedTo = filters.assignedTo;
  }

  if (filters.type) {
    query.type = filters.type;
  }

  if (filters.leadId) {
    query.lead = filters.leadId;
  }

  const tasks = await Task.find(query)
    .populate('lead', 'name phone email status source budget')
    .populate('assignedTo', 'name email')
    .populate('createdBy', 'name')
    .populate('automation', 'name')
    .sort({ 
      priority: -1,
      dueDate: 1,
      createdAt: -1 
    });

  return tasks;
}

/**
 * Get unassigned tasks (for admin to delegate)
 */
async function getUnassignedTasks() {
  return Task.findUnassigned();
}

/**
 * Get task by ID with full details
 */
async function getTaskById(taskId) {
  return Task.findById(taskId)
    .populate('lead')
    .populate('assignedTo', 'name email phone')
    .populate('createdBy', 'name email')
    .populate('automation', 'name')
    .populate('automationRun');
}

/**
 * Mark task as complete and trigger automation resume
 */
async function completeTask(taskId, userId, notes = null, result = 'success') {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  // Mark complete
  task.status = 'completed';
  task.completedAt = new Date();
  task.completionNotes = notes;
  task.completionResult = result;
  await task.save();

  console.log(`✅ Task completed: ${task.title} (${task._id})`);

  // Resume automation if linked
  if (task.automationRun && task.nodeId) {
    try {
      const workflowResume = require('../services/workflow.resume');
      await workflowResume.resumeFromTaskCompletion(task);
    } catch (err) {
      console.error('Error resuming automation from task:', err);
      // Don't fail task completion if automation resume fails
    }
  }

  return task;
}

/**
 * Assign task to a user
 */
async function assignTask(taskId, assigneeId, assignedBy) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  task.assignedTo = assigneeId;
  task.metadata = {
    ...task.metadata,
    assignedBy,
    assignedAt: new Date()
  };
  await task.save();

  console.log(`📋 Task ${taskId} assigned to ${assigneeId}`);
  return task;
}

/**
 * Check and auto-complete tasks based on activity
 * Called when a new activity is logged
 */
async function checkAutoCompleteForActivity(activity) {
  const { lead: leadId, type: activityType } = activity;

  // Find pending tasks for this lead that auto-complete on this activity type
  const tasks = await Task.find({
    lead: leadId,
    status: { $in: ['pending', 'in_progress', 'overdue'] },
    'autoCompleteOn.activityType': activityType
  });

  for (const task of tasks) {
    console.log(`🔄 Auto-completing task ${task._id} due to activity ${activityType}`);
    await completeTask(task._id, null, `Auto-completed by ${activityType} activity`, 'success');
  }

  return tasks.length;
}

/**
 * Check and auto-complete tasks based on lead status change
 * Called when lead status is updated
 */
async function checkAutoCompleteForStatusChange(leadId, newStatus) {
  const tasks = await Task.find({
    lead: leadId,
    status: { $in: ['pending', 'in_progress', 'overdue'] },
    'autoCompleteOn.statusChange': newStatus
  });

  for (const task of tasks) {
    console.log(`🔄 Auto-completing task ${task._id} due to status change to ${newStatus}`);
    await completeTask(task._id, null, `Auto-completed by status change to ${newStatus}`, 'success');
  }

  return tasks.length;
}

/**
 * Get task statistics for a user
 */
async function getTaskStats(userId = null) {
  const matchStage = userId ? { assignedTo: userId } : {};

  const stats = await Task.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    pending: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
    cancelled: 0,
    total: 0,
    unassigned: 0
  };

  stats.forEach(s => {
    result[s._id] = s.count;
    result.total += s.count;
  });

  // Count unassigned separately
  if (!userId) {
    result.unassigned = await Task.countDocuments({ 
      assignedTo: null, 
      status: { $in: ['pending', 'overdue'] } 
    });
  }

  return result;
}

/**
 * Cancel a task
 */
async function cancelTask(taskId, reason = null) {
  const task = await Task.findById(taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  task.status = 'cancelled';
  task.completionNotes = reason || 'Task cancelled';
  await task.save();

  return task;
}

/**
 * Update overdue tasks
 * Run periodically to mark overdue tasks
 */
async function updateOverdueTasks() {
  const result = await Task.updateMany(
    {
      status: 'pending',
      dueDate: { $lt: new Date() }
    },
    {
      $set: { status: 'overdue' }
    }
  );

  if (result.modifiedCount > 0) {
    console.log(`⏰ Marked ${result.modifiedCount} tasks as overdue`);
  }

  return result.modifiedCount;
}

module.exports = {
  createTask,
  getTasksForUser,
  getAllTasks,
  getUnassignedTasks,
  getTaskById,
  completeTask,
  assignTask,
  checkAutoCompleteForActivity,
  checkAutoCompleteForStatusChange,
  getTaskStats,
  cancelTask,
  updateOverdueTasks,
  TASK_TYPE_CONFIG
};
