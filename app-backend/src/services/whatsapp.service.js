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

/**
 * Send image message with CTA buttons (Call / URL)
 * This creates an interactive message with image header and CTA buttons
 */
async function sendImageWithCTA(phoneNumber, imageUrl, bodyText, buttons = [], options = {}) {
  try {
    const token = getAccessToken();
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

    // Build the interactive message payload
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'interactive',
      interactive: {
        type: 'cta_url', // For CTA buttons with URL
        body: {
          text: bodyText
        },
        action: {}
      }
    };

    // Add header with image if provided
    if (imageUrl) {
      payload.interactive.header = {
        type: 'image',
        image: {
          link: imageUrl
        }
      };
    }

    // Add footer if provided
    if (options.footerText) {
      payload.interactive.footer = {
        text: options.footerText
      };
    }

    // Handle CTA buttons
    // WhatsApp supports either CTA URL buttons OR reply buttons, not both
    const ctaButtons = buttons.filter(b => b.type === 'url' || b.type === 'call');
    
    if (ctaButtons.length > 0) {
      // Use CTA URL type for URL buttons
      const urlButton = ctaButtons.find(b => b.type === 'url');
      const callButton = ctaButtons.find(b => b.type === 'call');
      
      if (urlButton) {
        // CTA URL message type
        payload.interactive.type = 'cta_url';
        payload.interactive.action = {
          name: 'cta_url',
          parameters: {
            display_text: urlButton.text,
            url: urlButton.url
          }
        };
      } else if (callButton) {
        // For call buttons, we use a different approach
        // WhatsApp Cloud API doesn't directly support call buttons in interactive messages
        // So we'll send an image message with the phone number in the body
        return await sendImageWithText(formattedPhone, imageUrl, bodyText, callButton.phoneNumber, options);
      }
    } else {
      // If no CTA buttons, send as simple image message with text
      return await sendImageMessage(formattedPhone, imageUrl, bodyText, options);
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

    console.log('WhatsApp image+CTA message sent:', response.data);
    
    return {
      success: true,
      messageId: response.data.messages?.[0]?.id,
      contacts: response.data.contacts
    };
  } catch (error) {
    console.error('Error sending WhatsApp image+CTA:', error.response?.data || error.message);
    
    // Fallback: Try sending as simple image message
    try {
      console.log('Falling back to simple image message...');
      return await sendImageMessage(phoneNumber, imageUrl, bodyText, options);
    } catch (fallbackError) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }
}

/**
 * Send a simple image message with caption
 */
async function sendImageMessage(phoneNumber, imageUrl, caption, options = {}) {
  try {
    const token = getAccessToken();
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
        type: 'image',
        image: {
          link: imageUrl,
          caption: caption
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
    console.error('Error sending WhatsApp image:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

/**
 * Send image with text including phone number for call action
 */
async function sendImageWithText(phoneNumber, imageUrl, bodyText, callNumber, options = {}) {
  // Include call number in the message body
  const messageWithCall = `${bodyText}\n\n📞 Call us: ${callNumber}`;
  return await sendImageMessage(phoneNumber, imageUrl, messageWithCall, options);
}

/**
 * Send interactive message with reply buttons and image
 */
async function sendImageWithReplyButtons(phoneNumber, imageUrl, bodyText, buttons = [], options = {}) {
  try {
    const token = getAccessToken();
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
          header: imageUrl ? {
            type: 'image',
            image: { link: imageUrl }
          } : undefined,
          body: {
            text: bodyText
          },
          footer: options.footerText ? {
            text: options.footerText
          } : undefined,
          action: {
            buttons: buttons.slice(0, 3).map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: `btn_${idx}_${Date.now()}`,
                title: btn.text.substring(0, 20)
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
    console.error('Error sending WhatsApp image+buttons:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.error?.message || error.message
    };
  }
}

module.exports = {
  getTemplates,
  sendTemplateMessage,
  sendTextMessage,
  sendInteractiveMessage,
  sendImageWithCTA,
  sendImageMessage,
  sendImageWithReplyButtons,
  extractButtons
};
