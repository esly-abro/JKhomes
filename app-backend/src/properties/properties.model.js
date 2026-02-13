const mongoose = require('mongoose');

// Time slot sub-schema
const timeSlotSchema = new mongoose.Schema({
  startTime: {
    type: String,  // Format: "HH:MM" (24-hour)
    required: true
  },
  endTime: {
    type: String,  // Format: "HH:MM" (24-hour)
    required: true
  }
}, { _id: false });

// Special hours override for specific dates
const specialHoursSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  timeSlots: [timeSlotSchema],
  isClosed: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Availability settings sub-schema
const availabilitySchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: true  // Property is open for site visits by default
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
    default: 60,  // Minutes
    min: 15,
    max: 240
  },
  bufferTime: {
    type: Number,
    default: 30,  // Minutes between visits
    min: 0,
    max: 120
  },
  blockedDates: [{
    type: Date
  }],
  maxVisitsPerDay: {
    type: Number,
    default: 8,
    min: 1,
    max: 20
  },
  specialHours: [specialHoursSchema],
  advanceBookingDays: {
    type: Number,
    default: 30,  // How far in advance can visits be booked
    min: 1,
    max: 90
  },
  minAdvanceHours: {
    type: Number,
    default: 2,  // Minimum hours before visit can be booked
    min: 0,
    max: 48
  }
}, { _id: false });

const propertySchema = new mongoose.Schema({
  // Organization ID (Multi-tenancy) - REQUIRED
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },
  
  name: {
    type: String,
    required: true,
    trim: true
  },
  // Category (generic — replaces hardcoded propertyType enum)
  // Validated at service layer against TenantConfig.categories
  category: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    min: {
      type: Number,
      min: 0
    },
    max: {
      type: Number,
      min: 0
    },
    currency: {
      type: String,
      default: 'INR'
    }
  },
  size: {
    value: {
      type: Number,
      min: 0
    },
    unit: {
      type: String,
      default: 'sqft'
    }
  },
  bedrooms: {
    type: Number,
    min: 0
  },
  bathrooms: {
    type: Number,
    min: 0
  },
  status: {
    type: String,
    enum: ['Available', 'Sold', 'Reserved', 'Under Construction'],
    default: 'Available'
  },
  images: [{
    url: String,
    caption: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  description: {
    type: String,
    trim: true
  },
  interestedLeadsCount: {
    type: Number,
    default: 0
  },
  amenities: [String],
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Site visit availability settings
  availability: {
    type: availabilitySchema,
    default: () => ({})
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
propertySchema.pre('save', function () {
  this.updatedAt = Date.now();
});

// ================================
// VIRTUAL: propertyType ↔ category (backward compat)
// Old code reading property.propertyType still works.
// ================================
propertySchema.set('toJSON', { virtuals: true });
propertySchema.set('toObject', { virtuals: true });

propertySchema.virtual('propertyType')
    .get(function () {
        return this.category;
    })
    .set(function (value) {
        this.category = value;
    });

module.exports = mongoose.model('Property', propertySchema);
