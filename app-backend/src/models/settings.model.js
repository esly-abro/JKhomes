const mongoose = require('mongoose');

// WhatsApp Settings Schema
const whatsappSettingsSchema = new mongoose.Schema({
  accessToken: {
    type: String,
    default: ''
  },
  phoneNumberId: {
    type: String,
    default: ''
  },
  businessAccountId: {
    type: String,
    default: ''
  },
  webhookUrl: {
    type: String
  },
  verifyToken: {
    type: String
  },
  appId: {
    type: String
  },
  appSecret: {
    type: String
  },
  enabled: {
    type: Boolean,
    default: false
  },
  testingEnabled: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Main Settings Schema
const settingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    unique: true
  },
  organization: {
    type: String,
    default: 'default'
  },
  whatsapp: whatsappSettingsSchema,
  // Other settings can be added here
  notifications: {
    email: {
      type: Boolean,
      default: true
    },
    sms: {
      type: Boolean,
      default: false
    },
    push: {
      type: Boolean,
      default: true
    }
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    }
  }
}, {
  timestamps: true
});

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;