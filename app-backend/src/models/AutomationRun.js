const mongoose = require('mongoose');

/**
 * AutomationRun tracks each execution of an automation workflow
 */
const automationRunSchema = new mongoose.Schema({
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
  status: {
    type: String,
    enum: ['running', 'completed', 'failed', 'paused', 'cancelled'],
    default: 'running'
  },
  currentNodeId: String,
  
  // Execution path - tracks which nodes were executed and their results
  executionPath: [{
    nodeId: String,
    nodeType: String,
    nodeLabel: String,
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed', 'skipped'] },
    startedAt: Date,
    completedAt: Date,
    result: mongoose.Schema.Types.Mixed,
    error: String
  }],
  
  // For delayed/scheduled nodes
  nextExecutionAt: Date,
  
  // Metadata
  triggeredBy: {
    type: String,
    enum: ['system', 'manual', 'api'],
    default: 'system'
  },
  
  error: String,
  completedAt: Date
}, {
  timestamps: true
});

// Indexes
automationRunSchema.index({ automation: 1, status: 1 });
automationRunSchema.index({ lead: 1 });
automationRunSchema.index({ status: 1, nextExecutionAt: 1 });
automationRunSchema.index({ createdAt: -1 });

const AutomationRun = mongoose.model('AutomationRun', automationRunSchema);

module.exports = AutomationRun;
