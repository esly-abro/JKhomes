# Twilio + ElevenLabs Integration Setup

## Required Environment Variables

Add these to your `.env` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+17655076878

# Server URL (for webhooks)
SERVER_URL=https://your-ngrok-url.ngrok.io
```

## Setup Steps

### 1. Get Twilio Credentials

1. Go to [Twilio Console](https://console.twilio.com/)
2. Copy your **Account SID** and **Auth Token**
3. Verify your phone number (+1 765 507 6878) is active in Twilio

### 2. Expose Local Server with ngrok

Since Twilio needs to send webhooks to your server, you need to expose it publicly:

```bash
# Install ngrok if you haven't
# Download from: https://ngrok.com/download

# Start ngrok on port 3000
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`) and add it to `.env` as `SERVER_URL`

### 3. Update .env File

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+17655076878
SERVER_URL=https://your-ngrok-url.ngrok.io

# Keep existing ElevenLabs config
ELEVENLABS_API_KEY=sk_90e4e41a67b86e10d3a2854708e107c93b5638df5947efeb
ELEVENLABS_AGENT_ID=agent_0301ke9hxqhmfd98ery3wcy87h8v
ELEVENLABS_PHONE_NUMBER_ID=phnum_7001kffsx593ea7bbgvpgfmtgd
```

### 4. Restart Backend

```bash
cd zoho-lead-backend
node src/server.js
```

### 5. Test the Integration

Click the "AI Call Now" button in your dashboard. The flow will be:

1. Frontend → Backend `/elevenlabs/call`
2. Backend → Twilio API (initiates call)
3. Twilio → Calls the lead's phone
4. Twilio → Connects to your WebSocket endpoint
5. Your Server → Streams audio to/from ElevenLabs
6. ElevenLabs Agent → Handles the conversation

## How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Frontend  │────────▶│   Backend    │────────▶│   Twilio    │
│  Dashboard  │  HTTP   │ (Your Server)│   API   │     API     │
└─────────────┘         └──────────────┘         └─────────────┘
                               │                        │
                               │                        │ Dials
                               │                        ▼
                               │                  ┌──────────┐
                               │                  │   Lead   │
                               │                  │  Phone   │
                               │                  └──────────┘
                               │                        │
                               │◀───────WebSocket───────┘
                               │   (Audio Stream)
                               │
                               │
                               ▼
                        ┌─────────────┐
                        │ ElevenLabs  │
                        │   Agent     │
                        │  WebSocket  │
                        └─────────────┘
```

## Troubleshooting

### "Twilio client not initialized"
- Check that `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are set in `.env`

### "Call failed: Unable to create record"
- Verify your Twilio phone number is active
- Check that you have sufficient Twilio credits

### "WebSocket connection failed"
- Ensure ngrok is running and `SERVER_URL` is correct
- Check that the URL uses HTTPS (not HTTP)

### "No audio in call"
- Verify ElevenLabs API key is correct
- Check that the agent ID is valid
- Look at server logs for WebSocket errors

## Testing Without Frontend

You can test the integration directly:

```bash
curl -X POST http://localhost:3000/elevenlabs/call \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+919876543210", "leadId": "test123", "leadName": "Test Lead"}'
```

## Next Steps

Once this is working:
1. Add Zoho CRM integration to update lead status
2. Implement call recording
3. Add conversation analytics
4. Handle call failures and retries
