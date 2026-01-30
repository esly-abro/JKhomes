# ElevenLabs Setup - Final Steps

## ✅ Backend Code Updated

The backend is now configured to use the ElevenLabs `register-call` API endpoint. This is simpler and works with your existing Twilio phone number in ElevenLabs.

## 🎯 Next Steps (Do These Now)

### Step 1: Publish Your Agent (CRITICAL!)

1. Go to: https://elevenlabs.io/app/agents/agent_0301ke9hxqhmfd98ery3wcy87h8v
2. Click **"Publish"** button (top right corner)
3. Add description: "Tamil female voice configuration"
4. Click **"Publish"**

**Why**: This activates your Tamil female voice. Right now calls use the old "Draft" version with male English voice.

### Step 2: Install ngrok

**Option A: Using Chocolatey (Recommended)**
```powershell
choco install ngrok
```

**Option B: Manual Download**
1. Download from: https://ngrok.com/download
2. Extract to `C:\ngrok`
3. Add to PATH or run from that folder

### Step 3: Start ngrok

Open a **NEW terminal window** and run:
```powershell
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123def456.ngrok-free.app -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123def456.ngrok-free.app`)

### Step 4: Update SERVER_URL

Run this helper script:
```powershell
cd zoho-lead-backend
node update-ngrok-url.js
```

Paste your ngrok URL when prompted.

**OR** manually edit `.env`:
```env
SERVER_URL=https://your-ngrok-url.ngrok-free.app
```

### Step 5: Restart Backend

```powershell
# Stop the current server (Ctrl+C)
# Then restart:
cd zoho-lead-backend
node src/server.js
```

### Step 6: Test!

1. Go to your dashboard
2. Click "AI Call Now" on any lead
3. Answer the call
4. You should hear the Tamil female voice!

## 🔍 Verification

### Check ngrok Dashboard
Open http://localhost:4040 in your browser to see all requests coming through ngrok.

### Check Server Logs
Look for:
```
Twilio call initiated
Calling ElevenLabs register-call endpoint
ElevenLabs register-call successful
```

### Test Call Flow
1. Call initiated → Twilio dials number
2. Call answered → Twilio requests TwiML
3. Backend calls ElevenLabs register-call
4. ElevenLabs returns TwiML with WebSocket
5. Agent starts conversation

## 🐛 Troubleshooting

### "Application error occurred"
- Check ngrok is running: `http://localhost:4040`
- Verify SERVER_URL in `.env` matches ngrok URL
- Restart backend after updating `.env`

### Wrong voice (male English)
- **Publish your agent** in ElevenLabs dashboard
- Wait 1-2 minutes for changes to propagate
- Try another test call

### "Register-call failed"
- Check ElevenLabs API key is correct
- Verify agent ID is valid
- Look at server logs for detailed error

## 📊 What Happens Now

```
Dashboard → Backend → Twilio API → Dials Lead
                                      ↓
                                   Answered
                                      ↓
                         Twilio → Backend /twiml
                                      ↓
                         Backend → ElevenLabs /register-call
                                      ↓
                         ElevenLabs → Returns TwiML
                                      ↓
                         Twilio → Connects to ElevenLabs WebSocket
                                      ↓
                         Agent → Handles Conversation
```

## 🎉 Success Criteria

✅ Agent published with Tamil female voice
✅ ngrok running and accessible
✅ SERVER_URL updated in `.env`
✅ Backend restarted
✅ Test call works with correct voice

---

**Start with Step 1 (Publish Agent) - this is the most important!**
