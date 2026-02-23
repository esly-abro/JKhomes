/**
 * Organization Model
 * Stores per-tenant configuration including CRM credentials
 * 
 * This enables multi-tenant SaaS where each customer connects their own Zoho CRM
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption key from environment (32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'leadflow-default-key-change-me!!'; // 32 chars
const IV_LENGTH = 16;

/**
 * Encrypt sensitive data
 */
function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive data
 */
function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
        const parts = text.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.warn('⚠️ Decryption failed for a field, returning masked placeholder');
        return '';
    }
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
    // Provider selection: 'meta' (direct Meta Cloud API) or 'twilio' (Twilio WhatsApp API)
    provider: {
        type: String,
        enum: ['meta', 'twilio'],
        default: 'meta'
    },
    // ===== Twilio-specific fields =====
    // ENCRYPTED: Twilio Account SID
    twilioAccountSid: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // ENCRYPTED: Twilio Auth Token
    twilioAuthToken: {
        type: String,
        set: encrypt,
        get: decrypt
    },
    // Twilio WhatsApp-enabled phone number (e.g. "+14155238886")
    twilioWhatsappNumber: {
        type: String
    },
    // ===== Meta-specific fields =====
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
    // Feature toggles
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
    // Twilio Integration (voice, SMS)
    twilio: twilioSchema,
    // WhatsApp Business API Integration
    whatsapp: whatsappSchema,
    // SMTP Email Configuration (per-org)
    smtp: {
        host: { type: String, default: null },
        port: { type: Number, default: 587 },
        secure: { type: Boolean, default: false },
        user: { type: String, default: null },
        pass: { type: String, set: encrypt, get: decrypt, default: null },
        fromName: { type: String, default: null },
        isConfigured: { type: Boolean, default: false }
    },
    // Subscription/billing info (for future)
    plan: {
        type: String,
        enum: ['free', 'starter', 'professional', 'enterprise'],
        default: 'free'
    },
    // Company branding & profile
    logoUrl: {
        type: String,
        default: null
    },
    logoBuffer: {
        type: Buffer,
        default: null
    },
    logoMimeType: {
        type: String,
        default: 'image/png'
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
