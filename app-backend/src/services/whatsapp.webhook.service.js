/**
 * WhatsApp Webhook Service
 * Handles incoming WhatsApp messages and button responses from Meta webhook
 * Integrates with workflow engine to continue automations based on user responses
 */

const crypto = require('crypto');
const AutomationRun = require('../models/AutomationRun');
const Lead = require('../models/Lead');
const workflowEngine = require('./workflow.engine');

// Get webhook verification token from environment
const getVerifyToken = () => {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN || 'jk_construction_webhook_token';
};

// Get app secret for signature verification
const getAppSecret = () => {
  return process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
};

/**
 * Verify Meta webhook signature
 * @param {string} signature - X-Hub-Signature-256 header value
 * @param {string} payload - Raw request body as string
 * @returns {boolean} - True if signature is valid
 */
function verifySignature(signature, payload) {
  const appSecret = getAppSecret();
  
  // If no app secret configured, skip verification (development mode)
  if (!appSecret) {
    console.warn('⚠️ WHATSAPP_APP_SECRET not configured - skipping signature verification');
    return true;
  }
  
  if (!signature) {
    console.error('❌ No signature provided in webhook request');
    return false;
  }
  
  // Remove 'sha256=' prefix
  const expectedSignature = signature.replace('sha256=', '');
  
  // Calculate HMAC SHA256
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(payload, 'utf8');
  const calculatedSignature = hmac.digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(calculatedSignature, 'hex')
    );
  } catch (error) {
    console.error('❌ Signature verification error:', error.message);
    return false;
  }
}

/**
 * Verify webhook challenge for Meta webhook registration
 * @param {object} query - Request query parameters
 * @returns {object} - { valid: boolean, challenge: string }
 */
function verifyWebhookChallenge(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];
  
  const expectedToken = getVerifyToken();
  
  if (mode === 'subscribe' && token === expectedToken) {
    console.log('✅ WhatsApp webhook verified successfully');
    return { valid: true, challenge };
  }
  
  console.error('❌ WhatsApp webhook verification failed', { mode, token, expectedToken });
  return { valid: false, challenge: null };
}

/**
 * Parse incoming webhook payload from Meta
 * Extracts message details, button clicks, etc.
 * @param {object} payload - Webhook payload from Meta
 * @returns {object[]} - Array of parsed messages
 */
function parseWebhookPayload(payload) {
  const messages = [];
  
  try {
    // Navigate Meta's webhook structure
    const entry = payload.entry?.[0];
    if (!entry) return messages;
    
    const changes = entry.changes?.[0];
    if (!changes || changes.field !== 'messages') return messages;
    
    const value = changes.value;
    if (!value) return messages;
    
    // Get metadata
    const metadata = value.metadata || {};
    const phoneNumberId = metadata.phone_number_id;
    const displayPhone = metadata.display_phone_number;
    
    // Get contacts info
    const contacts = value.contacts || [];
    const contact = contacts[0] || {};
    
    // Process each message
    const rawMessages = value.messages || [];
    
    for (const msg of rawMessages) {
      const parsed = {
        messageId: msg.id,
        from: msg.from,  // Sender's phone number
        timestamp: msg.timestamp,
        type: msg.type,
        contactName: contact.profile?.name,
        contactWaId: contact.wa_id,
        phoneNumberId,
        displayPhone,
        raw: msg
      };
      
      // Parse based on message type
      switch (msg.type) {
        case 'text':
          parsed.text = msg.text?.body;
          parsed.value = msg.text?.body;
          break;
          
        case 'button':
          // Quick reply button response
          parsed.buttonPayload = msg.button?.payload;
          parsed.buttonText = msg.button?.text;
          parsed.value = msg.button?.payload || msg.button?.text;
          break;
          
        case 'interactive':
          // Interactive message response (button reply or list reply)
          if (msg.interactive?.type === 'button_reply') {
            parsed.buttonPayload = msg.interactive.button_reply?.id;
            parsed.buttonText = msg.interactive.button_reply?.title;
            parsed.value = msg.interactive.button_reply?.id;
          } else if (msg.interactive?.type === 'list_reply') {
            parsed.listReplyId = msg.interactive.list_reply?.id;
            parsed.listReplyTitle = msg.interactive.list_reply?.title;
            parsed.listReplyDescription = msg.interactive.list_reply?.description;
            parsed.value = msg.interactive.list_reply?.id;
          }
          break;
          
        case 'image':
          parsed.mediaId = msg.image?.id;
          parsed.mimeType = msg.image?.mime_type;
          parsed.caption = msg.image?.caption;
          parsed.value = msg.image?.caption || '[Image]';
          break;
          
        case 'document':
          parsed.mediaId = msg.document?.id;
          parsed.mimeType = msg.document?.mime_type;
          parsed.filename = msg.document?.filename;
          parsed.caption = msg.document?.caption;
          parsed.value = msg.document?.filename || '[Document]';
          break;
          
        case 'audio':
          parsed.mediaId = msg.audio?.id;
          parsed.mimeType = msg.audio?.mime_type;
          parsed.value = '[Audio]';
          break;
          
        case 'video':
          parsed.mediaId = msg.video?.id;
          parsed.mimeType = msg.video?.mime_type;
          parsed.caption = msg.video?.caption;
          parsed.value = msg.video?.caption || '[Video]';
          break;
          
        case 'location':
          parsed.latitude = msg.location?.latitude;
          parsed.longitude = msg.location?.longitude;
          parsed.locationName = msg.location?.name;
          parsed.locationAddress = msg.location?.address;
          parsed.value = `[Location: ${msg.location?.name || msg.location?.address || 'Unknown'}]`;
          break;
          
        case 'reaction':
          parsed.reaction = msg.reaction?.emoji;
          parsed.reactedMessageId = msg.reaction?.message_id;
          parsed.value = msg.reaction?.emoji;
          break;
          
        default:
          parsed.value = `[${msg.type}]`;
      }
      
      messages.push(parsed);
    }
    
    // Also check for status updates (delivered, read, etc.)
    const statuses = value.statuses || [];
    for (const status of statuses) {
      messages.push({
        type: 'status',
        messageId: status.id,
        recipientId: status.recipient_id,
        status: status.status,  // 'sent', 'delivered', 'read', 'failed'
        timestamp: status.timestamp,
        conversationId: status.conversation?.id,
        pricingModel: status.pricing?.pricing_model,
        isStatusUpdate: true
      });
    }
    
  } catch (error) {
    console.error('❌ Error parsing webhook payload:', error);
  }
  
  return messages;
}

/**
 * Find a lead by phone number
 * @param {string} phoneNumber - Phone number to search
 * @returns {object|null} - Lead document or null
 */
async function findLeadByPhone(phoneNumber) {
  // Normalize phone number for search
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
  
  // Try multiple formats
  const phoneVariants = [
    normalizedPhone,
    normalizedPhone.startsWith('+') ? normalizedPhone.substring(1) : `+${normalizedPhone}`,
    normalizedPhone.startsWith('91') ? normalizedPhone.substring(2) : `91${normalizedPhone}`,
    normalizedPhone.startsWith('+91') ? normalizedPhone.substring(3) : null
  ].filter(Boolean);
  
  // Search with regex to be flexible
  const lead = await Lead.findOne({
    $or: phoneVariants.map(phone => ({
      phone: { $regex: phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    }))
  });
  
  return lead;
}

/**
 * Process an incoming WhatsApp message/response
 * Matches it to any waiting automation and resumes the workflow
 * @param {object} parsedMessage - Parsed message from parseWebhookPayload
 * @returns {object} - Processing result
 */
async function processIncomingMessage(parsedMessage) {
  try {
    // Skip status updates for automation processing
    if (parsedMessage.isStatusUpdate) {
      console.log(`📊 WhatsApp status update: ${parsedMessage.status} for message ${parsedMessage.messageId}`);
      
      // Update lead's WhatsApp status if we can find the lead
      if (parsedMessage.status === 'delivered' || parsedMessage.status === 'read') {
        // Could update lead.whatsappStatus here if needed
      }
      
      return { processed: true, type: 'status_update', status: parsedMessage.status };
    }
    
    console.log(`📩 Processing incoming WhatsApp message from ${parsedMessage.from}:`, {
      type: parsedMessage.type,
      value: parsedMessage.value
    });
    
    // Try to find a waiting automation run for this phone number
    const waitingRun = await AutomationRun.findWaitingForPhone(parsedMessage.from);
    
    if (waitingRun) {
      console.log(`✅ Found waiting automation run: ${waitingRun._id}`);
      
      // Resume the automation with the response
      const result = await workflowEngine.resumeFromResponse(waitingRun, parsedMessage);
      
      return {
        processed: true,
        type: 'automation_resumed',
        automationRunId: waitingRun._id,
        automationName: waitingRun.automation?.name,
        leadName: waitingRun.lead?.name,
        result
      };
    }
    
    // No waiting automation - try to find the lead and log the message
    const lead = await findLeadByPhone(parsedMessage.from);
    
    if (lead) {
      console.log(`📝 Message from known lead: ${lead.name}`);
      
      // Update lead's WhatsApp status
      lead.whatsappStatus = 'replied';
      lead.lastWhatsappAt = new Date();
      lead.lastContactAt = new Date();
      await lead.save();
      
      // Could create an activity/notification here
      // TODO: Create activity for incoming WhatsApp message
      
      return {
        processed: true,
        type: 'lead_message',
        leadId: lead._id,
        leadName: lead.name,
        message: parsedMessage.value
      };
    }
    
    // Unknown sender - could be a new lead
    console.log(`❓ Message from unknown number: ${parsedMessage.from}`);
    
    return {
      processed: true,
      type: 'unknown_sender',
      from: parsedMessage.from,
      message: parsedMessage.value
    };
    
  } catch (error) {
    console.error('❌ Error processing incoming message:', error);
    return {
      processed: false,
      error: error.message
    };
  }
}

/**
 * Handle the full webhook request
 * @param {object} payload - Raw webhook payload
 * @param {string} signature - X-Hub-Signature-256 header
 * @param {string} rawBody - Raw request body string
 * @returns {object} - Processing result
 */
async function handleWebhook(payload, signature, rawBody) {
  try {
    // Verify signature
    if (!verifySignature(signature, rawBody)) {
      return { success: false, error: 'Invalid signature' };
    }
    
    // Parse messages from payload
    const messages = parseWebhookPayload(payload);
    
    if (messages.length === 0) {
      console.log('📭 No messages in webhook payload');
      return { success: true, processed: 0 };
    }
    
    console.log(`📬 Processing ${messages.length} messages from webhook`);
    
    // Process each message
    const results = [];
    for (const message of messages) {
      const result = await processIncomingMessage(message);
      results.push(result);
    }
    
    return {
      success: true,
      processed: messages.length,
      results
    };
    
  } catch (error) {
    console.error('❌ Error handling webhook:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check and process timeout for waiting automations
 * Should be called periodically (e.g., by the workflow engine)
 */
async function processTimeouts() {
  try {
    // Find all runs that have timed out
    const timedOutRuns = await AutomationRun.find({
      status: 'waiting_for_response',
      'waitingForResponse.isWaiting': true,
      'waitingForResponse.timeoutAt': { $lte: new Date() }
    }).populate('lead').populate('automation');
    
    for (const run of timedOutRuns) {
      console.log(`⏰ Processing timeout for automation run: ${run._id}`);
      
      // Resume with timeout
      await workflowEngine.resumeFromTimeout(run);
    }
    
    return { processed: timedOutRuns.length };
    
  } catch (error) {
    console.error('❌ Error processing timeouts:', error);
    return { error: error.message };
  }
}

/**
 * Parse incoming Twilio WhatsApp webhook
 * Twilio sends a simpler x-www-form-urlencoded payload
 * 
 * For quick-reply template responses, Twilio sends the button text as Body.
 * For numbered replies (sandbox), it sends "1", "2", "3" etc.
 * @param {object} body - Parsed form body from Twilio
 * @returns {object[]} - Array of parsed messages (same format as Meta parser)
 */
function parseTwilioWebhook(body) {
  const messages = [];

  // Twilio sends: From, Body, MessageSid, NumMedia, ProfileName, etc.
  if (!body.From || !body.From.startsWith('whatsapp:')) return messages;

  const from = body.From.replace('whatsapp:', '');
  const messageBody = body.Body || '';
  const messageSid = body.MessageSid || '';

  // Determine if this is a button/quick-reply response
  // Twilio quick-reply buttons send the button text as Body
  // Check for numbered replies (sandbox: "1", "2", "3") or
  // ButtonText header (Twilio content templates send this)
  const isNumberedReply = /^[1-9]$/.test(messageBody.trim());
  const buttonText = body.ButtonText || (isNumberedReply ? messageBody.trim() : null);
  
  // Treat as button response if: numbered reply OR short text that looks like a button click
  const isButtonResponse = isNumberedReply || !!body.ButtonText;

  messages.push({
    messageId: messageSid,
    from: from,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    type: isButtonResponse ? 'button' : 'text',
    contactName: body.ProfileName || null,
    contactWaId: from,
    value: messageBody,
    text: messageBody,
    // buttonPayload: the actual button text (for matching against expected responses)
    buttonPayload: isButtonResponse ? messageBody : undefined,
    buttonText: messageBody,
    provider: 'twilio',
    raw: body
  });

  return messages;
}

/**
 * Handle Twilio WhatsApp webhook
 * @param {object} body - Request body from Twilio
 * @returns {object} - Processing result
 */
async function handleTwilioWebhook(body) {
  try {
    const messages = parseTwilioWebhook(body);
    if (messages.length === 0) {
      console.log('📭 No WhatsApp messages in Twilio webhook payload');
      return { success: true, processed: 0 };
    }

    console.log(`📬 Processing ${messages.length} Twilio WhatsApp messages`);
    const results = [];
    for (const message of messages) {
      const result = await processIncomingMessage(message);
      results.push(result);
    }

    return { success: true, processed: messages.length, results };
  } catch (error) {
    console.error('❌ Error handling Twilio webhook:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  verifySignature,
  verifyWebhookChallenge,
  parseWebhookPayload,
  processIncomingMessage,
  handleWebhook,
  processTimeouts,
  findLeadByPhone,
  getVerifyToken,
  // Twilio WhatsApp
  parseTwilioWebhook,
  handleTwilioWebhook
};
