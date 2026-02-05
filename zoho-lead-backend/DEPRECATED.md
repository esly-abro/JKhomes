# ⚠️ DEPRECATED - Merged into app-backend

**This backend has been merged into `app-backend` as of February 2026.**

## What Happened?

The `zoho-lead-backend` services have been consolidated into the main `app-backend` to:

1. **Eliminate duplicate Zoho CRM clients** - Both backends had their own token management
2. **Single source of truth** - One backend, one database connection, one API surface
3. **Simplified deployment** - One service to deploy, monitor, and scale
4. **Consistent error handling** - Unified error responses and logging

## Migrated Services

| Old Location | New Location |
|-------------|--------------|
| `zoho-lead-backend/src/services/leadNormalizer.js` | `app-backend/src/leads/lead.normalizer.js` |
| `zoho-lead-backend/src/services/duplicateDetector.js` | `app-backend/src/leads/lead.deduplicator.js` |
| `zoho-lead-backend/src/services/postCallOrchestrator.js` | `app-backend/src/services/postCall.orchestrator.js` |
| `zoho-lead-backend/src/routes/leads.js` | `app-backend/src/leads/lead.ingestion.controller.js` |
| `zoho-lead-backend/src/routes/webhookRoutes.js` | `app-backend/src/app.js` (inline routes) |

## New Endpoints in app-backend

### Lead Ingestion (Public - No Auth)
```
POST /api/ingest/leads      - Create lead from external source
POST /api/ingest/leads/batch - Batch create leads (max 50)
GET  /api/ingest/sources    - Get valid source values
POST /leads                 - Legacy endpoint (backwards compatible)
```

### Webhooks (Public - No Auth)
```
POST /webhook/elevenlabs    - ElevenLabs post-call webhook
POST /ai-call-webhook       - Legacy AI call webhook
POST /elevenlabs/status     - Twilio call status callback
GET  /webhook/health        - Webhook health check
```

## Migration Steps

1. **Update webhook URLs** in ElevenLabs Dashboard:
   - Old: `https://your-server.com:3000/webhook/elevenlabs`
   - New: `https://your-server.com:4000/webhook/elevenlabs`

2. **Update lead ingestion URLs** in Meta Ads, Google Ads:
   - Old: `https://your-server.com:3000/leads`
   - New: `https://your-server.com:4000/api/ingest/leads`

3. **Stop zoho-lead-backend service**:
   ```bash
   pm2 stop zoho-lead-backend
   pm2 delete zoho-lead-backend
   ```

4. **Remove from ecosystem.config.cjs** (if using PM2)

## Do NOT Delete Yet

Keep this folder until you've:
- [ ] Verified all webhooks are working on new endpoints
- [ ] Tested lead ingestion from all sources
- [ ] Confirmed post-call automations trigger correctly
- [ ] Monitored for 1 week with no issues

## Questions?

Contact the development team or check `app-backend/README.md` for updated documentation.
