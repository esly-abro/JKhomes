/**
 * WhatsApp Business API Service
 * Integrates with Meta's WhatsApp Business Cloud API
 */

const axios = require('axios');

// Meta WhatsApp API Configuration
const WHATSAPP_API_VERSION = 'v18.0';
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

// Get credentials from environment or use provided token
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
  const Settings = require('../models/settings.model');
  const settings = await Settings.findOne({ userId });
  
  if (!settings || !settings.whatsapp || !settings.whatsapp.enabled) {
    return null;
  }
  
  return settings.whatsapp;
}

/**
 * Fetch all available WhatsApp message templates
 */
async function getTemplates(accessToken = null) {
  try {
    const token = accessToken || getAccessToken();
    const businessAccountId = getBusinessAccountId();
    
    if (!token) {
      throw new Error('WhatsApp access token not configured');
    }

    if (!businessAccountId) {
      // Try to get templates using phone number ID instead
      const phoneNumberId = getPhoneNumberId();
      if (!phoneNumberId) {
        throw new Error('WhatsApp Business Account ID or Phone Number ID not configured');
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
 */
async function sendTemplateMessage(phoneNumber, templateName, languageCode = 'en', components = [], accessToken = null) {
  try {
    const token = accessToken || getAccessToken();
    const phoneNumberId = getPhoneNumberId();
    
    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
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
 */
async function sendTextMessage(phoneNumber, message, accessToken = null) {
  try {
    const token = accessToken || getAccessToken();
    const phoneNumberId = getPhoneNumberId();
    
    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
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
 */
async function sendInteractiveMessage(phoneNumber, bodyText, buttons, accessToken = null) {
  try {
    const token = accessToken || getAccessToken();
    const phoneNumberId = getPhoneNumberId();
    
    if (!token || !phoneNumberId) {
      throw new Error('WhatsApp credentials not configured');
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

module.exports = {
  getTemplates,
  sendTemplateMessage,
  sendTextMessage,
  sendInteractiveMessage,
  extractButtons
};
