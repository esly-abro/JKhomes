# Pulsar CRM — Backend

Fastify + MongoDB backend for the Pulsar CRM platform. See the [root README](../README.md) for the full project overview.

## Quick Start

```bash
npm install

# Create .env file:
# JWT_SECRET=your-secret-key
# MONGODB_URI=mongodb+srv://...
# PORT=4000

npm start
```

## Structure

```
src/
├── server.js          # Entry point — MongoDB connect, workflow engine start, listen on :4000
├── app.js             # All route registrations (~100+ endpoints)
├── auth/              # Auth controller, service, JWT utilities
├── models/            # 16 Mongoose models (Lead, User, Organization, TenantConfig, etc.)
├── controllers/       # Route handlers
├── services/          # 19 service files — business logic + external integrations
├── repositories/      # Database query layer
├── routes/            # Fastify plugin routes (automations, tenantConfig, broadcasts, etc.)
├── middleware/        # requireAuth, requireRole, rateLimiter, security, validation
├── validators/        # Zod request validation schemas
├── config/            # env.js (env vars), database.js, default automation templates
├── leads/             # Lead ingestion controller
├── users/             # User controller
├── sync/              # Zoho sync controller
├── tasks/             # Task routes
├── twilio/            # Voice call controller
├── inventory/         # Inventory item controller
├── properties/        # Property + availability controllers
├── assignments/       # Lead assignment controller
├── metrics/           # Analytics & metrics controllers
└── utils/             # Helpers (encryption, org-scoped queries, etc.)
```

## Environment Variables

See the root README's [Environment Variables section](../README.md#environment-variables) for the complete list.

**Minimum required:** `JWT_SECRET`, `MONGODB_URI`

## Key Design Decisions

- **Multi-tenant by org scope** — Every query filters by `organizationId` from the JWT
- **Role-based access** — 5 roles: owner, admin, manager, agent, bpo — enforced via `requireRole()` middleware
- **Integration credentials stored per-org** — Zoho, Twilio, ElevenLabs, WhatsApp creds are in the Organization model, encrypted with AES-256
- **Workflow engine** — Background job processor runs every 10 seconds, executing automation workflows
- **Rate limiting** — Separate limiters for auth, API, voice calls, Zoho sync, WhatsApp
