# SaaS Conversion Implementation Plan

## Status: IN PROGRESS

---

## Item 1: Property Type Field → Configurable Category
**Status: 🔄 IN PROGRESS**

### Problem
`propertyType` is hardcoded for real estate (apartment, villa, house, land, commercial, penthouse, townhouse). Not configurable per tenant/industry.

### Solution
Replace with configurable `category` field backed by a `TenantConfig` model. Each tenant defines their own categories. `propertyType` is kept as a backward-compatible alias.

### Files Changed

#### Backend
| # | File | Change |
|---|------|--------|
| 1 | `app-backend/src/models/tenantConfig.model.js` | **NEW** — TenantConfig model with per-org `categories[]`, `categoryFieldLabel`, defaults |
| 2 | `app-backend/src/constants/index.js` | Rename `PROPERTY_TYPES` → `DEFAULT_CATEGORIES`, add `getDefaultCategories(industry)` |
| 3 | `app-backend/src/models/Lead.js` | Add `category` field, keep `propertyType` as virtual alias |
| 4 | `app-backend/src/properties/properties.model.js` | Add `category` field, keep `propertyType` as alias, remove hardcoded enum |
| 5 | `app-backend/src/validators/schemas.js` | Replace hardcoded `propertyType` z.enum → `z.string()` (dynamic validation) |
| 6 | `app-backend/src/models/Automation.js` | Rename `triggerConditions.propertyTypes` → `categories` (keep alias) |
| 7 | `app-backend/src/services/workflow.conditions.js` | Support both `propertyType` and `category` field names |
| 8 | `app-backend/src/services/workflow.triggers.js` | Support both `propertyTypes` and `categories` in conditions |
| 9 | `app-backend/src/services/workflow.executors.js` | Use `lead.category` with fallback to `lead.propertyType` |
| 10 | `app-backend/src/services/awsEmail.service.js` | Use `lead.category` with fallback |
| 11 | `app-backend/src/repositories/propertyRepository.js` | Support `category` field for queries |
| 12 | `app-backend/src/scripts/createIndexes.js` | Add `category` index alongside `propertyType` |
| 13 | `app-backend/src/tasks/task.service.js` | Update populate projection |
| 14 | `app-backend/src/controllers/tenantConfig.controller.js` | **NEW** — CRUD API for tenant config |
| 15 | `app-backend/src/routes/tenantConfig.routes.js` | **NEW** — Route definitions |
| 16 | `app-backend/src/app.js` | Register tenant config routes |
| 17 | `app-backend/src/models/index.js` | Export TenantConfig, Organization, Property |

#### Frontend
| # | File | Change |
|---|------|--------|
| 18 | `src/services/tenantConfig.ts` | **NEW** — API client for tenant config |
| 19 | `src/app/context/TenantConfigContext.tsx` | **NEW** — React context for tenant config |
| 20 | `src/services/properties.ts` | Replace `propertyType` type → `category: string` with alias |
| 21 | `src/app/pages/Properties.tsx` | Use dynamic categories from TenantConfig |
| 22 | `src/app/components/automation/NodeConfigPanel.tsx` | Use dynamic category label from TenantConfig |
| 23 | `src/app/components/ScheduleSiteVisitDialog.tsx` | Use `category` field |
| 24 | `src/app/pages/Settings.tsx` | Rename "Property Type Matching" → uses config label |
| 25 | `src/app/pages/Leads.tsx` | Update auto-assign description |
| 26 | `src/app/App.tsx` | Wrap with TenantConfigProvider |

#### Migration
| # | File | Change |
|---|------|--------|
| 27 | `app-backend/scripts/migrate-category-field.js` | **NEW** — Migrate existing data |

---

## Item 2: Site Visit → Generic Appointment (PENDING)
## Item 3: Budget → Configurable Monetary Field (PENDING)
## Item 4: Location → Configurable Field (PENDING)
## Item 5: Automation Templates → Template Library (PENDING)
## Item 6: Lead Status Labels → Configurable Pipeline (PENDING)
