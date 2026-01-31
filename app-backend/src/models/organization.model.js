/**
 * Organization Model
 * Stores per-tenant configuration including CRM credentials
 * 
 * This enables multi-tenant SaaS where each customer connects their own Zoho CRM
 */

const mongoose = require('mongoose');
const { encrypt, decrypt, validateEncryptionConfig } = require('../utils/encryption');

// Validate encryption on startup
const encryptionStatus = validateEncryptionConfig();
if (!encryptionStatus.isValid) {
    console.warn(`⚠️  Encryption Warning: ${encryptionStatus.message}`);
}

// Zoho CRM Configuration Schema
const zohoCrmSchema = new mongoose.Schema({
    clientId: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    clientSecret: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    refreshToken: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // Zoho data center URLs
    apiDomain: {
        type: String,
        default: 'https://www.zohoapis.in'  // India by default
    },
    accountsUrl: {
        type: String,
        default: 'https://accounts.zoho.in'
    },
    // Connection status
    isConnected: {
        type: Boolean,
        default: false
    },
    lastSyncAt: {
        type: Date
    },
    lastError: {
        type: String
    },
    // Cached access token (encrypted)
    accessToken: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    accessTokenExpiresAt: {
        type: Date
    }
}, { _id: false, toJSON: { getters: true }, toObject: { getters: true } });

// ElevenLabs Configuration Schema
const elevenLabsSchema = new mongoose.Schema({
    apiKey: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    agentId: {
        type: String
    },
    phoneNumberId: {
        type: String
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
}, { _id: false, toJSON: { getters: true }, toObject: { getters: true } });

// Twilio Configuration Schema (for voice calls and SMS)
const twilioSchema = new mongoose.Schema({
    // ENCRYPTED: Account credentials
    accountSid: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    authToken: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // Phone number (not sensitive)
    phoneNumber: {
        type: String
    },
    // Optional: TwiML App for advanced routing
    twimlAppSid: {
        type: String
    },
    // ENCRYPTED: API Key credentials (alternative auth)
    apiKeySid: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    apiKeySecret: {
        type: String,
        set: encrypt,
        get: decrypt
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
}, { _id: false, toJSON: { getters: true }, toObject: { getters: true } });

// WhatsApp Business API Configuration Schema
const whatsappSchema = new mongoose.Schema({
    // ENCRYPTED: Meta access token (very sensitive)
    accessToken: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // Phone Number ID (Meta's identifier, not sensitive)
    phoneNumberId: {
        type: String
    },
    // Business Account ID (not sensitive)
    businessAccountId: {
        type: String
    },
    // Webhook configuration
    webhookUrl: {
        type: String
    },
    // ENCRYPTED: Webhook verify token
    verifyToken: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // Meta App credentials
    appId: {
        type: String
    },
    // ENCRYPTED: App secret (very sensitive)
    appSecret: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // Connection status
    isConnected: {
        type: Boolean,
        default: false
    },
    enabled: {
        type: Boolean,
        default: false
    },
    lastTestedAt: {
        type: Date
    },
    lastError: {
        type: String
    }
}, { _id: false, toJSON: { getters: true }, toObject: { getters: true } });

// Main Organization Schema
const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        trim: true
    },
    // Owner user - supports both ObjectId and String for in-memory mode
    ownerId: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    // CRM Integration
    zohoCrm: zohoCrmSchema,
    // ElevenLabs AI Calling Integration
    elevenLabs: elevenLabsSchema,
    // Twilio Voice/SMS Integration
    twilio: twilioSchema,
    // WhatsApp Business API Integration
    whatsapp: whatsappSchema,
    // Subscription/billing info (for future)
    plan: {
        type: String,
        enum: ['free', 'starter', 'professional', 'enterprise'],
        default: 'free'
    },
    // Settings
    settings: {
        timezone: {
            type: String,
            default: 'Asia/Kolkata'
        },
        dateFormat: {
            type: String,
            default: 'DD/MM/YYYY'
        },
        currency: {
            type: String,
            default: 'INR'
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Generate slug from name before saving
organizationSchema.pre('save', async function() {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
});

// Static method to get organization by user
organizationSchema.statics.findByUser = async function(userId) {
    return this.findOne({ ownerId: userId });
};

// Instance method to check if Zoho is configured
organizationSchema.methods.isZohoConfigured = function() {
    return !!(
        this.zohoCrm?.clientId &&
        this.zohoCrm?.clientSecret &&
        this.zohoCrm?.refreshToken
    );
};

// Instance method to get decrypted Zoho credentials
organizationSchema.methods.getZohoCredentials = function() {
    if (!this.isZohoConfigured()) {
        return null;
    }
    return {
        clientId: this.zohoCrm.clientId,
        clientSecret: this.zohoCrm.clientSecret,
        refreshToken: this.zohoCrm.refreshToken,
        apiDomain: this.zohoCrm.apiDomain,
        accountsUrl: this.zohoCrm.accountsUrl,
        accessToken: this.zohoCrm.accessToken,
        accessTokenExpiresAt: this.zohoCrm.accessTokenExpiresAt
    };
};

// Export encryption functions for use elsewhere
organizationSchema.statics.encrypt = encrypt;
organizationSchema.statics.decrypt = decrypt;

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
