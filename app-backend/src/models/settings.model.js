const mongoose = require('mongoose');
const { encrypt, decrypt } = require('../utils/encryption');

// WhatsApp Settings Schema with encrypted sensitive fields
const whatsappSettingsSchema = new mongoose.Schema({
  // ENCRYPTED: Meta/WhatsApp access token (sensitive)
  accessToken: {
    type: String,
    default: '',
    set: encrypt,
    get: decrypt
  },
  // Phone Number ID (not sensitive, just an ID)
  phoneNumberId: {
    type: String,
    default: ''
  },
  // Business Account ID (not sensitive, just an ID)
  businessAccountId: {
    type: String,
    default: ''
  },
  // Webhook URL (not sensitive)
  webhookUrl: {
    type: String
  },
  // ENCRYPTED: Webhook verify token (sensitive)
  verifyToken: {
    type: String,
    set: encrypt,
    get: decrypt
  },
  // App ID (not sensitive, just an ID)
  appId: {
    type: String
  },
  // ENCRYPTED: App Secret (very sensitive)
  appSecret: {
    type: String,
    set: encrypt,
    get: decrypt
  },
  enabled: {
    type: Boolean,
    default: false
  },
  testingEnabled: {
    type: Boolean,
    default: false
  },
  // Connection status
  isConnected: {
    type: Boolean,
    default: false
  },
  lastTestedAt: {
    type: Date
  },
  lastError: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
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