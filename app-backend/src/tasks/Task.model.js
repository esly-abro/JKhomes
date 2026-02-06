/**
 * Task Model
 * Tracks manual intervention points in automation workflows
 * Tasks are created when automation needs human action
 */

const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  // Core references
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true,
    index: true
  },
  automationRun: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AutomationRun',
    index: true
  },
  automation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation'
  },
  nodeId: {
    type: String,
    description: 'The workflow node that created this task'
  },

  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Task details
  type: {
    type: String,
    enum: [
      'call_lead',           // Human Agent Manual Call
      'confirm_site_visit',  // Agent Confirmation Call
      'update_after_visit',  // Update CRM after site visit
      'followup_call',       // Day 2, Day 7 follow-up calls
      'negotiate_deal',      // Review deal terms
      'prepare_docs',        // Prepare documentation
      'manual_action',       // Generic manual action
      'schedule_visit',      // Schedule site visit
      'send_quote',          // Send pricing quote
      'other'
    ],
    default: 'manual_action'
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled', 'overdue'],
    default: 'pending',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },

  // Timing
  dueDate: {
    type: Date,
    index: true
  },
  completedAt: Date,
  startedAt: Date,

  // Navigation
  redirectUrl: {
    type: String,
    description: 'URL to redirect agent when clicking task'
  },
  redirectType: {
    type: String,
    enum: ['lead', 'automation', 'property', 'external'],
    default: 'lead'
  },

  // Auto-completion config
  autoCompleteOn: {
    activityType: {
      type: String,
      enum: ['call', 'whatsapp', 'email', 'meeting', 'note', 'status_change', 'site_visit', null],
      description: 'Activity type that auto-completes this task'
    },
    statusChange: {
      type: String,
      description: 'Lead status that auto-completes this task'
    }
  },

  // Completion details
  completionNotes: String,
  completionResult: {
    type: String,
    enum: ['success', 'failed', 'rescheduled', 'no_answer', 'cancelled', null]
  },

  // Context from automation
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
TaskSchema.index({ assignedTo: 1, status: 1 });
TaskSchema.index({ status: 1, dueDate: 1 });
TaskSchema.index({ lead: 1, status: 1 });
TaskSchema.index({ automationRun: 1, nodeId: 1 });

// Virtual for overdue check
TaskSchema.virtual('isOverdue').get(function() {
  if (this.status === 'completed' || this.status === 'cancelled') return false;
  if (!this.dueDate) return false;
  return new Date() > this.dueDate;
});

// Pre-save: Update status to overdue if past due date
TaskSchema.pre('save', function(next) {
  if (this.isOverdue && this.status === 'pending') {
    this.status = 'overdue';
  }
  next();
});

// Methods
TaskSchema.methods.markComplete = async function(notes, result) {
  this.status = 'completed';
  this.completedAt = new Date();
  if (notes) this.completionNotes = notes;
  if (result) this.completionResult = result;
  return this.save();
};

TaskSchema.methods.markInProgress = async function() {
  this.status = 'in_progress';
  this.startedAt = new Date();
  return this.save();
};

// Statics
TaskSchema.statics.findByAgent = function(userId, status = null) {
  const query = { assignedTo: userId };
  if (status) query.status = status;
  return this.find(query)
    .populate('lead', 'name phone email status')
    .sort({ priority: -1, dueDate: 1 });
};

TaskSchema.statics.findUnassigned = function() {
  return this.find({ assignedTo: null, status: { $in: ['pending', 'overdue'] } })
    .populate('lead', 'name phone email status')
    .sort({ priority: -1, dueDate: 1 });
};

TaskSchema.statics.findByLead = function(leadId) {
  return this.find({ lead: leadId })
    .sort({ createdAt: -1 });
};

TaskSchema.statics.findByAutomationRun = function(runId) {
  return this.find({ automationRun: runId })
    .sort({ createdAt: 1 });
};

module.exports = mongoose.model('Task', TaskSchema);
