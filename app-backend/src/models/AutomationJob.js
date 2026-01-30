const mongoose = require('mongoose');

/**
 * AutomationJob tracks scheduled/delayed jobs for the workflow engine
 */
const automationJobSchema = new mongoose.Schema({
  automationRun: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AutomationRun',
    required: true
  },
  automation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Automation',
    required: true
  },
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true
  },
  
  // The node to execute
  nodeId: {
    type: String,
    required: true
  },
  nodeType: String,
  nodeData: mongoose.Schema.Types.Mixed,
  
  // Scheduling
  scheduledFor: {
    type: Date,
    required: true,
    index: true
  },
  
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Retry logic
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  lastAttemptAt: Date,
  lastError: String,
  
  // Result
  result: mongoose.Schema.Types.Mixed,
  completedAt: Date
}, {
  timestamps: true
});

// Indexes for job processing
automationJobSchema.index({ status: 1, scheduledFor: 1 });
automationJobSchema.index({ automationRun: 1 });

const AutomationJob = mongoose.model('AutomationJob', automationJobSchema);

module.exports = AutomationJob;
