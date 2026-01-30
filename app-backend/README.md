# SaaS Lead Management - Application Backend

**Production-grade Fastify backend** for the Lead Management Platform. This service sits between the React frontend and Zoho CRM, handling authentication, permissions, and data orchestration.

## Architecture

```
┌─────────────┐
│   React     │  
│  Frontend   │  
└──────┬──────┘  
       │ JWT Auth
       ▼
┌─────────────────────┐
│ Application Backend │ ← THIS SERVICE
│   (Fastify)         │
└──┬──────────────┬───┘
   │              │
   │ Read         │ Write
   ▼              ▼
┌──────────┐  ┌─────────────────┐
│ Zoho CRM │  │ Ingestion       │
│          │  │ Service         │
└──────────┘  └────┬────────────┘
                   │
                   ▼
              ┌──────────┐
              │ Zoho CRM │
              └──────────┘
```

## Features

✅ **JWT Authentication** - Access + refresh tokens  
✅ **Role-Based Access** - Admin, manager, agent roles  
✅ **Zoho CRM Integration** - OAuth token management + lead retrieval  
✅ **Field Mapping** - Frontend never sees Zoho internals  
✅ **Permission Layer** - Extensible access control  
✅ **Metrics API** - Real dashboard analytics  
✅ **Write Proxy** - Uses existing ingestion service for lead creation  

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in required values:
```env
# JWT Secret (generate random 32+ char string)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long

# Zoho CRM Credentials
ZOHO_CLIENT_ID=1000.YOUR_CLIENT_ID
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_REFRESH_TOKEN=1000.your_refresh_token

# Ingestion Service
INGESTION_SERVICE_URL=http://localhost:3000
INGESTION_SERVICE_API_KEY=your_ingestion_api_key
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

Server starts on `http://localhost:4000`

---

## API Endpoints

### Authentication

#### POST /auth/login
Login with email and password.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "user": {
    "id": "user_001",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

#### POST /auth/refresh
Refresh access token.

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGc..."
}
```

#### POST /auth/logout
Logout (invalidate refresh token).

**Request:**
```json
{
  "refreshToken": "eyJhbGc..."
}
```

---

### Leads Management (Protected)

All endpoints require `Authorization: Bearer {accessToken}` header.

#### GET /api/leads
List leads with pagination and filters.

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 20)
- `status` (string, optional)
- `source` (string, optional)
- `owner` (string, optional)

**Response:**
```json
{
  "data": [
    {
      "id": "4876876000001234567",
      "name": "Rajesh Kumar",
      "email": "rajesh@example.com",
      "phone": "+919876543210",
      "company": "TechCorp",
      "source": "Website",
      "status": "New",
      "priority": "high",
      "value": 45000,
      "owner": {
        "id": "user_123",
        "name": "John Doe"
      },
      "createdAt": "2024-01-15T10:30:00Z",
      "lastActivity": "2024-01-15T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "totalPages": 8
  }
}
```

#### GET /api/leads/:id
Get single lead with full details.

**Response:**
```json
{
  "id": "4876876000001234567",
  "name": "Rajesh Kumar",
  "email": "rajesh@example.com",
  "phone": "+919876543210",
  "company": "TechCorp",
  "source": "Website",
  "status": "Qualified",
  "priority": "high",
  "value": 45000,
  "budget": "$40k - $50k",
  "timeline": "Q1 2024",
  "tags": ["enterprise", "hot-lead"],
  "owner": {
    "id": "user_123",
    "name": "John Doe"
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "lastActivity": "2024-01-15T14:30:00Z",
  "activities": [
    {
      "id": "act_001",
      "type": "note",
      "description": "Initial discovery call",
      "timestamp": "2024-01-15T14:30:00Z",
      "user": "John Doe"
    }
  ]
}
```

#### POST /api/leads
Create new lead (proxies to ingestion service).

**Request:**
```json
{
  "name": "New Lead",
  "email": "new@example.com",
  "phone": "9876543210",
  "company": "NewCo",
  "source": "Website"
}
```

**Response:**
```json
{
  "success": true,
  "action": "created",
  "leadId": "4876876000001234568"
}
```

---

### Metrics (Protected)

#### GET /api/metrics/overview
Get dashboard metrics.

**Response:**
```json
{
  "totalLeads": 156,
  "activeLeads": 89,
  "conversionRate": 24.5,
  "pipelineValue": 2450000,
  "leadsBySource": {
    "Website": 45,
    "LinkedIn Ads": 32,
    "Referral": 28,
    "Google Ads": 25,
    "Facebook": 26
  },
  "leadsByStatus": {
    "New": 34,
    "Contacted": 28,
    "Qualified": 18,
    "Proposal Sent": 12,
    "Negotiation": 9
  },
  "recentLeads": 23,
  "period": "last_7_days"
}
```

---

## Demo Users

For testing (in-memory users, replace with database):

| Email | Password | Role |
|-------|----------|------|
| admin@example.com | admin123 | admin |
| agent@example.com | agent123 | agent |
| manager@example.com | manager123 | manager |

---

## Permissions Model

| Role | Can Access | Can Create | Can Edit |
|------|-----------|-----------|----------|
| admin | All leads | Yes | All leads |
| manager | All leads | Yes | All leads |
| agent | Assigned leads only | Yes | Assigned leads |

---

## Frontend Integration Guide

### 1. Install HTTP Client

```bash
npm install axios
# or
npm install ky
```

### 2. Create API Client

```typescript
// src/services/api.ts
import axios from 'axios';

const API_BASE_URL = 'http://localhost:4000';

const api = axios.create({
  baseURL: API_BASE_URL
});

// Add JWT token to requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken
          });
          localStorage.setItem('accessToken', data.accessToken);
          // Retry original request
          error.config.headers.Authorization = `Bearer ${data.accessToken}`;
          return axios(error.config);
        } catch (refreshError) {
          // Refresh failed, logout
          localStorage.clear();
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 3. Authentication Functions

```typescript
// src/services/auth.ts
import api from './api';

export async function login(email: string, password: string) {
  const { data } = await api.post('/auth/login', { email, password });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);
  return data.user;
}

export async function logout() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    await api.post('/auth/logout', { refreshToken });
  }
  localStorage.clear();
}
```

### 4. Fetch Leads

```typescript
// src/services/leads.ts
import api from './api';

export async function getLeads(filters = {}) {
  const { data } = await api.get('/api/leads', { params: filters });
  return data;
}

export async function getLead(id: string) {
  const { data } = await api.get(`/api/leads/${id}`);
  return data;
}

export async function createLead(leadData: any) {
  const { data } = await api.post('/api/leads', leadData);
  return data;
}
```

### 5. Update DataContext

```typescript
// src/app/context/DataContext.tsx
import { useState, useEffect } from 'react';
import { getLeads } from '../../services/leads';

export function DataProvider({ children }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeads() {
      try {
        const { data } = await getLeads();
        setLeads(data);
      } catch (error) {
        console.error('Failed to fetch leads:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchLeads();
  }, []);

  return (
    <DataContext.Provider value={{ leads, loading }}>
      {children}
    </DataContext.Provider>
  );
}
```

---

## Project Structure

```
app-backend/
├── src/
│   ├── auth/
│   │   ├── auth.controller.js       # Login, refresh, logout
│   │   ├── auth.service.js          # Auth business logic
│   │   └── jwt.js                   # JWT utilities
│   ├── leads/
│   │   ├── leads.controller.js      # Lead endpoints
│   │   ├── leads.service.js         # Lead business logic
│   │   └── zoho.mapper.js           # Field mapping
│   ├── metrics/
│   │   ├── metrics.controller.js    # Metrics endpoints
│   │   └── metrics.service.js       # Analytics logic
│   ├── users/
│   │   └── users.model.js           # User model + auth
│   ├── middleware/
│   │   ├── requireAuth.js           # JWT verification
│   │   └── roles.js                 # Permission checks
│   ├── clients/
│   │   ├── zoho.client.js           # Zoho CRM API
│   │   └── ingestion.client.js      # Ingestion proxy
│   ├── config/
│   │   └── env.js                   # Configuration
│   ├── utils/
│   │   └── errors.js                # Error classes
│   ├── app.js                       # Fastify setup
│   └── server.js                    # Entry point
├── .env.example
├── package.json
└── README.md
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | development | Environment |
| `PORT` | No | 4000 | Server port |
| `JWT_SECRET` | **Yes** | - | JWT signing secret (32+ chars) |
| `JWT_ACCESS_EXPIRY` | No | 15m | Access token expiry |
| `JWT_REFRESH_EXPIRY` | No | 7d | Refresh token expiry |
| `ZOHO_CLIENT_ID` | **Yes** | - | Zoho OAuth client ID |
| `ZOHO_CLIENT_SECRET` | **Yes** | - | Zoho OAuth secret |
| `ZOHO_REFRESH_TOKEN` | **Yes** | - | Zoho refresh token |
| `ZOHO_API_DOMAIN` | No | https://www.zohoapis.in | Zoho API URL |
| `ZOHO_ACCOUNTS_URL` | No | https://accounts.zoho.in | Zoho Auth URL |
| `INGESTION_SERVICE_URL` | **Yes** | - | Ingestion service URL |
| `INGESTION_SERVICE_API_KEY` | **Yes** | - | Ingestion API key |
| `FRONTEND_URL` | No | http://localhost:5173 | Frontend URL (CORS) |

---

## Testing

### Manual Testing

```bash
# 1. Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Save the accessToken from response

# 2. Get leads
curl http://localhost:4000/api/leads \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Get metrics
curl http://localhost:4000/api/metrics/overview \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Create lead
curl -X POST http://localhost:4000/api/leads \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Lead",
    "email": "test@example.com",
    "phone": "9876543210",
    "source": "Website"
  }'
```

---

## Production Deployment

### Using PM2

```bash
npm install -g pm2
pm2 start src/server.js --name app-backend
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 4000
CMD ["node", "src/server.js"]
```

```bash
docker build -t app-backend .
docker run -p 4000:4000 --env-file .env app-backend
```

---

## Known Limitations

> [!WARNING]
> Current implementation has these limitations:

1. **In-Memory Users** - Users are hardcoded (not production-safe)
2. **No Token Revocation** - Logout doesn't invalidate JWTs server-side
3. **No Password Reset** - Email flow not implemented
4. **Basic Permissions** - Role logic is simplified
5. **No Caching** - Every request hits Zoho CRM
6. **No Database** - No persistent storage
7. **Limited Metrics** - Basic aggregation only

**These are acceptable for internal alpha but MUST be addressed before production.**

---

## Future TODOs

### High Priority
- [ ] Replace in-memory users with PostgreSQL/MongoDB
- [ ] Add Redis for session/token management
- [ ] Implement token revocation on logout
- [ ] Add password reset flow
- [ ] Implement proper caching layer
- [ ] Add rate limiting per user
- [ ] Write automated tests

### Medium Priority
- [ ] Enhance permission logic (team-based access)
- [ ] Add user management CRUD endpoints
- [ ] Implement audit logging
- [ ] Add search/filter optimizations
- [ ] Support for custom Zoho fields
- [ ] Webhook support for real-time updates

### Low Priority
- [ ] Multi-tenancy support
- [ ] Advanced analytics endpoints
- [ ] Export/import functionality
- [ ] Batch operations
- [ ] GraphQL API option

---

## Troubleshooting

### "Missing required environment variables"
**Solution:** Check `.env` file has all required variables from `.env.example`

### "Invalid token" errors
**Solution:** Check JWT_SECRET matches between server restarts. Tokens are invalidated when secret changes.

### "External service error: Zoho CRM"
**Solution:** 
1. Verify Zoho credentials in `.env`
2. Check Zoho refresh token hasn't expired
3. Check Zoho API rate limits

### "Cannot find module 'bcrypt'"
**Solution:** Run `npm install` to install dependencies

---

## License

MIT

---

**Built for production. Honest about limitations.**
