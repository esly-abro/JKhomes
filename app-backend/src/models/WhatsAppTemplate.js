/**
 * WhatsApp Template Model
 * Stores per-organization WhatsApp message templates with approval workflow.
 * Templates are created locally, then submitted to Twilio Content API for approval.
 */

const mongoose = require('mongoose');

const buttonSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'],
    default: 'QUICK_REPLY'
  },
  text: {
    type: String,
    required: true,
    maxlength: 25
  },
  url: String,
  phoneNumber: String
}, { _id: false });

const whatsAppTemplateSchema = new mongoose.Schema({
  // Multi-tenancy
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // Template identity
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    // Twilio-friendly: lowercase, underscores, no spaces
    validate: {
      validator: function(v) {
        return /^[a-z][a-z0-9_]*$/.test(v);
      },
      message: 'Template name must start with a letter and contain only lowercase letters, numbers, and underscores'
    }
  },

  friendlyName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  // Twilio Content SID — set after submitting to Twilio Content API
  twilioContentSid: {
    type: String,
    default: null
  },

  // Approval workflow
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected'],
    default: 'draft',
    index: true
  },

  // Template category
  category: {
    type: String,
    enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
    default: 'UTILITY'
  },

  language: {
    type: String,
    default: 'en'
  },

  // Template content
  contentType: {
    type: String,
    enum: ['text', 'quick-reply', 'card'],
    default: 'text'
  },

  // Header (optional — for card type)
  headerText: {
    type: String,
    maxlength: 60,
    default: ''
  },

  // Message body (required)
  body: {
    type: String,
    required: true,
    maxlength: 1024
  },

  // Footer (optional)
  footer: {
    type: String,
    maxlength: 60,
    default: ''
  },

  // Quick reply buttons (max 3 for WhatsApp)
  buttons: {
    type: [buttonSchema],
    validate: {
      validator: function(v) {
        return v.length <= 3;
      },
      message: 'WhatsApp templates support a maximum of 3 buttons'
    },
    default: []
  },

  // Template variables (e.g., {{1}}, {{2}})
  variables: [{
    index: Number,
    sample: String,
    description: String
  }],

  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvalSubmittedAt: Date,
  approvedAt: Date,
  rejectedAt: Date,
  rejectedReason: String

}, {
  timestamps: true
});

// Compound unique: one template name per org
whatsAppTemplateSchema.index({ organizationId: 1, name: 1 }, { unique: true });

// Query helpers
whatsAppTemplateSchema.statics.findByOrg = function(orgId, statusFilter) {
  const query = { organizationId: orgId };
  if (statusFilter) query.status = statusFilter;
  return this.find(query).sort({ createdAt: -1 });
};

whatsAppTemplateSchema.statics.findApprovedByOrg = function(orgId) {
  return this.find({ organizationId: orgId, status: 'approved' }).sort({ name: 1 });
};

const WhatsAppTemplate = mongoose.model('WhatsAppTemplate', whatsAppTemplateSchema);

module.exports = WhatsAppTemplate;
