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
    enum: ['running', 'completed', 'failed', 'paused', 'cancelled', 'waiting_for_response', 'waiting_for_task'],
    default: 'running'
  },
  currentNodeId: String,
  
  // Execution path - tracks which nodes were executed and their results
  executionPath: [{
    nodeId: String,
    nodeType: String,
    nodeLabel: String,
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed', 'skipped', 'waiting'] },
    startedAt: Date,
    completedAt: Date,
    result: mongoose.Schema.Types.Mixed,
    error: String
  }],
  
  // For delayed/scheduled nodes
  nextExecutionAt: Date,
  
  // For waitForResponse nodes (WhatsApp)
  waitingForResponse: {
    isWaiting: { type: Boolean, default: false },
    nodeId: String,           // The node that is waiting
    messageId: String,        // WhatsApp message ID we're waiting response to
    phoneNumber: String,      // Phone number we sent message to (for matching)
    expectedResponses: [{     // What responses we're expecting (button payloads, etc)
      type: { type: String, enum: ['button', 'text', 'any'] },
      value: String,          // Button payload or text pattern
      nextHandle: String      // Which handle to use for next nodes (e.g., 'yes', 'no', 'option1')
    }],
    timeoutAt: Date,          // When to stop waiting and continue with default path
    timeoutHandle: String,    // Handle to use if timeout occurs
    startedAt: Date
  },
  
  // For waitingForCall nodes (AI Calls via ElevenLabs)
  waitingForCall: {
    isWaiting: { type: Boolean, default: false },
    nodeId: String,              // The node that is waiting
    callId: String,              // ElevenLabs call SID
    conversationId: String,      // ElevenLabs conversation ID
    phoneNumber: String,         // Phone number we called
    expectedOutcomes: [{         // What call outcomes we're expecting
      outcome: { type: String, enum: ['answered', 'voicemail', 'no_answer', 'busy', 'failed', 'interested', 'not_interested', 'callback_requested'] },
      nextHandle: String         // Which handle to use for next nodes
    }],
    timeoutAt: Date,             // When to stop waiting for call result
    timeoutHandle: String,       // Handle to use if timeout occurs
    startedAt: Date
  },
  
  // Store the last call result
  lastCallResult: {
    outcome: String,             // answered, voicemail, no_answer, etc.
    status: String,              // ElevenLabs call status
    duration: Number,            // Call duration in seconds
    transcriptSummary: String,   // AI-generated summary of call
    analysis: mongoose.Schema.Types.Mixed,  // Full analysis from ElevenLabs
    evaluationResults: mongoose.Schema.Types.Mixed,  // Evaluation criteria results (interested, etc.)
    sentiment: String,           // Detected sentiment
    intent: String,              // Detected intent
    receivedAt: Date
  },
  
  // For waiting on manual tasks
  waitingForTask: {
    isWaiting: { type: Boolean, default: false },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    nodeId: String,              // The node that created the task
    startedAt: Date
  },
  
  // Store the last received response
  lastResponse: {
    type: { type: String, enum: ['button', 'text', 'image', 'document', 'audio', 'video', 'location'] },
    value: String,            // Button payload or message text
    rawPayload: mongoose.Schema.Types.Mixed,  // Full webhook payload for debugging
    receivedAt: Date
  },
  
  // Automation context - stores data that can be used in subsequent nodes
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
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
// Index for finding runs waiting for WhatsApp responses
automationRunSchema.index({ 'waitingForResponse.isWaiting': 1, 'waitingForResponse.phoneNumber': 1 });
automationRunSchema.index({ 'waitingForResponse.messageId': 1 });
// Index for finding runs waiting for AI call results
automationRunSchema.index({ 'waitingForCall.isWaiting': 1, 'waitingForCall.callId': 1 });
automationRunSchema.index({ 'waitingForCall.conversationId': 1 });

/**
 * Find an active run waiting for response from a specific phone number
 */
automationRunSchema.statics.findWaitingForPhone = async function(phoneNumber) {
  // Normalize phone number - remove spaces, dashes, and handle +91 format
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Try multiple formats
  const phoneVariants = [
    normalizedPhone,
    normalizedPhone.startsWith('+') ? normalizedPhone.substring(1) : normalizedPhone,
    normalizedPhone.startsWith('91') ? normalizedPhone : '91' + normalizedPhone,
    normalizedPhone.startsWith('+91') ? normalizedPhone.substring(3) : normalizedPhone
  ];
  
  return this.findOne({
    status: 'waiting_for_response',
    'waitingForResponse.isWaiting': true,
    'waitingForResponse.phoneNumber': { $in: phoneVariants }
  }).populate('lead').populate('automation');
};

/**
 * Find run by WhatsApp message ID
 */
automationRunSchema.statics.findByMessageId = async function(messageId) {
  return this.findOne({
    status: 'waiting_for_response',
    'waitingForResponse.messageId': messageId
  }).populate('lead').populate('automation');
};

/**
 * Find run waiting for a specific ElevenLabs call result
 */
automationRunSchema.statics.findByCallId = async function(callId) {
  return this.findOne({
    status: 'waiting_for_response',
    'waitingForCall.isWaiting': true,
    'waitingForCall.callId': callId
  }).populate('lead').populate('automation');
};

/**
 * Find run by ElevenLabs conversation ID
 */
automationRunSchema.statics.findByConversationId = async function(conversationId) {
  return this.findOne({
    status: 'waiting_for_response',
    'waitingForCall.isWaiting': true,
    'waitingForCall.conversationId': conversationId
  }).populate('lead').populate('automation');
};

/**
 * Find all runs waiting for call results that have timed out
 */
automationRunSchema.statics.findTimedOutCalls = async function() {
  return this.find({
    status: 'waiting_for_response',
    'waitingForCall.isWaiting': true,
    'waitingForCall.timeoutAt': { $lt: new Date() }
  }).populate('lead').populate('automation');
};

const AutomationRun = mongoose.model('AutomationRun', automationRunSchema);

module.exports = AutomationRun;
