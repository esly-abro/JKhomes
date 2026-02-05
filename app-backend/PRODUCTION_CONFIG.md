# Production Configuration Guide

This document describes all configuration options for the JK Construction Lead Management System.

## Environment Variables

### Core Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment: `development`, `production`, `test` |
| `PORT` | No | `3001` | HTTP port for the backend server |

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | Yes* | - | MongoDB connection string |

*Required for persistent storage. Without it, the app uses in-memory storage.

### Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | - | Secret key for JWT signing (min 32 chars recommended) |
| `JWT_EXPIRES_IN` | No | `24h` | Access token expiration |
| `JWT_REFRESH_SECRET` | Yes | - | Secret for refresh tokens |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiration |

### CORS Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origins (comma-separated) |

### Zoho CRM Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZOHO_CLIENT_ID` | No | - | Zoho OAuth client ID |
| `ZOHO_CLIENT_SECRET` | No | - | Zoho OAuth client secret |
| `ZOHO_REDIRECT_URI` | No | - | Zoho OAuth redirect URI |
| `ZOHO_REFRESH_TOKEN` | No | - | Zoho refresh token |
| `ZOHO_API_DOMAIN` | No | `https://www.zohoapis.in` | Zoho API domain |

### Twilio Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | No | - | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | No | - | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | No | - | Twilio phone number |
| `TWILIO_API_KEY` | No | - | Twilio API key (for client tokens) |
| `TWILIO_API_SECRET` | No | - | Twilio API secret |
| `TWILIO_TWIML_APP_SID` | No | - | Twilio TwiML app SID |

### ElevenLabs Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ELEVENLABS_API_KEY` | No | - | ElevenLabs API key |
| `ELEVENLABS_AGENT_ID` | No | - | ElevenLabs agent ID |
| `ELEVENLABS_PHONE_NUMBER_ID` | No | - | ElevenLabs phone number ID |
| `ELEVENLABS_WEBHOOK_SECRET` | No | - | Webhook signature secret |

### WhatsApp (Meta) Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | No | - | Meta WhatsApp access token |
| `WHATSAPP_PHONE_NUMBER_ID` | No | - | WhatsApp Business phone ID |
| `WHATSAPP_BUSINESS_ID` | No | - | WhatsApp Business account ID |
| `WHATSAPP_VERIFY_TOKEN` | No | - | Webhook verification token |

### Google Sheets Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | No | - | Google Sheets spreadsheet ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | No | - | Service account email |
| `GOOGLE_PRIVATE_KEY` | No | - | Service account private key |

### Email (SMTP)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SMTP_HOST` | No | - | SMTP server host |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASSWORD` | No | - | SMTP password |
| `EMAIL_FROM` | No | - | From email address |

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | Log level: `error`, `warn`, `info`, `debug` |
| `LOG_DIR` | No | `logs` | Directory for log files |

## Rate Limiting

The application includes built-in rate limiting:

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General API | 100 requests | 15 minutes |
| Authentication | 5 requests | 15 minutes |
| Voice Calls | 10 requests | 1 hour |
| Zoho Sync | 50 requests | 1 minute |
| WhatsApp | 100 messages | 1 minute |

## Security Headers

The following security headers are automatically applied:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (in production)
- `Content-Security-Policy` (basic policy)

## Health Check Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Basic health status |
| `GET /api/health/detailed` | Full system status (authed) |
| `GET /api/health/ready` | Kubernetes readiness probe |
| `GET /api/health/live` | Kubernetes liveness probe |

## Database Indexes

Run the index creation script for optimal performance:

```bash
node src/scripts/createIndexes.js
```

## Production Deployment Checklist

1. **Environment**
   - [ ] Set `NODE_ENV=production`
   - [ ] Use strong, unique `JWT_SECRET` and `JWT_REFRESH_SECRET`
   - [ ] Configure proper `CORS_ORIGIN`

2. **Database**
   - [ ] Use MongoDB replica set for high availability
   - [ ] Create indexes with `createIndexes.js`
   - [ ] Set up regular backups

3. **Security**
   - [ ] Enable HTTPS/TLS termination at load balancer
   - [ ] Rotate secrets regularly
   - [ ] Review rate limits for your traffic

4. **Monitoring**
   - [ ] Set up log aggregation (e.g., ELK stack)
   - [ ] Configure health check monitoring
   - [ ] Set up alerts for error rates

5. **Performance**
   - [ ] Configure proper connection pool size
   - [ ] Set up CDN for static assets
   - [ ] Enable gzip compression at proxy level
