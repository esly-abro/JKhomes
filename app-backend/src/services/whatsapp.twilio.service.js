/**
 * WhatsApp Twilio Provider Service
 * Sends WhatsApp messages via Twilio's WhatsApp Business API
 * 
 * Advantages over Meta direct:
 * - No Meta Business verification needed
 * - Instant sandbox for testing
 * - Simple phone number setup
 * - Unified billing with voice/SMS
 */

const Organization = require('../models/organization.model');
const mongoose = require('mongoose');

/**
 * Get Twilio WhatsApp credentials for a tenant
 * Checks: Organization model → env vars
 */
async function getCredentials(userId) {
    // Try Organization model first
    if (userId) {
        try {
            // Match both String and ObjectId ownerId (Mixed type field)
            const ownerQuery = mongoose.Types.ObjectId.isValid(userId)
                ? { $in: [userId, new mongoose.Types.ObjectId(userId)] }
                : userId;
            let org = await Organization.findOne({ ownerId: ownerQuery, 'whatsapp.provider': 'twilio' });
            if (!org) {
                org = await Organization.findOne({ 'whatsapp.provider': 'twilio', 'whatsapp.enabled': true, 'whatsapp.isConnected': true });
            }

            if (org?.whatsapp?.twilioAccountSid && org?.whatsapp?.twilioAuthToken) {
                let sid, token;
                try {
                    sid = org.whatsapp.twilioAccountSid;
                    token = org.whatsapp.twilioAuthToken;
                } catch (e) {
                    console.warn('⚠️ Could not decrypt Twilio WhatsApp credentials');
                    sid = null;
                    token = null;
                }
                if (sid && token) {
                    console.log('📱 Using Twilio WhatsApp credentials from Organization:', org.name);
                    return {
                        accountSid: sid,
                        authToken: token,
                        whatsappNumber: org.whatsapp.twilioWhatsappNumber || process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER
                    };
                }
            }
        } catch (error) {
            console.warn('Could not fetch Twilio WhatsApp credentials from Organization:', error.message);
        }
    }

    // Fallback to env vars (use existing Twilio creds)
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;

    if (accountSid && authToken) {
        console.log('📱 Using Twilio WhatsApp credentials from environment');
        return { accountSid, authToken, whatsappNumber };
    }

    return null;
}

/**
 * Create a Twilio client for the given credentials
 */
function createClient(creds) {
    const twilio = require('twilio');
    return twilio(creds.accountSid, creds.authToken);
}

/**
 * Format phone number for Twilio WhatsApp (whatsapp:+XXXXXXXXXXX)
 * Indian numbers: 10 digits → +91XXXXXXXXXX
 * Already prefixed with 91 (12 digits): +91XXXXXXXXXX
 */
function formatPhone(phoneNumber) {
    let clean = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!clean.startsWith('+')) {
        // If 10 digits, it's a local Indian number — always prepend +91
        if (clean.length === 10) {
            clean = '+91' + clean;
        }
        // If 12 digits starting with 91, it already has the country code
        else if (clean.length === 12 && clean.startsWith('91')) {
            clean = '+' + clean;
        }
        // Otherwise just prepend + and hope it's correct
        else {
            clean = '+' + clean;
        }
    }
    return clean;
}

/**
 * Send a template message via Twilio WhatsApp
 * Twilio uses ContentSid for pre-approved templates
 * Also supports sending by template name using content variables
 */
async function sendTemplateMessage(phoneNumber, templateName, languageCode = 'en', components = [], userId = null) {
    try {
        const creds = await getCredentials(userId);
        if (!creds) throw new Error('Twilio WhatsApp credentials not configured');

        const client = createClient(creds);
        const to = `whatsapp:${formatPhone(phoneNumber)}`;
        const from = creds.whatsappNumber.startsWith('whatsapp:')
            ? creds.whatsappNumber
            : `whatsapp:${creds.whatsappNumber}`;

        // Build content variables from components (Meta format → Twilio format)
        const contentVariables = {};
        if (components && components.length > 0) {
            for (const comp of components) {
                if (comp.type === 'body' && comp.parameters) {
                    comp.parameters.forEach((param, idx) => {
                        contentVariables[String(idx + 1)] = param.text || param.value || '';
                    });
                }
            }
        }

        // Try to find the Content Template SID by name
        let messageSid;
        try {
            // Search for content template by friendly name
            const templates = await client.content.v1.contents.list({ limit: 100 });
            const match = templates.find(t =>
                t.friendlyName?.toLowerCase() === templateName.toLowerCase() ||
                t.friendlyName?.toLowerCase().replace(/[\s_-]/g, '') === templateName.toLowerCase().replace(/[\s_-]/g, '')
            );

            if (match) {
                // Send using Content SID
                const msgOptions = {
                    from,
                    to,
                    contentSid: match.sid,
                };
                if (Object.keys(contentVariables).length > 0) {
                    msgOptions.contentVariables = JSON.stringify(contentVariables);
                }
                const result = await client.messages.create(msgOptions);
                messageSid = result.sid;
            } else {
                // Fallback: send as text with template name reference
                console.warn(`⚠️ Twilio Content Template "${templateName}" not found, sending as text`);
                const result = await client.messages.create({
                    from,
                    to,
                    body: `[Template: ${templateName}] — Please create this as a Twilio Content Template for full functionality.`
                });
                messageSid = result.sid;
            }
        } catch (contentErr) {
            // Content API may not be available on all accounts — fallback to plain message
            console.warn('⚠️ Twilio Content API not accessible, sending as text:', contentErr.message);
            const result = await client.messages.create({
                from,
                to,
                body: `[Template: ${templateName}]`
            });
            messageSid = result.sid;
        }

        console.log(`✅ Twilio WhatsApp template sent: ${messageSid}`);
        return {
            success: true,
            messageId: messageSid,
            provider: 'twilio'
        };
    } catch (error) {
        console.error('Error sending Twilio WhatsApp template:', error.message);
        throw error;
    }
}

/**
 * Send a text message via Twilio WhatsApp
 */
async function sendTextMessage(phoneNumber, message, userId = null) {
    try {
        const creds = await getCredentials(userId);
        if (!creds) throw new Error('Twilio WhatsApp credentials not configured');

        const client = createClient(creds);
        const to = `whatsapp:${formatPhone(phoneNumber)}`;
        const from = creds.whatsappNumber.startsWith('whatsapp:')
            ? creds.whatsappNumber
            : `whatsapp:${creds.whatsappNumber}`;

        const result = await client.messages.create({ from, to, body: message });

        console.log(`✅ Twilio WhatsApp text sent: ${result.sid}`);
        return {
            success: true,
            messageId: result.sid,
            provider: 'twilio'
        };
    } catch (error) {
        console.error('Error sending Twilio WhatsApp text:', error.message);
        throw error;
    }
}

/**
 * Send interactive message with buttons via Twilio WhatsApp
 * Twilio uses Content Templates for interactive messages
 * Falls back to numbered-option text if no content template exists
 */
async function sendInteractiveMessage(phoneNumber, bodyText, buttons, userId = null) {
    try {
        const creds = await getCredentials(userId);
        if (!creds) throw new Error('Twilio WhatsApp credentials not configured');

        const client = createClient(creds);
        const to = `whatsapp:${formatPhone(phoneNumber)}`;
        const from = creds.whatsappNumber.startsWith('whatsapp:')
            ? creds.whatsappNumber
            : `whatsapp:${creds.whatsappNumber}`;

        // Twilio doesn't support inline interactive buttons like Meta does.
        // Options: 1) Use Content Template with buttons, 2) Simulate with numbered text
        // We simulate with numbered options for maximum compatibility
        const buttonList = buttons.slice(0, 3).map((btn, i) => `${i + 1}. ${btn.text}`).join('\n');
        const fullMessage = `${bodyText}\n\n${buttonList}\n\nReply with the number of your choice.`;

        const result = await client.messages.create({ from, to, body: fullMessage });

        console.log(`✅ Twilio WhatsApp interactive sent: ${result.sid}`);
        return {
            success: true,
            messageId: result.sid,
            provider: 'twilio'
        };
    } catch (error) {
        console.error('Error sending Twilio WhatsApp interactive:', error.message);
        throw error;
    }
}

/**
 * Get WhatsApp templates from Twilio Content API
 */
async function getTemplates(userId = null) {
    try {
        const creds = await getCredentials(userId);
        if (!creds) throw new Error('Twilio WhatsApp credentials not configured');

        const client = createClient(creds);

        // Fetch content templates from Twilio Content API
        const contents = await client.content.v1.contents.list({ limit: 100 });

        // Filter for WhatsApp-compatible content templates
        const templates = contents
            .filter(c => c.types && (c.types['twilio/text'] || c.types['twilio/quick-reply'] || c.types['twilio/card']))
            .map(c => {
                const buttons = [];
                const components = [];

                // Extract body text from twilio/text or twilio/quick-reply
                const textBody = c.types['twilio/text']?.body
                    || c.types['twilio/quick-reply']?.body
                    || c.types['twilio/card']?.body
                    || '';

                if (textBody) {
                    components.push({ type: 'BODY', text: textBody });
                }

                // Extract title from card type as header
                if (c.types['twilio/card']?.title) {
                    components.push({ type: 'HEADER', text: c.types['twilio/card'].title });
                }

                // Extract quick-reply actions
                if (c.types['twilio/quick-reply']?.actions) {
                    for (const action of c.types['twilio/quick-reply'].actions) {
                        buttons.push({
                            type: 'QUICK_REPLY',
                            text: action.title || action.id,
                            payload: action.id
                        });
                    }
                }

                return {
                    id: c.sid,
                    name: c.friendlyName,
                    status: 'APPROVED', // Twilio only shows approved content
                    category: 'UTILITY',
                    language: c.language || 'en',
                    components,
                    buttons
                };
            });

        return templates;
    } catch (error) {
        console.error('Error fetching Twilio WhatsApp templates:', error.message);
        // Return empty array instead of throwing — allows graceful fallback
        return [];
    }
}

/**
 * Check if Twilio WhatsApp credentials are configured
 */
async function checkCredentialsConfigured(userId = null) {
    try {
        const creds = await getCredentials(userId);
        if (creds) {
            return {
                configured: true,
                source: userId ? 'database' : 'environment',
                needsSetup: false,
                provider: 'twilio'
            };
        }
        return {
            configured: false,
            source: null,
            needsSetup: true,
            provider: 'twilio',
            message: 'Twilio WhatsApp credentials not configured. Go to Settings > API Settings to add your Twilio credentials.'
        };
    } catch (error) {
        return {
            configured: false,
            source: null,
            needsSetup: true,
            provider: 'twilio',
            message: error.message
        };
    }
}

/**
 * Validate Twilio WhatsApp credentials by making a test API call
 */
async function validateCredentials(userId = null) {
    try {
        const creds = await getCredentials(userId);
        if (!creds) {
            return { valid: false, error: 'Missing Twilio credentials' };
        }

        const client = createClient(creds);
        const account = await client.api.accounts(creds.accountSid).fetch();

        return {
            valid: true,
            accountName: account.friendlyName,
            accountStatus: account.status,
            whatsappNumber: creds.whatsappNumber,
            provider: 'twilio'
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message,
            provider: 'twilio'
        };
    }
}

module.exports = {
    getTemplates,
    sendTemplateMessage,
    sendTextMessage,
    sendInteractiveMessage,
    checkCredentialsConfigured,
    validateCredentials,
    getCredentials,
    formatPhone
};
