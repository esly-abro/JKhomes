# Zoho CRM Lead Ingestion Backend

Production-ready Node.js backend service for ingesting leads from multiple sources and syncing with Zoho CRM (India data center).

## Features

✅ **Multi-Source Lead Ingestion** - Accept leads from Meta Ads, Google Ads, Website Forms, WhatsApp, and more  
✅ **Automatic Duplicate Prevention** - Email/phone-based duplicate detection  
✅ **OAuth Token Management** - Automatic token refresh with caching  
✅ **Data Normalization** - Transform any lead format to Zoho CRM schema  
✅ **Retry Logic** - Automatic retry on transient failures  
✅ **Production-Ready** - Proper error handling, logging, and monitoring  

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Zoho credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
ZOHO_CLIENT_ID=1000.YOUR_CLIENT_ID
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=1000.your_refresh_token
```

### 3. Run the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

Server starts on `http://localhost:3000`

---

## API Endpoints

### POST /leads
Create or update a lead in Zoho CRM.

**Request:**
```json
{
  "source": "meta_ads",
  "name": "Rajesh Kumar",
  "email": "rajesh@example.com",
  "phone": "9876543210",
  "company": "TechCorp",
  "extra": {
    "campaign": "Diwali Sale 2024",
    "ad_id": "123456"
  }
}
```

**Response (Created):**
```json
{
  "success": true,
  "action": "created",
  "leadId": "4876876000001234567",
  "message": "Lead created successfully"
}
```

**Response (Updated):**
```json
{
  "success": true,
  "action": "updated",
  "leadId": "4876876000001234567",
  "message": "Lead updated successfully",
  "matchedBy": "email"
}
```

### GET /leads/sources
Get list of valid source values.

**Response:**
```json
{
  "success": true,
  "sources": [
    "meta_ads",
    "google_ads",
    "website",
    "whatsapp",
    "linkedin",
    "referral"
  ],
  "count": 6
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-20T10:30:00.000Z",
  "nodejs": "v18.17.0",
  "token": {
    "isValid": true,
    "expiresAt": "2024-01-20T11:30:00.000Z"
  }
}
```

---

## Example Requests

### cURL Examples

**Create a new lead:**
```bash
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{
    "source": "meta_ads",
    "name": "Priya Sharma",
    "email": "priya@example.com",
    "phone": "9876543211",
    "extra": {
      "campaign": "New Year Sale",
      "ad_id": "789"
    }
  }'
```

**Test duplicate detection (use same email):**
```bash
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{
    "source": "website",
    "name": "Priya S",
    "email": "priya@example.com",
    "phone": "9999999999"
  }'
```

**Get valid sources:**
```bash
curl http://localhost:3000/leads/sources
```

---

## How It Works

### 1. Token Lifecycle

```
┌─────────────────────────────────────┐
│  Request → getAccessToken()         │
└──────────────┬──────────────────────┘
               │
         ┌─────┴─────┐
         │ Valid?    │
         └─────┬─────┘
               │
        ┌──────┴──────┐
        │             │
       YES           NO
        │             │
        │             ▼
        │    refreshAccessToken()
        │             │
        └──────┬──────┘
               │
               ▼
         Use Token
```

- **First Request:** No token cached → Refresh using refresh_token → Cache for 1 hour
- **Subsequent Requests:** Use cached token if valid
- **On 401 Error:** Clear cache → Refresh → Retry request
- **Automatic Expiry:** Refresh when token expires (60s buffer)

### 2. Duplicate Detection Logic

```
┌─────────────────────────────────────┐
│  Incoming Lead                      │
└──────────────┬──────────────────────┘
               │
               ▼
    ┌────────────────────┐
    │ Search by Email    │
    └────────┬───────────┘
             │
      ┌──────┴──────┐
      │ Found?      │
      └──────┬──────┘
             │
      ┌──────┴──────┐
      │             │
     YES           NO
      │             │
      │             ▼
      │    ┌────────────────┐
      │    │ Search by Phone│
      │    └────────┬───────┘
      │             │
      │      ┌──────┴──────┐
      │      │ Found?      │
      │      └──────┬──────┘
      │             │
      │      ┌──────┴──────┐
      │      │             │
      │     YES           NO
      │      │             │
      ├──────┘             │
      │                    │
      ▼                    ▼
 UPDATE Lead         CREATE Lead
```

**Priority:** Email match takes precedence over phone match.

### 3. Data Normalization

**Input (Any Format):**
```json
{
  "source": "meta_ads",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "9876543210"
}
```

**Output (Zoho Format):**
```json
{
  "Last_Name": "John Doe",
  "First_Name": "John",
  "Company": "Unknown",
  "Email": "john@example.com",
  "Phone": "+919876543210",
  "Mobile": "+919876543210",
  "Lead_Source": "Facebook"
}
```

---

## Source Mapping

| Input Source | Zoho Lead_Source |
|--------------|------------------|
| `meta_ads` | Facebook |
| `google_ads` | Google AdWords |
| `website` | Website |
| `whatsapp` | WhatsApp |
| `linkedin` | LinkedIn |
| `referral` | Employee Referral |
| `email` | External Referral |

Add more sources in `src/services/leadNormalizer.js`.

---

## Project Structure

```
zoho-lead-backend/
├── src/
│   ├── config/
│   │   └── config.js              # Environment config
│   ├── services/
│   │   ├── tokenManager.js        # OAuth token handling
│   │   ├── zohoClient.js          # Zoho API client
│   │   ├── leadNormalizer.js      # Data transformation
│   │   └── duplicateDetector.js   # Duplicate detection
│   ├── routes/
│   │   └── leads.js               # API routes
│   ├── middleware/
│   │   ├── errorHandler.js        # Error handling
│   │   └── logger.js              # Request logging
│   ├── utils/
│   │   └── logger.js              # Winston logger
│   └── server.js                  # Express app
├── logs/                          # Log files (auto-created)
├── .env                           # Environment variables
├── .env.example                   # Environment template
├── package.json
└── README.md
```

---

## Error Handling

### Validation Errors (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    "Name is required",
    "Either email or phone is required"
  ]
}
```

### Zoho API Errors (500)
```json
{
  "success": false,
  "error": "Failed to create lead in Zoho CRM",
  "code": "ZOHO_API_ERROR"
}
```

### Token Errors (500)
```json
{
  "success": false,
  "error": "Token refresh failed: invalid_refresh_token"
}
```

---

## Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Errors only
- **Console** - Development output

**Log Levels:**
- `error` - Critical errors
- `warn` - Warnings
- `info` - Important events (default)
- `debug` - Detailed debugging

Set in `.env`:
```env
LOG_LEVEL=info
```

---

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/server.js --name zoho-lead-backend

# Save PM2 config
pm2 save

# Setup auto-restart on reboot
pm2 startup
```

### Using Docker

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Build and run:
```bash
docker build -t zoho-lead-backend .
docker run -p 3000:3000 --env-file .env zoho-lead-backend
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3000 | Server port |
| `NODE_ENV` | No | development | Environment |
| `ZOHO_CLIENT_ID` | **Yes** | - | Zoho OAuth client ID |
| `ZOHO_CLIENT_SECRET` | **Yes** | - | Zoho OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | **Yes** | - | Zoho OAuth refresh token |
| `ZOHO_API_DOMAIN` | No | https://www.zohoapis.in | Zoho API domain (India) |
| `ZOHO_ACCOUNTS_URL` | No | https://accounts.zoho.in | Zoho accounts URL |
| `LOG_LEVEL` | No | info | Logging level |

---

## Testing

### Manual Testing Checklist

- [ ] Create lead with email only
- [ ] Create lead with phone only
- [ ] Create lead with both email and phone
- [ ] Test duplicate detection by email
- [ ] Test duplicate detection by phone
- [ ] Test invalid email format
- [ ] Test invalid phone format
- [ ] Test missing required fields
- [ ] Test token refresh (wait 1 hour)
- [ ] Test different sources

### Sample Test Data

```bash
# Test 1: Valid lead
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{"source":"website","name":"Test User","email":"test@example.com","phone":"9876543210"}'

# Test 2: Duplicate email
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{"source":"meta_ads","name":"Test User 2","email":"test@example.com","phone":"9999999999"}'

# Test 3: Duplicate phone
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{"source":"whatsapp","name":"Test User 3","email":"test3@example.com","phone":"9876543210"}'

# Test 4: Invalid data
curl -X POST http://localhost:3000/leads \
  -H "Content-Type: application/json" \
  -d '{"source":"website","name":"X"}'
```

---

## Troubleshooting

### Issue: "Missing required environment variables"
**Solution:** Check that `.env` file exists and contains all required variables.

### Issue: "Token refresh failed: invalid_refresh_token"
**Solution:** 
1. Verify refresh_token in `.env` is correct
2. Check that token hasn't been revoked in Zoho
3. Regenerate refresh_token if needed

### Issue: "INVALID_TOKEN" errors persist
**Solution:**
1. Check `logs/error.log` for details
2. Manually clear token: restart server
3. Verify ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET

### Issue: Duplicates still being created
**Solution:**
1. Check that email/phone format matches exactly in Zoho
2. Review `logs/combined.log` for duplicate detection results
3. Verify search criteria in Zoho CRM

---

## Extension Ideas

1. **Webhooks** - Receive updates from Zoho CRM
2. **Bulk Import** - Import CSV of leads
3. **Queue System** - Use Bull/BullMQ for async processing
4. **Database** - Store audit logs in PostgreSQL
5. **Analytics** - Track conversion rates by source
6. **API Keys** - Add authentication for public API
7. **Rate Limiting** - Prevent abuse

---

## License

MIT

## Support

For issues or questions, please check:
1. This README
2. `logs/error.log` file
3. Zoho CRM API documentation

---

**Built with ❤️ for production use**
