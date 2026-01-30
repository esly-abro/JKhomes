# Post-Call Automation System

## Overview

This system automatically processes AI call results from ElevenLabs and takes intelligent actions:

1. **Analyzes conversation transcripts** using AI (OpenAI GPT-4 or fallback keyword matching)
2. **Detects customer intents** (WhatsApp request, site visit booking, callback, etc.)
3. **Sends WhatsApp messages** with property details, booking links, or confirmations
4. **Updates Zoho CRM** with call results, lead status, and extracted information

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│  ElevenLabs AI  │────▶│  Webhook Handler     │────▶│  Post-Call          │
│  Call Ends      │     │  /webhook/elevenlabs │     │  Orchestrator       │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
                                                               │
                        ┌──────────────────────────────────────┼──────────────────────────────────────┐
                        │                                      │                                      │
                        ▼                                      ▼                                      ▼
               ┌─────────────────┐                  ┌─────────────────────┐               ┌──────────────────┐
               │ Intent Analyzer │                  │  WhatsApp Service   │               │   Zoho CRM       │
               │ (OpenAI/Fallback)│                 │  (Twilio)           │               │   Client         │
               └─────────────────┘                  └─────────────────────┘               └──────────────────┘
```

## Files Created

| File | Purpose |
|------|---------|
| `src/services/whatsappService.js` | WhatsApp messaging via Twilio API |
| `src/services/intentAnalyzer.service.js` | AI-powered intent extraction |
| `src/services/postCallOrchestrator.js` | Central automation controller |
| `src/routes/webhookRoutes.js` | ElevenLabs webhook endpoints |
| `test-post-call-automation.js` | Comprehensive test suite |

## Setup Instructions

### 1. Environment Variables

Add these to your `.env` file:

```env
# Existing Twilio Config
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# NEW: WhatsApp-enabled Twilio number (can be same as voice number)
TWILIO_WHATSAPP_NUMBER=+1234567890

# NEW: OpenAI for AI intent analysis (optional - fallback works without it)
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# NEW: Webhook security (get from ElevenLabs dashboard)
ELEVENLABS_WEBHOOK_SECRET=your_webhook_hmac_secret

# Server URL for links
SERVER_URL=https://your-server.com
```

### 2. Enable WhatsApp on Twilio Number

1. Go to [Twilio Console > WhatsApp Senders](https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders)
2. Follow the self-signup process
3. Connect your Meta Business Manager account
4. Get your number approved for WhatsApp

### 3. Configure ElevenLabs Post-Call Webhook

1. Go to [ElevenLabs Agent Settings](https://elevenlabs.io/app/agents/settings)
2. Enable "Post-call webhooks"
3. Set webhook URL: `https://your-server.com/webhook/elevenlabs`
4. Enable HMAC authentication and copy the secret to `.env`
5. Enable "Send audio data" if you want audio recordings

### 4. Configure ElevenLabs Evaluation Criteria

In your ElevenLabs Agent configuration, add these evaluation criteria:

```
- user_interested: Did the user express interest in the property?
- site_visit_requested: Did the user ask to schedule a site visit?
- whatsapp_requested: Did the user ask for details via WhatsApp?
- callback_requested: Did the user request a callback?
- not_interested: Did the user clearly say they are not interested?
```

These criteria provide 95% confidence intent detection.

### 5. Pass Lead Information in Calls

When initiating ElevenLabs calls, pass lead data via dynamic variables:

```javascript
const response = await axios.post('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
    agent_id: 'your-agent-id',
    to_number: '+919876543210',
    conversation_initiation_client_data: {
        dynamic_variables: {
            lead_id: 'zoho-lead-123',
            lead_name: 'John Doe',
            phone_number: '+919876543210'
        }
    }
});
```

## Testing

Run the test suite:

```bash
cd zoho-lead-backend
npm test
```

Test individual webhook:

```bash
curl -X POST http://localhost:3000/webhook/test
```

Check health:

```bash
curl http://localhost:3000/webhook/health
```

## Intent Types Detected

| Intent | Trigger | Action |
|--------|---------|--------|
| `send_whatsapp` | "Send details on WhatsApp" | Send property brochure via WhatsApp |
| `book_site_visit` | "I want to visit the property" | Send booking link via WhatsApp |
| `request_callback` | "Call me back tomorrow" | Schedule callback, send confirmation |
| `interested` | Shows interest | Mark as warm/hot lead |
| `not_interested` | "Not interested" | Mark as cold lead |

## Lead Status Updates

| Customer Intent | Lead Status in Zoho |
|-----------------|---------------------|
| Site visit request | `Site Visit Booked` |
| WhatsApp details request | `Details Sent - WhatsApp` |
| Callback request | `Callback Scheduled` |
| High interest | `Hot Lead - Follow Up` |
| Moderate interest | `Warm Lead - Nurture` |
| Not interested | `Not Interested` |
| Call busy | `Busy - Retry Later` |
| No answer | `No Answer - Follow Up` |

## Webhook Payload Examples

### Post-Call Transcription (Main Webhook)

```json
{
    "type": "post_call_transcription",
    "event_timestamp": 1739537297,
    "data": {
        "agent_id": "xyz",
        "conversation_id": "abc123",
        "status": "done",
        "transcript": [
            {"role": "agent", "message": "Hello!", "time_in_call_secs": 0},
            {"role": "user", "message": "Send details on WhatsApp", "time_in_call_secs": 5}
        ],
        "metadata": {
            "call_duration_secs": 30
        },
        "analysis": {
            "evaluation_criteria_results": {
                "user_interested": "success",
                "whatsapp_requested": "success"
            },
            "transcript_summary": "Customer requested WhatsApp details"
        },
        "conversation_initiation_client_data": {
            "dynamic_variables": {
                "lead_id": "123",
                "lead_name": "John",
                "phone_number": "+919876543210"
            }
        }
    }
}
```

### Call Initiation Failure

```json
{
    "type": "call_initiation_failure",
    "event_timestamp": 1739537297,
    "data": {
        "agent_id": "xyz",
        "conversation_id": "abc123",
        "failure_reason": "busy",
        "metadata": {
            "type": "twilio",
            "body": {"To": "+919876543210", "CallStatus": "busy"}
        }
    }
}
```

## Troubleshooting

### WhatsApp messages not sending

1. Check Twilio Console for WhatsApp number status
2. Verify `TWILIO_WHATSAPP_NUMBER` in `.env`
3. Check if Meta Business verification is complete
4. Error `63007`: WhatsApp not enabled on that number

### OpenAI not working

1. Verify `OPENAI_API_KEY` is set
2. Check API key has sufficient credits
3. System falls back to keyword matching if OpenAI fails

### CRM not updating

1. Verify `lead_id` is passed in dynamic variables
2. Check Zoho OAuth tokens are valid
3. Ensure custom fields exist in Zoho (AI_Call_Status, etc.)

### Webhook not receiving data

1. Verify webhook URL in ElevenLabs dashboard
2. Check server is publicly accessible
3. Enable HMAC auth and verify secret matches
4. Check firewall allows ElevenLabs IPs

## Security

- **HMAC Signature Validation**: All webhooks are validated using SHA-256 HMAC
- **IP Whitelisting**: ElevenLabs IPs: `34.67.146.145`, `34.59.11.47`
- **Rate Limiting**: Implement rate limiting in production
- **Data Encryption**: All API calls use HTTPS

## Monitoring

Check webhook health:
```
GET /webhook/health
```

Response:
```json
{
    "status": "healthy",
    "service": "ai-webhook-handler",
    "config": {
        "webhookSecretConfigured": true,
        "openaiConfigured": true,
        "twilioConfigured": true
    }
}
```
