# Using Twilio Functions Instead of ngrok

## Why Twilio Functions is Better

✅ **No ngrok needed** - Static URL that never changes
✅ **Production-ready** - Reliable and scalable
✅ **Simpler** - No local server exposure required
✅ **Free tier** - Included with Twilio account

## Setup Steps

### 1. Create Twilio Function

1. Go to [Twilio Console](https://console.twilio.com/us1/develop/functions/services)
2. Click **"Create Service"**
3. Name it: `elevenlabs-integration`
4. Click **"Next"**

### 2. Add the Function

1. Click **"Add +"** → **"Add Function"**
2. Name: `/elevenlabs-twiml`
3. Copy the code from `twilio-functions/elevenlabs-twiml.js`
4. Paste it into the function editor

### 3. Add Environment Variables

In the Twilio Function service, go to **"Environment Variables"**:

```
ELEVENLABS_API_KEY = sk_90e4e41a67b86e10d3a2854708e107c93b5638df5947efeb
ELEVENLABS_AGENT_ID = agent_6301kffy6jsxedasc60jmvj44py8
TWILIO_PHONE_NUMBER = +17655076878
```

### 4. Add Dependencies

In the **"Dependencies"** section, add:
```
axios = 1.6.0
```

### 5. Deploy

Click **"Deploy All"**

Your function will be available at:
```
https://your-service-name-1234.twil.io/elevenlabs-twiml
```

### 6. Update Backend Configuration

Update your `.env`:
```env
SERVER_URL=https://your-service-name-1234.twil.io
```

**OR** if you want to keep using your local backend for the `/call` endpoint but use Twilio Functions for TwiML:

Update `twilioElevenLabsService.js` line 44:
```javascript
const twimlUrl = `https://jk-9813.twil.io/elevenlabs-twiml?leadId=${leadId}&leadName=${encodeURIComponent(leadName || '')}&toNumber=${encodeURIComponent(toNumber)}`;
```

### 7. Test

Your backend `/elevenlabs/call` endpoint will:
1. Call Twilio API to initiate call
2. Twilio will request TwiML from your Twilio Function
3. Twilio Function calls ElevenLabs register-call
4. Call connects to agent

## Hybrid Approach (Recommended)

**Local Backend**: Handles `/elevenlabs/call` (initiates calls)
**Twilio Function**: Handles `/elevenlabs-twiml` (generates TwiML)

This way:
- You can develop locally
- No ngrok needed
- Production-ready TwiML endpoint

## Quick Setup

If you already have Twilio Functions at `https://jk-9813.twil.io`:

1. Add the `elevenlabs-twiml` function there
2. Update the backend to use that URL for TwiML
3. Done! No ngrok needed.

## Testing

```bash
# Test the Twilio Function directly
curl "https://jk-9813.twil.io/elevenlabs-twiml?toNumber=%2B916381143136"
```

Should return TwiML XML.

---

**This is the production-ready approach!** Much better than ngrok for long-term use.
