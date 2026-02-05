# Dynamic Credentials Setup for Automation

## Overview

The automation system has been updated to use **dynamic credentials** from the database instead of only environment variables. This means users can configure their API keys through the Settings UI, and automations will automatically use those credentials.

## How It Works

### 1. ElevenLabs (AI Calling)

**Configuration Location:** Organization model → `elevenLabs` field

**Fields:**
- `apiKey` - ElevenLabs API key (encrypted)
- `agentId` - Conversation AI Agent ID
- `phoneNumberId` - Twilio phone number ID for outbound calls
- `isConnected` - Connection status

**Setup Process:**
1. Navigate to Settings → Integrations → ElevenLabs
2. Enter your API Key and Agent ID
3. Click "Test Connection"
4. If successful, click "Save"

**Credential Priority:**
1. First, looks up Organization model by user ID
2. If `elevenLabs.isConnected = true` and `apiKey` exists, uses those
3. Falls back to environment variables (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`)

### 2. WhatsApp (Meta Business API)

**Configuration Location:** Settings model → `whatsapp` field

**Fields:**
- `accessToken` - Meta Graph API access token
- `phoneNumberId` - WhatsApp phone number ID
- `businessAccountId` - WhatsApp Business Account ID
- `enabled` - Whether WhatsApp is enabled

**Setup Process:**
1. Navigate to Settings → WhatsApp
2. Enter your Access Token, Phone Number ID, and Business Account ID
3. Click "Test Connection"
4. Toggle "Enable WhatsApp"
5. Click "Save"

**Credential Priority:**
1. First, looks up Settings model by user ID
2. If `whatsapp.enabled = true` and `accessToken` exists, uses those
3. Falls back to environment variables (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`)

## Updated Files

### Services

| File | Changes |
|------|---------|
| `elevenLabs.service.js` | Added `getCredentials(userId)` method, updated `makeCall()` and `syncConversations()` |
| `whatsapp.service.js` | Added `getCredentials(userId)` method, updated all send methods |

### Controllers

| File | Changes |
|------|---------|
| `settings.controller.js` | Updated `getWhatsappTemplates()` and `sendWhatsappTemplate()` to pass userId |
| `elevenLabs.integration.controller.js` | Manages ElevenLabs config per organization |

### Workflow Engine

| Method | Changes |
|--------|---------|
| `executeWhatsApp()` | Gets userId from context or lead, passes to WhatsApp service |
| `executeAICall()` | Gets userId from lead.assignedTo or automation.createdBy, passes to ElevenLabs |
| `executeAICallWithResponse()` | Same as above, now passes userId for dynamic credentials |

## API Endpoints

### ElevenLabs Configuration

```
GET    /api/integrations/elevenlabs/config     - Get current config (masked)
POST   /api/integrations/elevenlabs/config     - Save credentials
POST   /api/integrations/elevenlabs/test       - Test connection
DELETE /api/integrations/elevenlabs/disconnect - Remove credentials
```

### WhatsApp Configuration

```
GET    /api/settings/whatsapp           - Get WhatsApp settings
POST   /api/settings/whatsapp           - Update WhatsApp settings
POST   /api/settings/whatsapp/test      - Test connection
GET    /api/settings/whatsapp/templates - Get available templates
POST   /api/settings/whatsapp/send      - Send template message
```

## Testing the Setup

### Test ElevenLabs Integration

1. Configure ElevenLabs in Settings
2. Create an automation with an "AI Call" node
3. Assign a lead with a phone number
4. Run the automation
5. Check logs for: `📞 Using organization-specific ElevenLabs credentials`

### Test WhatsApp Integration

1. Configure WhatsApp in Settings
2. Create an automation with a "WhatsApp" node
3. Assign a lead with a phone number
4. Run the automation
5. Check logs for: `📱 Using WhatsApp credentials from database for user: <userId>`

## Fallback Behavior

If database credentials are not configured:
- ElevenLabs: Falls back to `ELEVENLABS_*` environment variables
- WhatsApp: Falls back to `WHATSAPP_*` environment variables

If neither database nor environment variables are configured:
- ElevenLabs: Call is simulated (logged but not executed)
- WhatsApp: Returns error "WhatsApp credentials not configured"

## Environment Variables (Fallback)

```env
# ElevenLabs
ELEVENLABS_API_KEY=your_api_key_here
ELEVENLABS_AGENT_ID=agent_xxxxx
ELEVENLABS_PHONE_NUMBER_ID=phnum_xxxxx

# WhatsApp
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_BUSINESS_ACCOUNT_ID=987654321
```

## Security Notes

1. **Encryption**: ElevenLabs API keys are encrypted using AES-256-CBC before storage
2. **Masking**: API keys are masked when returned via GET endpoints
3. **User Isolation**: Each user's credentials are stored separately and only accessible by them
4. **Fallback Security**: Even without database credentials, env vars provide a working fallback

---

Last updated: 2025-01-XX
