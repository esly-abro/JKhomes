const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, required: true }, // trigger, action, condition, delay
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 }
  },
  // Use Mixed type for flexible data structure from React Flow
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false, strict: false });

const edgeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  sourceHandle: String, // For condition nodes: 'yes' or 'no'
  targetHandle: String,
  type: String,
  animated: Boolean,
  style: mongoose.Schema.Types.Mixed
}, { _id: false });

const automationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow null for development/testing
  },
  nodes: [nodeSchema],
  edges: [edgeSchema],
  isActive: {
    type: Boolean,
    default: false
  },
  triggerType: {
    type: String,
    enum: ['newLead', 'leadUpdated', 'siteVisitScheduled', 'manual'],
    required: true
  },
  // Trigger conditions (optional filters)
  triggerConditions: {
    leadSource: [String],
    minBudget: Number,
    maxBudget: Number,
    propertyTypes: [String],
    locations: [String]
  },
  // Stats
  runsCount: {
    type: Number,
    default: 0
  },
  lastRunAt: Date,
  successCount: {
    type: Number,
    default: 0
  },
  failureCount: {
    type: Number,
    default: 0
  },
  
  // Duplicate Prevention Settings
  preventDuplicates: {
    type: Boolean,
    default: true  // By default, prevent running same automation for same lead if already running
  },
  cooldownPeriod: {
    type: Number,
    default: 0  // Minutes to wait before allowing same automation for same lead (0 = no cooldown)
  },
  runOncePerLead: {
    type: Boolean,
    default: false  // If true, automation only runs once per lead ever
  }
}, {
  timestamps: true
});

// Index for quick lookup by owner and trigger type
automationSchema.index({ owner: 1, isActive: 1 });
automationSchema.index({ triggerType: 1, isActive: 1 });

// Method to find trigger node
automationSchema.methods.getTriggerNode = function() {
  return this.nodes.find(node => node.type === 'trigger');
};

// Method to find nodes by type
automationSchema.methods.findNodesByType = function(type) {
  return this.nodes.filter(node => node.type === type || node.data?.type === type);
};

// Method to get next nodes after a given node
automationSchema.methods.getNextNodes = function(nodeId, handleId = null) {
  const outgoingEdges = this.edges.filter(edge => {
    if (edge.source !== nodeId) return false;
    if (handleId && edge.sourceHandle !== handleId) return false;
    return true;
  });
  
  return outgoingEdges.map(edge => {
    const targetNode = this.nodes.find(n => n.id === edge.target);
    return { node: targetNode, edge };
  }).filter(item => item.node);
};

const Automation = mongoose.model('Automation', automationSchema);

module.exports = Automation;
