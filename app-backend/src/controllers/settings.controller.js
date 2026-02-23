const Settings = require('../models/settings.model');
const Organization = require('../models/organization.model');
const axios = require('axios');

/**
 * Get WhatsApp settings for a user
 */
async function getWhatsappSettings(request, reply) {
  try {
    const userId = request.user.id || request.user._id;
    
    let settings = await Settings.findOne({ userId });
    
    if (settings?.whatsapp?.enabled) {
      // Don't send sensitive data in response
      const safeSettings = {
        ...settings.whatsapp.toObject(),
        accessToken: settings.whatsapp.accessToken ? '••••••••••••' : '',
        appSecret: settings.whatsapp.appSecret ? '••••••••••••' : ''
      };
      return reply.send({ success: true, data: safeSettings });
    }

    // Check Organization model (with safe decryption)
    let org = null;
    const organizationId = request.user?.organizationId;
    try {
      // First try user's own org
      if (organizationId) {
        org = await Organization.findOne({ _id: organizationId, 'whatsapp.enabled': true });
      }
      if (!org) {
        org = await Organization.findOne({ ownerId: userId, 'whatsapp.enabled': true });
      }
    } catch (e) {
      // ignore
    }

    if (org?.whatsapp) {
      let hasToken = false;
      let hasSecret = false;
      try { hasToken = !!org.whatsapp.accessToken; } catch(e) { hasToken = true; }
      try { hasSecret = !!org.whatsapp.appSecret; } catch(e) { hasSecret = true; }
      
      const safeSettings = {
        accessToken: hasToken ? '••••••••••••' : '',
        phoneNumberId: org.whatsapp.phoneNumberId || '',
        businessAccountId: org.whatsapp.businessAccountId || '',
        webhookUrl: org.whatsapp.webhookUrl || '',
        verifyToken: '••••••••••••',
        appId: org.whatsapp.appId || '',
        appSecret: hasSecret ? '••••••••••••' : '',
        enabled: org.whatsapp.enabled || false,
        testingEnabled: org.whatsapp.testingEnabled || false,
        isConnected: org.whatsapp.isConnected || false
      };
      return reply.send({ success: true, data: safeSettings });
    }

    // Return empty defaults
    return reply.send({
      success: true,
      data: {
        accessToken: '',
        phoneNumberId: '',
        businessAccountId: '',
        webhookUrl: '',
        verifyToken: '',
        appId: '',
        appSecret: '',
        enabled: false,
        testingEnabled: false
      }
    });
  } catch (error) {
    console.error('Error getting WhatsApp settings:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to retrieve WhatsApp settings'
    });
  }
}

/**
 * Update WhatsApp settings for a user
 */
async function updateWhatsappSettings(request, reply) {
  try {
    const userId = request.user.id;
    const whatsappSettings = request.body;

    // Validate required fields
    if (whatsappSettings.enabled) {
      if (!whatsappSettings.accessToken || !whatsappSettings.phoneNumberId || !whatsappSettings.businessAccountId) {
        return reply.code(400).send({
          success: false,
          error: 'Access Token, Phone Number ID, and Business Account ID are required when WhatsApp is enabled'
        });
      }
    }

    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      settings = new Settings({
        userId,
        whatsapp: whatsappSettings
      });
    } else {
      settings.whatsapp = {
        ...settings.whatsapp,
        ...whatsappSettings
      };
    }

    await settings.save();

    // Log the configuration update
    console.log(`WhatsApp settings updated for user ${userId}:`, {
      enabled: whatsappSettings.enabled,
      hasAccessToken: !!whatsappSettings.accessToken,
      phoneNumberId: whatsappSettings.phoneNumberId,
      businessAccountId: whatsappSettings.businessAccountId
    });

    return reply.send({
      success: true,
      message: 'WhatsApp settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating WhatsApp settings:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to update WhatsApp settings'
    });
  }
}

/**
 * Test WhatsApp API connection
 */
async function testWhatsappConnection(request, reply) {
  try {
    const { accessToken, phoneNumberId } = request.body;

    if (!accessToken || !phoneNumberId) {
      return reply.code(400).send({
        success: false,
        error: 'Access Token and Phone Number ID are required for testing'
      });
    }

    // Test the connection by fetching phone number info
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${phoneNumberId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        timeout: 10000
      }
    );

    return reply.send({
      success: true,
      message: 'WhatsApp API connection successful',
      details: {
        phoneNumber: response.data.display_phone_number,
        status: response.data.status,
        platform: response.data.platform,
        throughput: response.data.throughput
      }
    });
  } catch (error) {
    console.error('WhatsApp connection test failed:', error);
    
    let errorMessage = 'Connection test failed';
    let details = null;

    if (error.response) {
      // API responded with an error
      errorMessage = error.response.data?.error?.message || 'Invalid API credentials';
      details = {
        status: error.response.status,
        error: error.response.data?.error
      };
    } else if (error.request) {
      // Network error
      errorMessage = 'Network error - unable to reach WhatsApp API';
    }

    return reply.send({
      success: false,
      error: errorMessage,
      details
    });
  }
}

/**
 * Get all settings for a user
 */
async function getAllSettings(request, reply) {
  try {
    const userId = request.user.id;
    
    let settings = await Settings.findOne({ userId });
    
    if (!settings) {
      // Return default settings
      return reply.send({
        success: true,
        data: {
          whatsapp: {
            enabled: false,
            testingEnabled: false
          },
          notifications: {
            email: true,
            sms: false,
            push: true
          },
          preferences: {
            theme: 'light',
            language: 'en',
            timezone: 'UTC'
          }
        }
      });
    }

    // Remove sensitive data
    const safeSettings = {
      whatsapp: {
        ...settings.whatsapp.toObject(),
        accessToken: settings.whatsapp.accessToken ? '••••••••••••' : '',
        appSecret: settings.whatsapp.appSecret ? '••••••••••••' : ''
      },
      notifications: settings.notifications,
      preferences: settings.preferences
    };

    return reply.send({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    console.error('Error getting all settings:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to retrieve settings'
    });
  }
}

/**
 * Get WhatsApp templates for a user using their saved credentials
 * Delegates to whatsapp.service which checks: Settings → Organization → env vars
 */
async function getWhatsappTemplates(request, reply) {
  try {
    const userId = request.user.id || request.user._id;
    
    // The whatsapp service handles all credential resolution (Settings → Organization → env)
    const whatsappService = require('../services/whatsapp.service');
    const templates = await whatsappService.getTemplates(userId);
    return reply.send({ success: true, data: templates });
  } catch (error) {
    console.error('Error getting WhatsApp templates:', error);
    return reply.code(500).send({
      success: false,
      error: 'Failed to retrieve WhatsApp templates'
    });
  }
}

/**
 * Send WhatsApp template message using user's saved credentials
 * Checks: Settings model → Organization model → env vars
 */
async function sendWhatsappTemplate(request, reply) {
  try {
    const userId = request.user.id || request.user._id;
    const { phoneNumber, templateName, languageCode, components } = request.body;
    
    if (!phoneNumber || !templateName) {
      return reply.code(400).send({
        success: false,
        error: 'Phone number and template name are required'
      });
    }

    const provider = await _resolveWhatsappProvider(userId);
    console.log(`📱 sendWhatsappTemplate resolved provider: ${provider} for user ${userId}`);

    let result;
    if (provider === 'twilio') {
      const twilioService = require('../services/whatsapp.twilio.service');
      result = await twilioService.sendTemplateMessage(phoneNumber, templateName, languageCode || 'en', components, userId);
    } else {
      const whatsappService = require('../services/whatsapp.service');
      result = await whatsappService.sendTemplateMessage(phoneNumber, templateName, languageCode || 'en', components, userId);
    }

    return reply.send({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error sending WhatsApp template:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to send WhatsApp template'
    });
  }
}

/**
 * Resolve WhatsApp provider directly from Organization model
 * Handles Mixed-type ownerId (can be String or ObjectId)
 */
async function _resolveWhatsappProvider(userId) {
  const Organization = require('../models/organization.model');
  const mongoose = require('mongoose');

  // Try with both String and ObjectId to handle Mixed type ownerId
  const candidates = [userId];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    candidates.push(new mongoose.Types.ObjectId(userId));
  }

  for (const oid of candidates) {
    const org = await Organization.findOne({ ownerId: oid, 'whatsapp.isConnected': true });
    if (org?.whatsapp?.provider) {
      return org.whatsapp.provider;
    }
  }
  return 'meta'; // default
}

/**
 * Send a free-form WhatsApp text message (works with Twilio sandbox without templates)
 */
async function sendWhatsappText(request, reply) {
  try {
    const userId = request.user.id || request.user._id;
    const { phoneNumber, message } = request.body;

    if (!phoneNumber || !message) {
      return reply.code(400).send({
        success: false,
        error: 'Phone number and message are required'
      });
    }

    const provider = await _resolveWhatsappProvider(userId);
    console.log(`📱 sendWhatsappText resolved provider: ${provider} for user ${userId}`);

    let result;
    if (provider === 'twilio') {
      const twilioService = require('../services/whatsapp.twilio.service');
      result = await twilioService.sendTextMessage(phoneNumber, message, userId);
    } else {
      const whatsappService = require('../services/whatsapp.service');
      result = await whatsappService.sendTextMessage(phoneNumber, message, userId);
    }

    return reply.send({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error sending WhatsApp text:', error);
    return reply.code(500).send({
      success: false,
      error: error.message || 'Failed to send WhatsApp message'
    });
  }
}

module.exports = {
  getWhatsappSettings,
  updateWhatsappSettings,
  testWhatsappConnection,
  getAllSettings,
  getWhatsappTemplates,
  sendWhatsappTemplate,
  sendWhatsappText
};