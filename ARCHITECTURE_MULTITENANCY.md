# Multi-Tenancy Architecture - Complete Refactoring Plan

## Overview
Convert the system from a single-organization mindset to a true multi-tenant SaaS platform where each organization has:
1. **Industry-specific features** (healthcare != real estate)
2. **Complete data isolation** (no cross-org data access)
3. **Modular feature system** (enable/disable modules per org)
4. **Scalable design** (easy to add new organization types)

---

## PART 1: BACKEND ARCHITECTURE

### 1.1 Data Models (with Organization Scoping)

**Lead Model** (already has organizationId ✅)
```
- organizationId (ObjectId) ✅ ALREADY HAS THIS
- name, email, phone, etc.
```

**Property Model** (NEEDS organizationId ❌)
```
+ organizationId (ObjectId) ❌ ADD THIS
+ organization-specific category field
+ lead associations scoped to org
```

**Activity Model** (NEEDS organizationId ❌)
```
+ organizationId (ObjectId) ❌ ADD THIS  
+ leadId
```

**Broadcast Model** (NEEDS organizationId ❌)
```
+ organizationId (ObjectId) ❌ ADD THIS
+ lead scoping
```

**Task Model** (NEEDS organizationId ❌)
```
+ organizationId (ObjectId) ❌ ADD THIS
+ lead scoping
```

### 1.2 Organization Configuration (TenantConfig)

Already exists✅ with:
- `industry` - Determines default modules, categories, labels
- `enabledModules` - Controls which features are active
- `categories` - Customizable field lists
- `appointmentTypes` - Event type definitions

**Module Definition:**
```javascript
enabledModules = {
  "catalog": true,        // for real_estate only
  "appointments": true,   // for healthcare/automotive
  "broadcasts": true,     // for all
  "aiCalling": true,      // for all
  "knowledgeBase": true   // for all
}
```

### 1.3 Organization Type → Module Mapping

**Real Estate**
- Catalog/Properties ✅
- Leads ✅
- Category field: "Property Type" (Apartment, House, Commercial, etc.)
- Appointment field: "Site Visit"

**Healthcare**
- Leads/Patients ✅
- No Catalog ❌
- Category field: "Patient Type" or "Service Type"
- Appointment field: "Consultation" or "Check-up"

**SaaS/Generic**
- Leads only
- No Catalog
- Generic category field
- Generic appointment field

### 1.4 Data Access Layer (Org-Scoped Queries)

All database queries must enforce `organizationId filter:

```javascript
// CORRECT - Org isolated
const leads = await Lead.find({
  organizationId: user.organizationId,
  status: 'New'
});

// WRONG - No org filter (security risk!)
const leads = await Lead.find({ status: 'New' });
```

---

## PART 2: FRONTEND ARCHITECTURE

### 2.1 Navigation System (Industry-Driven)

**Current (WRONG):**
```typescript
// MainLayout.tsx - hardcoded for all orgs
const menuItems = [
  { name: 'Leads', href: '/leads' },
  { name: 'Properties', href: '/properties' }, // ❌ Shows for healthcare!
  { name: 'Agents', href: '/agents' }
];
```

**New (CORRECT):**
```typescript
// getDynamicMenuItems(organization) - based on industry
const moduleConfig = {
  real_estate: ['leads', 'catalog', 'agents', 'broadcasts', 'analytics'],
  healthcare: ['leads', 'agents', 'appointments', 'broadcasts', 'aiCalling'],
  saas: ['leads', 'agents', 'broadcasts', 'analytics'],
  generic: ['leads', 'agents', 'broadcasts']
};
```

### 2.2 Route Management (Module-Gated)

**Current (WRONG):**
```typescript
<Route path="properties" element={<Properties />} /> // Always available
```

**New (CORRECT):**
```typescript
// Only render if module enabled
{isModuleEnabled('catalog') && (
  <Route path="properties" element={<Properties />} />
)}
```

### 2.3 Hooks & Utilities

**New Hook: `useOrganization()`**
```typescript
const { organization, industry, enabledModules } = useOrganization();

// Check if module is available
if (!enabledModules.catalog) {
  navigate('/dashboard');
}
```

**New Hook: `useModuleAccess(module)`**
```typescript
const hasAccess = useModuleAccess('catalog'); // true/false
```

---

## PART 3: IMPLEMENTATION STEPS

### Phase 1: Data Model Updates
1. Add `organizationId` to Property, Activity, Broadcast, Task models
2. Add `organizationId` indexes for query performance
3. Add validation to enforce org ownership

### Phase 2: Backend API Updates
1. Create org-scoped query repository  
2. Add middleware: `validateOrgAccess`
3. Refactor all service methods to filter by organizationId
4. Update routes to inject organizationId from request context

### Phase 3: Frontend Architecture  
1. Create `useOrganization()` hook
2. Build dynamic menu based on `enabledModules`
3. Create module access validation
4. Refactor MainLayout with dynamic rendering
5. Gate all routes based on module availability

### Phase 4: Testing
1. Register healthcare org
2. Verify Properties button HIDDEN
3. Verify only healthcare-specific modules show
4. Register real estate org
5. Verify Properties button VISIBLE
6. Verify data isolation (leads lists separate per org)

---

## PART 4: ORGANIZATION TYPE DEFAULTS

### Real Estate Configuration
```
industry: 'real_estate'
enabledModules: {
  catalog: true,
  appointments: true (site visits),
  broadcasts: true,
  aiCalling: true,
  knowledgeBase: true
}
categoryFieldLabel: 'Property Type'
appointmentFieldLabel: 'Site Visit'
categories: [
  { key: 'apartment', label: 'Apartment' },
  { key: 'house', label: 'House' },
  { key: 'commercial', label: 'Commercial' }
]
```

### Healthcare Configuration
```
industry: 'healthcare'
enabledModules: {
  catalog: false,      // ❌ NO PROPERTIES
  appointments: true,
  broadcasts: true,
  aiCalling: true,
  knowledgeBase: true
}
categoryFieldLabel: 'Patient Type' or 'Service Type'
appointmentFieldLabel: 'Consultation'
categories: [
  { key: 'patient', label: 'Patient' },
  { key: 'consultation', label: 'Consultation' }
]
```

---

## PART 5: KEY ARCHITECTURE PATTERNS

### Pattern 1: Org-Scoped Repository
```javascript
// Every repo method filters by org
async getLeads(organizationId, filters) {
  return Lead.find({
    organizationId,  // ← Always include this
    ...filters
  });
}
```

### Pattern 2: User Context
```javascript
// User always has organizationId from JWT
const user = {
  id: '...',
  organizationId: '...', // ← Always include
  email: '...',
  role: 'owner'
};
```

### Pattern 3: Frontend Access Control
```typescript
// Before rendering a page
const { enabledModules } = useTenantConfig();

if (!enabledModules.catalog) {
  return <Navigate to="/dashboard" />;
}
```

---

## PART 6: MIGRATION CHECKLIST

- [ ] Add `organizationId` to Property model
- [ ] Add `organizationId` to Activity model  
- [ ] Add `organizationId` to Broadcast model
- [ ] Add `organizationId` to Task model
- [ ] Migrate existing data (all props → default org if single-org system)
- [ ] Create `useOrganization()` hook
- [ ] Refactor MainLayout for dynamic menu
- [ ] Create module-gated route wrapper
- [ ] Update all API calls to enforce org filtering
- [ ] Test multi-org isolation
- [ ] Test healthcare org (no Properties visible)
- [ ] Test real estate org (Properties visible)

---

## PART 7: SCALABILITY FOR NEW ORG TYPES

To add "Finance" organization type:
1. Add industry defaults to tenantConfig.model.js
2. Define Finance-specific modules in enabledModules
3. Add to Signup.tsx industry picker
4. Frontend automatically picks up via TenantConfig

No major code changes needed - fully scalable! ✨
