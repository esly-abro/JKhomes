/**
 * WhatsApp Business API Service
 * Integrates with Meta's WhatsApp Business Cloud API
 * Supports dynamic credentials from database (Settings model) with fallback to env vars
 */

const axios = require('axios');
const Settings = require('../models/settings.model');
const Organization = require('../models/organization.model');

// Meta WhatsApp API Configuration
const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Get credentials from environment (fallback)
const getAccessToken = () => {
  return process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
};

const getPhoneNumberId = () => {
  return process.env.WHATSAPP_PHONE_NUMBER_ID;
};

const getBusinessAccountId = () => {
  return process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
};

/**
 * Get user's WhatsApp settings from database
 */
async function getUserWhatsappSettings(userId) {
  const settings = await Settings.findOne({ userId });
  
  if (!settings || !settings.whatsapp || !settings.whatsapp.enabled) {
    return null;
  }
  
  return settings.whatsapp;
}

/**
 * Get WhatsApp credentials - tries database first, then falls back to env vars
 * Checks: Settings model → Organization model → env vars
 * @param {string} userId - User ID for database lookup (optional)
 * @param {string} organizationId - Organization ID for multi-tenant lookup (optional)
 * @returns {Object} - { accessToken, phoneNumberId, businessAccountId }
 */
async function getCredentials(userId, organizationId = null) {
  // Try to get credentials from Settings model first
  if (userId) {
    try {
      const settings = await Settings.findOne({ userId });
      
      if (settings?.whatsapp?.enabled && settings?.whatsapp?.accessToken && settings?.whatsapp?.phoneNumberId) {
        console.log('📱 Using WhatsApp credentials from Settings for user:', userId);
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

  // Try to get credentials from Organization model (encrypted, auto-decrypted via getters)
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
      // Access accessToken in a try/catch since decryption may fail if encryption key changed
      let token;
      try {
        token = org.whatsapp.accessToken;
      } catch (decryptErr) {
        console.warn('⚠️ Could not decrypt Organization WhatsApp token, falling back to env vars');
        token = null;
      }
      if (token) {
        console.log('📱 Using WhatsApp credentials from Organization:', org.name);
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
  console.log('📱 Using WhatsApp credentials from environment variables');
  return {
    accessToken: getAccessToken(),
    phoneNumberId: getPhoneNumberId(),
    businessAccountId: getBusinessAccountId()
  };
}

/**
 * Fetch all available WhatsApp message templates
 * @param {string} userId - User ID for dynamic credential lookup (optional)
 * @param {string} accessToken - Direct access token (optional, overrides lookup)
 */
async function getTemplates(userId = null, accessToken = null) {
  try {
    // Get credentials - use provided token, or lookup dynamically, or fall back to env
    let token, businessAccountId, phoneNumberId;
    
    if (accessToken) {
      token = accessToken;
      businessAccountId = getBusinessAccountId();
      phoneNumberId = getPhoneNumberId();
    } else {
      const creds = await getCredentials(userId);
      token = creds.accessToken;
      businessAccountId = creds.businessAccountId;
      phoneNumberId = creds.phoneNumberId;
    }
    
    if (!token) {
      throw new Error('WhatsApp access token not configured. Please add your WhatsApp API credentials in Settings.');
    }

    if (!businessAccountId) {
      // Try to get templates using phone number ID instead
      if (!phoneNumberId) {
        throw new Error('WhatsApp Business Account ID or Phone Number ID not configured. Please add credentials in Settings.');
      }
      
      // First get the WABA ID from phone number
      const phoneResponse = await axios.get(
        `${WHATSAPP_API_BASE}/${phoneNumberId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { fields: 'id,display_phone_number,verified_name' }
        }
      );
      
      console.log('Phone info:', phoneResponse.data);
    }

    const response = await axios.get(
      `${WHATSAPP_API_BASE}/${businessAccountId}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          limit: 100
        }
      }
    );

    const templates = response.data.data || [];
    
    // Parse templates to extract useful info
    return templates.map(template => ({
      id: template.id,
      name: template.name,
      status: template.status,
      category: template.category,
      language: template.language,
      components: template.components || [],
      // Extract buttons/quick replies for condition branching
      buttons: extractButtons(template.components),
    }));
  } catch (error) {
    console.error('Error fetching WhatsApp templates:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Extract buttons from template components
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
          // For URL buttons
          url: button.url,
          // For phone buttons  
          phone_number: button.phone_number,
          // For quick reply buttons
          payload: button.text // Use text as payload for quick replies
        });
      }
    }
  }
  
  return buttons;
}

/**
 * Send a template message via WhatsApp
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} templateName - Template name to send
 * @param {string} languageCode - Language code (default: 'en')
 * @param {Array} components - Template components/variables
 * @param {string} userId - User ID for dynamic credential lookup (optional)
 * @param {string} accessToken - Direct access token (optional, overrides lookup)
 */
async function sendTemplateMessage(phoneNumber, templateName, languageCode = 'en', components = [], userId = null, accessToken = null) {
  try {
    // Get credentials - use provided token, or lookup dynamically, or fall back to env
    let token, phoneNumberId;
    
    if (accessToken) {
      token = accessToken;
      phoneNumberId = getPhoneNumberId();
    } else {
      const creds = await getCredentials(userId);
      token = creds.accessToken;
      phoneNumberId = creds.phoneNumberId;
    }
    
    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured. Please add your WhatsApp API credentials in Settings.');
    }

    // Format phone number (remove spaces, add country code if needed)
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('91')) {
        formattedPhone = formattedPhone;
      } else {
        formattedPhone = '91' + formattedPhone;
      }
    } else {
      formattedPhone = formattedPhone.substring(1); // Remove + for API
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode
        }
      }
    };

    // Add components if provided (for variables, headers, buttons)
    if (components && components.length > 0) {
      payload.template.components = components;
    }

    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('WhatsApp template message sent:', response.data);
    
    return {
      success: true,
      messageId: response.data.messages?.[0]?.id,
      contacts: response.data.contacts
    };
  } catch (error) {
    console.error('Error sending WhatsApp template:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send a text message via WhatsApp
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message text to send
 * @param {string} userId - User ID for dynamic credential lookup (optional)
 * @param {string} accessToken - Direct access token (optional, overrides lookup)
 */
async function sendTextMessage(phoneNumber, message, userId = null, accessToken = null) {
  try {
    // Get credentials - use provided token, or lookup dynamically, or fall back to env
    let token, phoneNumberId;
    
    if (accessToken) {
      token = accessToken;
      phoneNumberId = getPhoneNumberId();
    } else {
      const creds = await getCredentials(userId);
      token = creds.accessToken;
      phoneNumberId = creds.phoneNumberId;
    }
    
    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured. Please add your WhatsApp API credentials in Settings.');
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('91')) {
        formattedPhone = formattedPhone;
      } else {
        formattedPhone = '91' + formattedPhone;
      }
    } else {
      formattedPhone = formattedPhone.substring(1);
    }

    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: {
          body: message
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id
    };
  } catch (error) {
    console.error('Error sending WhatsApp text:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Send interactive message with buttons
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} bodyText - Message body text
 * @param {Array} buttons - Array of button objects
 * @param {string} userId - User ID for dynamic credential lookup (optional)
 * @param {string} accessToken - Direct access token (optional, overrides lookup)
 */
async function sendInteractiveMessage(phoneNumber, bodyText, buttons, userId = null, accessToken = null) {
  try {
    // Get credentials - use provided token, or lookup dynamically, or fall back to env
    let token, phoneNumberId;
    
    if (accessToken) {
      token = accessToken;
      phoneNumberId = getPhoneNumberId();
    } else {
      const creds = await getCredentials(userId);
      token = creds.accessToken;
      phoneNumberId = creds.phoneNumberId;
    }
    
    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured. Please add your WhatsApp API credentials in Settings.');
    }

    // Format phone number
    let formattedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!formattedPhone.startsWith('+')) {
      if (formattedPhone.startsWith('91')) {
        formattedPhone = formattedPhone;
      } else {
        formattedPhone = '91' + formattedPhone;
      }
    } else {
      formattedPhone = formattedPhone.substring(1);
    }

    const response = await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: bodyText
          },
          action: {
            buttons: buttons.slice(0, 3).map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: `btn_${idx}`,
                title: btn.text.substring(0, 20) // Max 20 chars
              }
            }))
          }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      messageId: response.data.messages?.[0]?.id
    };
  } catch (error) {
    console.error('Error sending WhatsApp interactive:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check if WhatsApp credentials are configured
 * Used by automation to skip nodes gracefully if not set up
 * @param {string} userId - User ID for dynamic credential lookup
 * @returns {Object} - { configured: boolean, source: string, needsSetup: boolean }
 */
async function checkCredentialsConfigured(userId = null) {
  try {
    const creds = await getCredentials(userId);
    
    if (creds.accessToken && creds.phoneNumberId) {
      return {
        configured: true,
        source: userId ? 'database' : 'environment',
        needsSetup: false
      };
    }
    
    return {
      configured: false,
      source: null,
      needsSetup: true,
      message: 'WhatsApp credentials not configured. Go to Settings > API Settings to add your Meta WhatsApp API credentials.'
    };
  } catch (error) {
    return {
      configured: false,
      source: null,
      needsSetup: true,
      message: error.message
    };
  }
}

/**
 * Validate WhatsApp credentials by making a test API call
 * @param {string} userId - User ID for dynamic credential lookup
 * @returns {Object} - { valid: boolean, error?: string, phoneNumber?: string }
 */
async function validateCredentials(userId = null) {
  try {
    const creds = await getCredentials(userId);
    
    if (!creds.accessToken || !creds.phoneNumberId) {
      return {
        valid: false,
        error: 'Missing access token or phone number ID'
      };
    }

    // Make a test call to verify credentials
    const response = await axios.get(
      `${WHATSAPP_API_BASE}/${creds.phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        params: { fields: 'id,display_phone_number,verified_name,quality_rating' }
      }
    );

    return {
      valid: true,
      phoneNumber: response.data.display_phone_number,
      verifiedName: response.data.verified_name,
      qualityRating: response.data.quality_rating
    };
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    return {
      valid: false,
      error: errorMessage
    };
  }
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
  validateCredentials
};
