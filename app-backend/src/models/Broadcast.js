/**
 * Broadcast Model
 * Stores WhatsApp broadcast campaigns with image + CTA buttons
 */

const mongoose = require('mongoose');

const ctaButtonSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['call', 'url'],
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 20 // WhatsApp button text limit
  },
  // For call buttons
  phoneNumber: {
    type: String
  },
  // For URL buttons
  url: {
    type: String
  }
}, { _id: false });

const deliveryStatusSchema = new mongoose.Schema({
  leadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  },
  leadName: String,
  phone: String,
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  messageId: String,
  sentAt: Date,
  deliveredAt: Date,
  readAt: Date,
  error: String
}, { _id: false });

const broadcastSchema = new mongoose.Schema({
  // Campaign name
  name: {
    type: String,
    required: true,
    trim: true
  },
  
  // Message content
  message: {
    type: String,
    required: true,
    maxlength: 1024 // WhatsApp body text limit
  },
  
  // Image URL (uploaded or external)
  imageUrl: {
    type: String
  },
  
  // Header text (optional, shown above image)
  headerText: {
    type: String,
    maxlength: 60
  },
  
  // Footer text (optional, shown below message)
  footerText: {
    type: String,
    maxlength: 60
  },
  
  // CTA Buttons (max 2 for CTA, max 3 for reply buttons)
  buttons: [ctaButtonSchema],
  
  // Campaign status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'draft'
  },
  
  // Scheduling
  scheduledAt: {
    type: Date
  },
  
  // Execution timestamps
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  
  // Statistics
  stats: {
    totalLeads: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    read: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    buttonClicks: {
      type: Map,
      of: Number,
      default: {}
    }
  },
  
  // Detailed delivery status per lead
  deliveryStatus: [deliveryStatusSchema],
  
  // Target audience filter (optional)
  targetFilter: {
    status: [String],      // Lead statuses to include
    source: [String],      // Lead sources to include
    tags: [String],        // Tags to match
    assignedTo: [mongoose.Schema.Types.ObjectId] // Specific agents' leads
  },
  
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Organization (for multi-tenant)
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Indexes
broadcastSchema.index({ createdBy: 1, createdAt: -1 });
broadcastSchema.index({ status: 1 });
broadcastSchema.index({ scheduledAt: 1 });

// Virtual for delivery rate
broadcastSchema.virtual('deliveryRate').get(function() {
  if (this.stats.totalLeads === 0) return 0;
  return Math.round((this.stats.delivered / this.stats.totalLeads) * 100);
});

// Virtual for read rate
broadcastSchema.virtual('readRate').get(function() {
  if (this.stats.delivered === 0) return 0;
  return Math.round((this.stats.read / this.stats.delivered) * 100);
});

module.exports = mongoose.model('Broadcast', broadcastSchema);
