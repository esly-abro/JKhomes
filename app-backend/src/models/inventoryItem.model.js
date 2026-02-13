/**
 * InventoryItem Model
 * Generic catalog/inventory for any SaaS tenant (Products, Services, Listings, Programs, etc.)
 * 
 * Replaces the hardcoded "Property" model.
 * Supports:
 * - Custom fields defined per organization
 * - Generic pricing model
 * - Image uploads
 * - Availability scheduling
 * - Generic categorization (via customFields or category field)
 * 
 * Examples:
 * - Real Estate: Properties (bedrooms, bathrooms, location)
 * - Healthcare: Services (duration, consultants, specialization)
 * - SaaS: Products (features, pricing tiers)
 * - Education: Programs (duration, level, prerequisites)
 * - Insurance: Products (coverage, terms)
 */

const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  }
}, { _id: false });

const availabilitySchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true
  },
  weekdays: {
    monday: { type: Boolean, default: true },
    tuesday: { type: Boolean, default: true },
    wednesday: { type: Boolean, default: true },
    thursday: { type: Boolean, default: true },
    friday: { type: Boolean, default: true },
    saturday: { type: Boolean, default: true },
    sunday: { type: Boolean, default: false }
  },
  timeSlots: {
    type: [timeSlotSchema],
    default: [
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' },
      { startTime: '11:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '15:00' },
      { startTime: '15:00', endTime: '16:00' },
      { startTime: '16:00', endTime: '17:00' }
    ]
  },
  slotDuration: {
    type: Number,
    default: 60,
    min: 15,
    max: 240
  },
  bufferTime: {
    type: Number,
    default: 30,
    min: 0,
    max: 120
  },
  blockedDates: [{ type: Date }],
  maxVisitsPerDay: {
    type: Number,
    default: 8,
    min: 1,
    max: 20
  },
  advanceBookingDays: {
    type: Number,
    default: 30,
    min: 1,
    max: 90
  },
  minAdvanceHours: {
    type: Number,
    default: 2,
    min: 0,
    max: 48
  }
}, { _id: false });

const inventoryItemSchema = new mongoose.Schema({
  // Master fields - same for all SaaS
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // Catalog name (e.g., "Property", "Service", "Product", "Program")
  // Comes from TenantConfig.catalogModuleLabel
  itemType: {
    type: String,
    required: true,
    trim: true,
    default: 'Item'
  },

  // Core fields (standard for ALL items)
  name: {
    type: String,
    required: true,
    trim: true
  },

  // Category - from TenantConfig.categories[]
  category: {
    type: String,
    required: true,
    trim: true
  },

  // Generic pricing (flexible for all industries)
  pricing: {
    basePrice: {
      type: Number,
      min: 0,
      default: 0
    },
    minPrice: {
      type: Number,
      min: 0
    },
    maxPrice: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    },
    billingCycle: {
      type: String,
      enum: ['one-time', 'monthly', 'quarterly', 'annual'],
      default: 'one-time'
    }
  },

  // Generic status (flexible)
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Archived', 'Draft', 'Under Review'],
    default: 'Active'
  },

  // Core fields (description, images, etc.)
  description: {
    type: String,
    trim: true
  },

  images: [{
    url: String,
    caption: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Interested leads counter
  interestedLeadsCount: {
    type: Number,
    default: 0
  },

  // Assignment (optional - some items may not need assignment)
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Tags/keywords (generic searchable attributes)
  tags: [String],

  // Availability for scheduling
  availability: {
    type: availabilitySchema,
    default: () => ({})
  },

  // CUSTOM FIELDS - The key to true multi-tenancy!
  // Organization defines these in settings
  // Example for Healthcare: [{ key: 'duration', type: 'number', value: 30 }, { key: 'consultants', type: 'array', value: ['Dr. Smith'] }]
  customFields: [{
    key: {
      type: String,
      required: true,
      trim: true
    },
    label: {
      type: String,
      trim: true
    },
    type: {
      type: String,
      enum: ['text', 'number', 'date', 'select', 'multiselect', 'boolean', 'array', 'json'],
      default: 'text'
    },
    value: mongoose.Schema.Types.Mixed,
    options: [String]  // For select/multiselect
  }],

  // For backward compatibility with Property model
  // These can be populated via customFields
  legacyFields: {
    // Real Estate specific (may be in customFields instead)
    bedrooms: Number,
    bathrooms: Number,
    sqft: Number,
    location: String,
    amenities: [String],
    // Will be deprecated - prefer customFields
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
inventoryItemSchema.pre('save', function () {
  this.updatedAt = Date.now();
});

// Helper method to get custom field value
inventoryItemSchema.methods.getCustomField = function(key) {
  const field = this.customFields.find(f => f.key === key);
  return field ? field.value : null;
};

// Helper method to set custom field value
inventoryItemSchema.methods.setCustomField = function(key, value, label = '', type = 'text') {
  const existingField = this.customFields.find(f => f.key === key);
  if (existingField) {
    existingField.value = value;
    if (label) existingField.label = label;
    if (type) existingField.type = type;
  } else {
    this.customFields.push({ key, label, type, value });
  }
};

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
