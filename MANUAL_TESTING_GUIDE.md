# Manual Testing Flow - Multi-Tenant Organization Architecture

## System Architecture Changes

### What Changed:
1. **Backend Database Scoping**: Added `organizationId` to Property and Task models for data isolation
2. **Organization Type → Module Mapping**: Implemented industry-specific feature availability
3. **Frontend Module Gating**: Properties (Catalog) button now hidden for non-real-estate orgs
4. **Dynamic Navigation**: MainLayout nav items filtered based on organization type

### Key Differences by Organization Type:

| Feature | Real Estate | Healthcare | SaaS | Others |
|---------|-------------|-----------|------|--------|
| Catalog/Properties | ✅ | ❌ | ❌ | ❌ |
| Appointments | ✅ (Site Visit) | ✅ (Consultation) | ✅ (Demo) | ✅ |
| Broadcasts | ✅ | ✅ | ✅ | ✅ |
| AI Calling | ✅ | ✅ | ✅ | ✅ |  
| Knowledge Base | ✅ | ✅ | ✅ | ✅ |

---

## Manual Testing Steps

### TEST 1: Healthcare Organization (No Properties)

**1.1 Create Healthcare Organization**

```
1. Go to http://localhost:5173/signup
2. Select "Healthcare" industry
3. Fill in:
   - Category Field Label: "Service Type"
   - Appointment Field Label: "Consultation"
   - Organization Name: "MyHealth Clinic"
   - Admin Name: "healthcare_admin"
   - Email: owner@healthcare.com
   - Password: owner@healthcare123
4. Click "Create Organization"
5. Wait for redirect to login page
```

**1.2 Login and Verify Module Access**

```
Login credentials:
- Email: owner@healthcare.com
- Password: owner@healthcare123

EXPECTED: After login, you should see:
✅ Dashboard, Leads, Tasks, Agents visible
✅ Calendar, Broadcasts visible
✅ Settings, Analytics visible
❌ "Properties" button is HIDDEN (NOT visible)
❌ Does NOT appear in sidebar

If Properties button is visible → TEST FAILED
```

**1.3 Test Direct URL Access (Security Check)**

```
Try to directly access: http://localhost:5173/app/properties
EXPECTED: Should redirect to /dashboard (module not enabled)
```

**1.4 Verify Data Isolation**

```
1. Go to Leads page
2. Create a test lead: "John Test", +91 9999999999
3. Note: Lead list should be EMPTY initially for new org
4. Lead should show up after creation
```

---

### TEST 2: Real Estate Organization (With Properties)

**2.1 Create Real Estate Organization**

```
1. Go to http://localhost:5173/signup
2. Select "Real Estate" industry
3. Fill in:
   - Category Field Label: "Property Type" (default)
   - Appointment Field Label: "Site Visit" (default)
   - Organization Name: "RealEstate Plus"
   - Admin Name: "realest_admin"
   - Email: owner@realestate.com
   - Password: owner@realestate123
4. Click "Create Organization"
```

**2.2 Login and Verify Module Access**

```
Login credentials:
- Email: owner@realestate.com
- Password: owner@realestate123

EXPECTED: After login, you should see:
✅ Dashboard, Leads, Tasks, Agents visible
✅ "Properties" button IS VISIBLE in sidebar
✅ Calendar, Broadcasts visible
✅ Settings, Analytics visible

If Properties button is NOT visible → TEST FAILED
```

**2.3 Test Properties Module**

```
1. Click on "Properties" in sidebar
2. Should load properties management page
3. Click "Add Property"
4. Create a test property:
   - Name: "Test Villa"
   - Property Type: "Apartment" (or other category)
   - Location: "Downtown Area"
   - Price: 50L - 60L
   - Status: Available
5. Click "Create Property"
6. Property should appear in list

EXPECTED: Properties management fully functional
```

---

### TEST 3: Data Isolation Between Organizations

**3.1 Create Two Separate Organizations**

```
Create Healthcare Org (if not done):
- Email: clinic@health.com
- Organization: "Health Clinic"

Create Real Estate Org (if not done):  
- Email: realtor@property.com
- Organization: "Property Group"
```

**3.2 Add Leads to Each Organization**

```
Login as clinic@health.com:
1. Go to Leads
2. Add lead: "Patient John", +91 1111111111
3. Save lead

Login as realtor@property.com:
1. Go to Leads
2. Add lead: "Buyer Sarah", +91 2222222222
3. Save lead
```

**3.3 Verify Data Isolation**

```
Login as clinic@health.com:
- Should see ONLY "Patient John" in leads list
- Should NOT see "Buyer Sarah"

Login as realtor@property.com:
- Should see ONLY "Buyer Sarah" in leads list
- Should NOT see "Patient John"

EXPECTED: Each organization's leads completely isolated
```

---

### TEST 4: Settings Page Verification

**4.1 Login as Healthcare Org**

```
Email: owner@healthcare.com
Password: owner@healthcare123

Go to Settings → Configuration tab
EXPECTED:
- Category Field Label: "Service Type" (or custom value)
- Appointment Type Label: "Consultation" (or custom value)
- Enabled Modules shows:
  - Catalog: OFF/FALSE ❌
  - Appointments: ON/TRUE ✅
  - Broadcasts: ON/TRUE ✅
  - AI Calling: ON/TRUE ✅
  - Knowledge Base: ON/TRUE ✅
```

**4.2 Login as Real Estate Org**

```
Email: owner@realestate.com
Password: owner@realestate123

Go to Settings → Configuration tab
EXPECTED:
- Category Field Label: "Property Type" (or custom value)
- Appointment Type Label: "Site Visit" (or custom value)
- Enabled Modules shows:
  - Catalog: ON/TRUE ✅
  - Appointments: ON/TRUE ✅
  - Broadcasts: ON/TRUE ✅
  - AI Calling: ON/TRUE ✅
  - Knowledge Base: ON/TRUE ✅
```

---

### TEST 5: Navigation Sidebar Dynamic Filtering

**5.1 Healthcare Organization Navigation**

```
Login as: owner@healthcare.com

Sidebar should show:
✅ Dashboard
✅ Leads (or "My Leads" if agent)
✅ Tasks
✅ Agents
❌ Properties (HIDDEN)
✅ Broadcasts
✅ Activities  
✅ Calendar
✅ Analytics
✅ Settings
✅ Automation

Count visible items: Should be ~11 (without Properties)
```

**5.2 Real Estate Organization Navigation**

```
Login as: owner@realestate.com

Sidebar should show:
✅ Dashboard
✅ Leads
✅ Tasks
✅ Agents
✅ Properties (VISIBLE ← KEY DIFFERENCE)
✅ Broadcasts
✅ Activities
✅ Calendar
✅ Analytics
✅ Settings
✅ Automation

Count visible items: Should be ~12 (with Properties)
```

---

### TEST 6: Broadcast Filtering (Advanced)

**Note**: All organizations should see Broadcasts module

```
Healthcare Organization:
1. Login as owner@healthcare.com
2. Navigate to Broadcasts (should be visible)
3. Create a broadcast message
4. Select leads to send to
5. EXPECTED: Should ONLY see leads from this healthcare org
6. Verify Broadcasts page works

Real Estate Organization:
1. Login as owner@realestate.com
2. Navigate to Broadcasts (should be visible)
3. Should ONLY see leads from this real estate org
4. Verify Broadcasts page works
```

---

### TEST 7: Categories and Field Labels

**7.1 Healthcare Organization Fields**

```
Login as: owner@healthcare.com

Dashboard/Leads view should show:
- "Service Type" instead of "Property Type"
- "Consultation" instead of "Site Visit"

Settings → Configuration should show:
- categoryFieldLabel: "Service Type"
- appointmentFieldLabel: "Consultation"
```

**7.2 Real Estate Organization Fields**

```
Login as: owner@realestate.com

Dashboard/Leads view should show:
- "Property Type" (or custom label)
- "Site Visit" (or custom label)

Settings → Configuration should show:
- categoryFieldLabel: "Property Type"
- appointmentFieldLabel: "Site Visit"
```

---

## Test Status Tracker

Create a checklist to verify all tests:

```
TEST 1: Healthcare Organization
  [ ] Healthcare org created successfully
  [ ] Properties button hidden in sidebar
  [ ] Direct URL access to /properties redirects to /dashboard
  [ ] Initial leads list is empty
  [ ] Can create leads

TEST 2: Real Estate Organization
  [ ] Real estate org created successfully
  [ ] Properties button visible in sidebar
  [ ] Properties page loads and functions
  [ ] Can create and manage properties

TEST 3: Data Isolation
  [ ] Healthcare org leads invisible to Real Estate org
  [ ] Real Estate leads invisible to Healthcare org
  [ ] Each org has separate lead lists

TEST 4: Settings Page
  [ ] Healthcare org shows correct module configuration
  [ ] Real Estate org shows correct module configuration
  [ ] Industry-specific labels display correctly

TEST 5: Navigation Sidebar
  [ ] Healthcare sidebar has correct items (no Properties)
  [ ] Real Estate sidebar has correct items (with Properties)
  [ ] All visible items are clickable

TEST 6: Broadcasts
  [ ] Both orgs can access Broadcasts
  [ ] Broadcasts filters leads by organization
  [ ] Can create and send broadcasts

TEST 7: Field Labels
  [ ] Healthcare shows "Service Type" and "Consultation"
  [ ] Real Estate shows "Property Type" and "Site Visit"
```

---

## Success Criteria

✅ **ALL tests must pass** to confirm multi-tenant architecture is working:

1. **Healthcare org CANNOT access Properties module** - even if they try direct URL
2. **Real Estate org CAN access Properties module** - via sidebar and routes
3. **Data is completely isolated** - no cross-org lead visibility
4. **Sidebar dynamically updates** - based on organization industry type
5. **Field labels are industry-specific** - reflecting business language of org type
6. **Future org types are scalable** - can add new industry without code changes

---

## Rollback Plan (If Issues Occur)

If tests fail:

```bash
# 1. Stop all services
./stop-all.ps1

# 2. Revert database changes (if needed)
# - Remove organizationId from Property model
# - Remove organizationId from Task model
# - If using MongoDB in production, may need migration

# 3. Revert code changes
git revert <commit-hash>

# 4. Clear browser cache
# - Clear localStorage
# - Clear sessionStorage
# - Hard refresh (Ctrl+Shift+R)

# 5. Restart services
./start-all.ps1
```

---

## Common Issues & Solutions

### Issue: Properties button still showing for healthcare org

**Solution**:
1. Check TenantConfig.enabledModules in database (should be false for catalog)
2. Clear localStorage/browser cache
3. Hard refresh browser (Ctrl+Shift+R)
4. Verify TenantConfigContext is properly initialized

### Issue: Data not isolated (seeing other org's leads)

**Solution**:
1. Check Lead queries in backend - must include organizationId filter
2. Check User JWT - must contain organizationId
3. Verify backends middleware is enforcing org filtering

### Issue: Categories showing wrong names

**Solution**:
1. Check TenantConfig.categoryFieldLabel and appointmentFieldLabel are saved
2. Verify getTenantConfig() API returns correct values
3. Hard refresh to reload TenantConfig context

---

## Performance Notes

- TenantConfig is loaded once on app startup
- Module checks are synchronous (no API calls)
- Navigation sidebar renders without latency
- Module gating works even with slow networks (since it's client-side logic)

---

##  Next Steps After Testing

If all tests pass:
1. Deploy to staging environment
2. Run full integration test suite
3. Performance testing with multiple orgs
4. Security audit for multi-tenant isolation
5. Deploy to production
