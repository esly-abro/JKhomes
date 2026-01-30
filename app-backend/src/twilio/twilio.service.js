const twilio = require('twilio');
const CallLog = require('../models/CallLog');
const Activity = require('../models/Activity');
const zohoSyncService = require('../sync/zoho.sync.service');

// Twilio credentials - MUST be set in environment variables
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID;
const TWILIO_API_KEY_SID = process.env.TWILIO_API_KEY_SID;
const TWILIO_API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;

// Validate required environment variables
if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.warn('Warning: Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
}

// Initialize Twilio client (only if credentials are available)
const client = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN 
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// Generate Access Token for browser-based calling
function generateAccessToken(identity = 'agent') {
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const accessToken = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    { identity: identity }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: true,
  });

  accessToken.addGrant(voiceGrant);

  return accessToken.toJwt();
}

// Make an outbound call
async function makeCall(toNumber, fromNumber = TWILIO_PHONE_NUMBER, userId = null, leadId = null, leadName = null) {
  try {
    // Clean the phone number
    let cleanNumber = toNumber.replace(/[\s\-\(\)]/g, '');
    
    // Add country code if not present (assume India)
    if (!cleanNumber.startsWith('+')) {
      if (cleanNumber.startsWith('91')) {
        cleanNumber = '+' + cleanNumber;
      } else {
        cleanNumber = '+91' + cleanNumber;
      }
    }

    const call = await client.calls.create({
      url: `${process.env.APP_BACKEND_URL || 'http://localhost:4000'}/api/twilio/voice`,
      statusCallback: `${process.env.APP_BACKEND_URL || 'http://localhost:4000'}/api/twilio/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      to: cleanNumber,
      from: fromNumber,
    });

    // Create CallLog entry in MongoDB
    const callLog = await CallLog.create({
      callSid: call.sid,
      userId: userId,
      leadId: leadId,
      leadName: leadName,
      phoneNumber: cleanNumber,
      direction: 'outbound',
      status: call.status,
      startTime: new Date(),
      syncStatus: 'pending',
    });

    // Create Activity entry linked to this call
    if (userId) {
      await Activity.create({
        userId: userId,
        leadId: leadId,
        leadName: leadName,
        type: 'call',
        description: `Outbound call to ${leadName || cleanNumber}`,
        metadata: {
          callSid: call.sid,
          callLogId: callLog._id.toString(),
          phoneNumber: cleanNumber,
          direction: 'outbound',
        },
        syncStatus: 'pending',
      });
    }

    return {
      success: true,
      callSid: call.sid,
      callLogId: callLog._id.toString(),
      status: call.status,
      to: cleanNumber,
      from: fromNumber,
    };
  } catch (error) {
    console.error('Twilio call error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Get call status
async function getCallStatus(callSid) {
  try {
    const call = await client.calls(callSid).fetch();
    return {
      success: true,
      status: call.status,
      duration: call.duration,
      startTime: call.startTime,
      endTime: call.endTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Get call history
async function getCallHistory(limit = 20) {
  try {
    const calls = await client.calls.list({ limit });
    return {
      success: true,
      calls: calls.map(call => ({
        sid: call.sid,
        to: call.to,
        from: call.from,
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        direction: call.direction,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// Update call status from Twilio webhook
async function updateCallStatus(callSid, status, duration = null, endTime = null) {
  try {
    const updateData = { status };
    
    if (duration !== null) {
      updateData.duration = parseInt(duration);
    }
    
    if (endTime) {
      updateData.endTime = new Date(endTime);
    }
    
    // If call is completed, mark as ready for Zoho sync
    if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed') {
      updateData.syncStatus = 'ready';
    }
    
    const callLog = await CallLog.findOneAndUpdate(
      { callSid },
      updateData,
      { new: true }
    );
    
    if (callLog) {
      // Update corresponding Activity
      await Activity.findOneAndUpdate(
        { 'metadata.callSid': callSid },
        { 
          $set: { 
            'metadata.status': status,
            'metadata.duration': duration,
            syncStatus: status === 'completed' ? 'ready' : 'pending',
          }
        }
      );
      
      // Trigger Zoho sync for completed calls (fire-and-forget)
      if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed') {
        // Sync asynchronously without blocking the webhook response
        zohoSyncService.syncCallLogToZoho(callLog._id)
          .then(result => {
            if (result.success) {
              console.log(`✓ Auto-synced CallLog ${callLog._id} to Zoho`);
            } else {
              console.log(`⚠ Failed to auto-sync CallLog ${callLog._id}: ${result.error}`);
            }
          })
          .catch(error => {
            console.error(`Error in auto-sync for CallLog ${callLog._id}:`, error);
          });
      }
    }
    
    return {
      success: true,
      callLog,
    };
  } catch (error) {
    console.error('Error updating call status:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Send WhatsApp message via Twilio
async function sendWhatsApp(toNumber, message) {
  try {
    if (!client) {
      console.warn('Twilio client not initialized - simulating WhatsApp send');
      return { sid: 'simulated-' + Date.now(), status: 'simulated' };
    }

    // Clean the phone number
    let cleanNumber = toNumber.replace(/[\s\-\(\)]/g, '');
    if (!cleanNumber.startsWith('+')) {
      if (cleanNumber.startsWith('91')) {
        cleanNumber = '+' + cleanNumber;
      } else {
        cleanNumber = '+91' + cleanNumber;
      }
    }

    // Twilio WhatsApp format: whatsapp:+1234567890
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || `whatsapp:${TWILIO_PHONE_NUMBER}`;
    
    const result = await client.messages.create({
      body: message,
      from: whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`,
      to: `whatsapp:${cleanNumber}`
    });

    console.log(`✓ WhatsApp sent to ${cleanNumber}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    throw error;
  }
}

// Send SMS via Twilio
async function sendSMS(toNumber, message) {
  try {
    if (!client) {
      console.warn('Twilio client not initialized - simulating SMS send');
      return { sid: 'simulated-' + Date.now(), status: 'simulated' };
    }

    // Clean the phone number
    let cleanNumber = toNumber.replace(/[\s\-\(\)]/g, '');
    if (!cleanNumber.startsWith('+')) {
      if (cleanNumber.startsWith('91')) {
        cleanNumber = '+' + cleanNumber;
      } else {
        cleanNumber = '+91' + cleanNumber;
      }
    }

    const result = await client.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: cleanNumber
    });

    console.log(`✓ SMS sent to ${cleanNumber}: ${result.sid}`);
    return result;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

module.exports = {
  generateAccessToken,
  makeCall,
  getCallStatus,
  getCallHistory,
  updateCallStatus,
  sendWhatsApp,
  sendSMS,
  TWILIO_PHONE_NUMBER,
};
