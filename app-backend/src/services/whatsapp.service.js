/**
 * WhatsApp Business API Service — Provider Router
 * 
 * Routes WhatsApp operations to the correct provider (Meta or Twilio)
 * based on the tenant's Organization.whatsapp.provider setting.
 * 
 * SaaS-ready: each tenant chooses Meta or Twilio independently.
 */

const axios = require('axios');
const Settings = require('../models/settings.model');
const Organization = require('../models/organization.model');

// Sub-providers
const twilioWhatsapp = require('./whatsapp.twilio.service');

// ==========================================
// META PROVIDER CONFIGURATION
// ==========================================

const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

const getAccessToken = () => process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
const getPhoneNumberId = () => process.env.WHATSAPP_PHONE_NUMBER_ID;
const getBusinessAccountId = () => process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

// ==========================================
// PROVIDER RESOLUTION
// ==========================================

const mongoose = require('mongoose');

/**
 * Determine which WhatsApp provider a tenant uses
 * @param {string} userId - User ID for database lookup
 * @returns {Promise<'meta'|'twilio'>}
 */
async function resolveProvider(userId) {
  if (userId) {
    try {
      // Build owner query that matches both String and ObjectId stored values
      const ownerQuery = mongoose.Types.ObjectId.isValid(userId)
        ? { $in: [userId, new mongoose.Types.ObjectId(userId)] }
        : userId;

      // Priority 1: org with connected whatsapp (most reliable)
      let org = await Organization.findOne({ ownerId: ownerQuery, 'whatsapp.isConnected': true });
      if (org?.whatsapp?.provider) {
        console.log(`📱 Resolved provider: ${org.whatsapp.provider} (org: ${org._id}, connected)`);
        return org.whatsapp.provider;
      }
      // Priority 2: org with provider explicitly set to 'twilio'
      org = await Organization.findOne({ ownerId: ownerQuery, 'whatsapp.provider': 'twilio' });
      if (org) {
        console.log(`📱 Resolved provider: twilio (org: ${org._id}, explicit)`);
        return 'twilio';
      }
      // Priority 3: any org for this owner
      org = await Organization.findOne({ ownerId: ownerQuery });
      if (org?.whatsapp?.provider) {
        console.log(`📱 Resolved provider: ${org.whatsapp.provider} (org: ${org._id}, fallback)`);
        return org.whatsapp.provider;
      }
    } catch (e) {
      console.error('resolveProvider error:', e.message);
    }
  }

  // Check env fallback
  if (process.env.WHATSAPP_PROVIDER === 'twilio') return 'twilio';

  // Default to meta if Meta tokens exist, otherwise twilio
  if (getAccessToken() && getPhoneNumberId()) return 'meta';
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return 'twilio';

  return 'meta';
}

// ==========================================
// META CREDENTIAL RESOLUTION
// ==========================================

/**
 * Get user's WhatsApp settings from database
 */
async function getUserWhatsappSettings(userId) {
  const settings = await Settings.findOne({ userId });
  if (!settings || !settings.whatsapp || !settings.whatsapp.enabled) return null;
  return settings.whatsapp;
}

/**
 * Get Meta WhatsApp credentials
 * Checks: Settings model → Organization model → env vars
 * @param {string} userId - User ID for database lookup (optional)
 * @param {string} organizationId - Organization ID for multi-tenant lookup (optional)
 * @returns {Object} - { accessToken, phoneNumberId, businessAccountId }
 */
async function getMetaCredentials(userId, organizationId = null) {
  // Try Settings model first
  if (userId) {
    try {
      const settings = await Settings.findOne({ userId });
      if (settings?.whatsapp?.enabled && settings?.whatsapp?.accessToken && settings?.whatsapp?.phoneNumberId) {
        console.log('📱 Using Meta WhatsApp credentials from Settings for user:', userId);
        return {
          accessToken: settings.whatsapp.accessToken,
          phoneNumberId: settings.whatsapp.phoneNumberId,
          businessAccountId: settings.whatsapp.businessAccountId || getBusinessAccountId()
        };
      }
    } catch (error) {
      console.warn('Could not fetch WhatsApp settings from Settings model:', error.message);
    }
  }

  // Try Organization model
  try {
    let org = null;
    if (organizationId) {
      // Use the caller's org directly (most reliable for multi-tenant)
      org = await Organization.findOne({ _id: organizationId, 'whatsapp.enabled': true });
    }
    if (!org && userId) {
      org = await Organization.findOne({ ownerId: userId, 'whatsapp.enabled': true });
    }
    if (org?.whatsapp?.phoneNumberId) {
      let token;
      try { token = org.whatsapp.accessToken; } catch (decryptErr) {
        console.warn('⚠️ Could not decrypt Organization WhatsApp token, falling back to env vars');
        token = null;
      }
      if (token) {
        console.log('📱 Using Meta WhatsApp credentials from Organization:', org.name);
        return {
          accessToken: token,
          phoneNumberId: org.whatsapp.phoneNumberId,
          businessAccountId: org.whatsapp.businessAccountId || getBusinessAccountId()
        };
      }
    }
  } catch (error) {
    console.warn('Could not fetch WhatsApp settings from Organization model:', error.message);
  }

  // Fallback to environment variables
  console.log('📱 Using Meta WhatsApp credentials from environment variables');
  return {
    accessToken: getAccessToken(),
    phoneNumberId: getPhoneNumberId(),
    businessAccountId: getBusinessAccountId()
  };
}

/**
 * Get WhatsApp credentials — routes to correct provider
 * Backward-compatible: callers don't need to know the provider
 */
async function getCredentials(userId) {
  const provider = await resolveProvider(userId);
  if (provider === 'twilio') {
    return twilioWhatsapp.getCredentials(userId);
  }
  return getMetaCredentials(userId);
}

// ==========================================
// META IMPLEMENTATIONS
// ==========================================

/**
 * Extract buttons from Meta template components
 */
function extractButtons(components) {
  if (!components) return [];
  const buttons = [];
  for (const component of components) {
    if (component.type === 'BUTTONS') {
      for (const button of component.buttons || []) {
        buttons.push({
          type: button.type,
          text: button.text,
          url: button.url,
          phone_number: button.phone_number,
          payload: button.text
        });
      }
    }
  }
  return buttons;
}

/**
 * Format phone number for Meta API (no + prefix)
 */
function formatMetaPhone(phoneNumber) {
  let formatted = phoneNumber.replace(/[\s\-\(\)]/g, '');
  if (!formatted.startsWith('+')) {
    if (!formatted.startsWith('91')) {
      formatted = '91' + formatted;
    }
  } else {
    formatted = formatted.substring(1);
  }
  return formatted;
}

/**
 * [META] Fetch all available WhatsApp message templates
 */
async function metaGetTemplates(userId = null, accessToken = null) {
  let token, businessAccountId, phoneNumberId;
  if (accessToken) {
    token = accessToken;
    businessAccountId = getBusinessAccountId();
    phoneNumberId = getPhoneNumberId();
  } else {
    const creds = await getMetaCredentials(userId);
    token = creds.accessToken;
    businessAccountId = creds.businessAccountId;
    phoneNumberId = creds.phoneNumberId;
  }

  if (!token) throw new Error('WhatsApp access token not configured. Please add your WhatsApp API credentials in Settings.');
  if (!businessAccountId) {
    if (!phoneNumberId) throw new Error('WhatsApp Business Account ID or Phone Number ID not configured.');
    // Try to get WABA ID from phone number
    const phoneResponse = await axios.get(`${WHATSAPP_API_BASE}/${phoneNumberId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { fields: 'id,display_phone_number,verified_name' }
    });
    console.log('Phone info:', phoneResponse.data);
  }

  const response = await axios.get(`${WHATSAPP_API_BASE}/${businessAccountId}/message_templates`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 100 }
  });

  return (response.data.data || []).map(template => ({
    id: template.id,
    name: template.name,
    status: template.status,
    category: template.category,
    language: template.language,
    components: template.components || [],
    buttons: extractButtons(template.components),
  }));
}

/**
 * [META] Send a template message
 */
async function metaSendTemplate(phoneNumber, templateName, languageCode = 'en', components = [], userId = null, accessToken = null) {
  let token, phoneNumberId;
  if (accessToken) { token = accessToken; phoneNumberId = getPhoneNumberId(); }
  else { const creds = await getMetaCredentials(userId); token = creds.accessToken; phoneNumberId = creds.phoneNumberId; }
  if (!token || !phoneNumberId) throw new Error('WhatsApp credentials not configured. Please add your WhatsApp API credentials in Settings.');

  const payload = {
    messaging_product: 'whatsapp',
    to: formatMetaPhone(phoneNumber),
    type: 'template',
    template: { name: templateName, language: { code: languageCode } }
  };
  if (components && components.length > 0) payload.template.components = components;

  const response = await axios.post(`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  console.log('WhatsApp template message sent:', response.data);
  return { success: true, messageId: response.data.messages?.[0]?.id, contacts: response.data.contacts, provider: 'meta' };
}

/**
 * [META] Send a text message
 */
async function metaSendText(phoneNumber, message, userId = null, accessToken = null) {
  let token, phoneNumberId;
  if (accessToken) { token = accessToken; phoneNumberId = getPhoneNumberId(); }
  else { const creds = await getMetaCredentials(userId); token = creds.accessToken; phoneNumberId = creds.phoneNumberId; }
  if (!token || !phoneNumberId) throw new Error('WhatsApp credentials not configured. Please add your WhatsApp API credentials in Settings.');

  const response = await axios.post(`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: formatMetaPhone(phoneNumber), type: 'text', text: { body: message }
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  return { success: true, messageId: response.data.messages?.[0]?.id, provider: 'meta' };
}

/**
 * [META] Send interactive message with buttons
 */
async function metaSendInteractive(phoneNumber, bodyText, buttons, userId = null, accessToken = null) {
  let token, phoneNumberId;
  if (accessToken) { token = accessToken; phoneNumberId = getPhoneNumberId(); }
  else { const creds = await getMetaCredentials(userId); token = creds.accessToken; phoneNumberId = creds.phoneNumberId; }
  if (!token || !phoneNumberId) throw new Error('WhatsApp credentials not configured. Please add your WhatsApp API credentials in Settings.');

  const response = await axios.post(`${WHATSAPP_API_BASE}/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', to: formatMetaPhone(phoneNumber), type: 'interactive',
    interactive: {
      type: 'button', body: { text: bodyText },
      action: { buttons: buttons.slice(0, 3).map((btn, idx) => ({ type: 'reply', reply: { id: `btn_${idx}`, title: btn.text.substring(0, 20) } })) }
    }
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

  return { success: true, messageId: response.data.messages?.[0]?.id, provider: 'meta' };
}

/**
 * [META] Check if credentials are configured
 */
async function metaCheckCredentials(userId = null) {
  try {
    const creds = await getMetaCredentials(userId);
    if (creds.accessToken && creds.phoneNumberId) {
      return { configured: true, source: userId ? 'database' : 'environment', needsSetup: false, provider: 'meta' };
    }
    return { configured: false, source: null, needsSetup: true, provider: 'meta', message: 'Meta WhatsApp credentials not configured. Go to Settings > API Settings to add your Meta WhatsApp API credentials.' };
  } catch (error) {
    return { configured: false, source: null, needsSetup: true, provider: 'meta', message: error.message };
  }
}

/**
 * [META] Validate credentials by making a test API call
 */
async function metaValidateCredentials(userId = null) {
  try {
    const creds = await getMetaCredentials(userId);
    if (!creds.accessToken || !creds.phoneNumberId) return { valid: false, error: 'Missing access token or phone number ID' };

    const response = await axios.get(`${WHATSAPP_API_BASE}/${creds.phoneNumberId}`, {
      headers: { Authorization: `Bearer ${creds.accessToken}` },
      params: { fields: 'id,display_phone_number,verified_name,quality_rating' }
    });

    return { valid: true, phoneNumber: response.data.display_phone_number, verifiedName: response.data.verified_name, qualityRating: response.data.quality_rating, provider: 'meta' };
  } catch (error) {
    return { valid: false, error: error.response?.data?.error?.message || error.message, provider: 'meta' };
  }
}

// ==========================================
// PUBLIC API — Routes to correct provider
// ==========================================

/**
 * Fetch all available WhatsApp message templates
 * Routes to Meta or Twilio based on tenant's provider setting
 */
async function getTemplates(userId = null, accessToken = null) {
  const provider = await resolveProvider(userId);
  console.log(`📱 WhatsApp getTemplates via ${provider}`);
  if (provider === 'twilio') return twilioWhatsapp.getTemplates(userId);
  return metaGetTemplates(userId, accessToken);
}

/**
 * Send a template message via WhatsApp
 * Routes to Meta or Twilio based on tenant's provider setting
 */
async function sendTemplateMessage(phoneNumber, templateName, languageCode = 'en', components = [], userId = null, accessToken = null) {
  const provider = await resolveProvider(userId);
  console.log(`📱 WhatsApp sendTemplate via ${provider}`);
  if (provider === 'twilio') return twilioWhatsapp.sendTemplateMessage(phoneNumber, templateName, languageCode, components, userId);
  return metaSendTemplate(phoneNumber, templateName, languageCode, components, userId, accessToken);
}

/**
 * Send a text message via WhatsApp
 * Routes to Meta or Twilio based on tenant's provider setting
 */
async function sendTextMessage(phoneNumber, message, userId = null, accessToken = null) {
  const provider = await resolveProvider(userId);
  console.log(`📱 WhatsApp sendText via ${provider}`);
  if (provider === 'twilio') return twilioWhatsapp.sendTextMessage(phoneNumber, message, userId);
  return metaSendText(phoneNumber, message, userId, accessToken);
}

/**
 * Send interactive message with buttons
 * Routes to Meta or Twilio based on tenant's provider setting
 */
async function sendInteractiveMessage(phoneNumber, bodyText, buttons, userId = null, accessToken = null) {
  const provider = await resolveProvider(userId);
  console.log(`📱 WhatsApp sendInteractive via ${provider}`);
  if (provider === 'twilio') return twilioWhatsapp.sendInteractiveMessage(phoneNumber, bodyText, buttons, userId);
  return metaSendInteractive(phoneNumber, bodyText, buttons, userId, accessToken);
}

/**
 * Check if WhatsApp credentials are configured
 * Routes to Meta or Twilio based on tenant's provider setting
 */
async function checkCredentialsConfigured(userId = null) {
  const provider = await resolveProvider(userId);
  if (provider === 'twilio') return twilioWhatsapp.checkCredentialsConfigured(userId);
  return metaCheckCredentials(userId);
}

/**
 * Validate WhatsApp credentials by making a test API call
 * Routes to Meta or Twilio based on tenant's provider setting
 */
async function validateCredentials(userId = null) {
  const provider = await resolveProvider(userId);
  if (provider === 'twilio') return twilioWhatsapp.validateCredentials(userId);
  return metaValidateCredentials(userId);
}

module.exports = {
  getTemplates,
  sendTemplateMessage,
  sendTextMessage,
  sendInteractiveMessage,
  extractButtons,
  getCredentials,
  getUserWhatsappSettings,
  checkCredentialsConfigured,
  validateCredentials,
  resolveProvider
};
