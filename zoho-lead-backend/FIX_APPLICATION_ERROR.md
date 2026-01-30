# Fixing "Application Error Occurred" Issue

## Problem

When you answer the call, you hear "an application error occurred" and the call cuts.

## Root Cause

The `SERVER_URL` in your `.env` is set to `https://jk-9813.twil.io`, which is a **Twilio Function URL**, not your backend server.

When Twilio tries to get TwiML instructions from:
```
https://jk-9813.twil.io/elevenlabs/twiml
```

It fails because your backend is running on `localhost:3000`, which Twilio cannot access.

## Solution: Use ngrok

You need to expose your local server (localhost:3000) to the internet so Twilio can reach it.

### Step 1: Install ngrok

**Windows:**
```powershell
# Using Chocolatey
choco install ngrok

# Or download from: https://ngrok.com/download
```

**Manual Install:**
1. Download from https://ngrok.com/download
2. Extract to a folder (e.g., `C:\ngrok`)
3. Add to PATH or run from that folder

### Step 2: Start ngrok

```powershell
# Run this in a NEW terminal window
ngrok http 3000
```

You'll see output like:
```
Session Status                online
Account                       your-account
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.ngrok-free.app -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123def456.ngrok-free.app`)

### Step 3: Update .env

Open `zoho-lead-backend/.env` and update:

```env
SERVER_URL=https://abc123def456.ngrok-free.app
```

Replace `abc123def456.ngrok-free.app` with YOUR ngrok URL.

### Step 4: Restart Backend

```powershell
cd zoho-lead-backend
node src/server.js
```

### Step 5: Test Again

Click "AI Call Now" in your dashboard. The call should now work!

## How to Verify ngrok is Working

1. **Check ngrok dashboard:**
   - Open http://localhost:4040 in your browser
   - You'll see all requests coming to your server

2. **Test the TwiML endpoint:**
   ```powershell
   curl https://your-ngrok-url.ngrok-free.app/elevenlabs/twiml
   ```
   
   Should return XML (TwiML)

## Important Notes

### Free ngrok Limitations
- URL changes every time you restart ngrok
- You'll need to update `.env` each time
- Limited to 40 connections/minute

### For Production
- Get a paid ngrok account (static URL)
- Or deploy to a cloud server (AWS, Heroku, etc.)
- Or use Twilio Functions (different approach)

## Quick Start Script

I'll create a script to help you set this up:

```powershell
# Run this after starting ngrok
node update-ngrok-url.js
```

This will:
1. Ask for your ngrok URL
2. Update `.env` automatically
3. Restart the server

## Troubleshooting

### "ngrok not found"
- Make sure ngrok is installed
- Add to PATH or run from installation folder

### "Still getting application error"
- Check ngrok is running (`http://localhost:4040`)
- Verify SERVER_URL in `.env` matches ngrok URL
- Restart backend after updating `.env`

### "Call connects but no audio"
- This is a different issue (WebSocket)
- Check ElevenLabs agent configuration
- Verify agent is published (not draft)

---

**Next Step:** Install and run ngrok, then update SERVER_URL
