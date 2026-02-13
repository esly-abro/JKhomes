/**
 * Migration Script: Setup JK Homes Organization
 * 
 * This script:
 * 1. Creates the "JK Homes" Organization document
 * 2. Updates owner@jkhomes.com user name to "J Kamalakannan" and links organizationId
 * 3. Links all @jkhomes.com users to the organization
 * 4. Links ALL existing leads, activities, tasks, site visits, properties, 
 *    call logs, automations, campaigns, broadcasts to this organization
 * 
 * Usage: node scripts/setup-jkhomes-org.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/jk_construction';

async function setupJKHomesOrg() {
  try {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  JK Homes Organization Setup');
    console.log('═══════════════════════════════════════════════\n');

    await mongoose.connect(MONGO_URI);
    console.log(`✅ Connected to MongoDB: ${MONGO_URI}\n`);

    // Load models
    const Organization = require('../src/models/organization.model');
    const User = require('../src/models/User');
    const Lead = require('../src/models/Lead');
    const Activity = require('../src/models/Activity');
    const SiteVisit = require('../src/models/SiteVisit');
    const Task = require('../src/tasks/Task.model');
    const InventoryItem = require('../src/models/inventoryItem.model');
    const CallLog = require('../src/models/CallLog');
    const Broadcast = require('../src/models/Broadcast');

    // Optional models (may not exist)
    let Automation, AutomationRun, AutomationJob, Campaign, Property;
    try { Automation = require('../src/models/Automation'); } catch (e) {}
    try { AutomationRun = require('../src/models/AutomationRun'); } catch (e) {}
    try { AutomationJob = require('../src/models/AutomationJob'); } catch (e) {}
    try { Campaign = require('../src/models/Campaign'); } catch (e) {}
    try { Property = require('../src/properties/properties.model'); } catch (e) {}

    // ─── Step 1: Find or Create the owner user ───
    console.log('Step 1: Finding owner user...');
    const ownerUser = await User.findOne({ email: 'owner@jkhomes.com' });
    if (!ownerUser) {
      console.log('❌ owner@jkhomes.com not found! Run init-users.js first.');
      process.exit(1);
    }
    console.log(`  Found owner: ${ownerUser.name} (${ownerUser._id})`);

    // ─── Step 2: Check if JK Homes org already exists ───
    console.log('\nStep 2: Creating JK Homes organization...');
    let org = await Organization.findOne({ slug: 'jk-homes' });
    
    if (org) {
      console.log(`  Organization already exists: ${org.name} (${org._id})`);
    } else {
      org = await Organization.create({
        name: 'JK Homes',
        slug: 'jk-homes',
        ownerId: ownerUser._id,
        plan: 'professional',
        settings: {
          timezone: 'Asia/Kolkata',
          dateFormat: 'DD/MM/YYYY',
          currency: 'INR'
        },
        isActive: true
      });
      console.log(`  ✅ Created organization: ${org.name} (${org._id})`);
    }

    const orgId = org._id;

    // ─── Step 3: Update owner user ───
    console.log('\nStep 3: Updating owner user...');
    await User.updateOne(
      { _id: ownerUser._id },
      { $set: { name: 'J Kamalakannan', organizationId: orgId } }
    );
    console.log('  ✅ owner@jkhomes.com → name: "J Kamalakannan", organizationId set');

    // ─── Step 4: Update admin user ───
    console.log('\nStep 4: Updating admin user...');
    const adminUser = await User.findOne({ email: 'admin@jkhomes.com' });
    if (adminUser) {
      await User.updateOne(
        { _id: adminUser._id },
        { $set: { name: 'J Kamalakannan', organizationId: orgId } }
      );
      console.log('  ✅ admin@jkhomes.com → name: "J Kamalakannan", organizationId set');
    }

    // ─── Step 5: Link all remaining users without an org to JK Homes ───
    console.log('\nStep 5: Linking all unassigned users to organization...');
    const userResult = await User.updateMany(
      { organizationId: { $exists: false } },
      { $set: { organizationId: orgId } }
    );
    const userResult2 = await User.updateMany(
      { organizationId: null },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Updated ${userResult.modifiedCount + userResult2.modifiedCount} additional users`);

    // ─── Step 6: Link all existing data to JK Homes org ───
    console.log('\nStep 6: Linking existing data to JK Homes organization...');

    // Leads
    const leadResult = await Lead.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Leads: ${leadResult.modifiedCount} linked`);

    // Activities
    const activityResult = await Activity.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Activities: ${activityResult.modifiedCount} linked`);

    // Site Visits
    const siteVisitResult = await SiteVisit.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Site Visits: ${siteVisitResult.modifiedCount} linked`);

    // Tasks
    const taskResult = await Task.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Tasks: ${taskResult.modifiedCount} linked`);

    // Inventory Items
    const inventoryResult = await InventoryItem.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Inventory Items: ${inventoryResult.modifiedCount} linked`);

    // Call Logs
    const callLogResult = await CallLog.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Call Logs: ${callLogResult.modifiedCount} linked`);

    // Broadcasts
    const broadcastResult = await Broadcast.updateMany(
      { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
      { $set: { organizationId: orgId } }
    );
    console.log(`  ✅ Broadcasts: ${broadcastResult.modifiedCount} linked`);

    // Properties (if model exists)
    if (Property) {
      const propResult = await Property.updateMany(
        { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
        { $set: { organizationId: orgId } }
      );
      console.log(`  ✅ Properties: ${propResult.modifiedCount} linked`);
    }

    // Automations (if model exists)
    if (Automation) {
      const autoResult = await Automation.updateMany(
        { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
        { $set: { organizationId: orgId } }
      );
      console.log(`  ✅ Automations: ${autoResult.modifiedCount} linked`);
    }

    // AutomationRuns
    if (AutomationRun) {
      const runResult = await AutomationRun.updateMany(
        { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
        { $set: { organizationId: orgId } }
      );
      console.log(`  ✅ Automation Runs: ${runResult.modifiedCount} linked`);
    }

    // AutomationJobs
    if (AutomationJob) {
      const jobResult = await AutomationJob.updateMany(
        { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
        { $set: { organizationId: orgId } }
      );
      console.log(`  ✅ Automation Jobs: ${jobResult.modifiedCount} linked`);
    }

    // Campaigns
    if (Campaign) {
      const campResult = await Campaign.updateMany(
        { $or: [{ organizationId: { $exists: false } }, { organizationId: null }] },
        { $set: { organizationId: orgId } }
      );
      console.log(`  ✅ Campaigns: ${campResult.modifiedCount} linked`);
    }

    // ─── Step 7: Also handle TenantConfig ───
    try {
      const TenantConfig = require('../src/models/tenantConfig.model');
      let tenantConfig = await TenantConfig.findOne({ organizationId: orgId });
      if (!tenantConfig) {
        tenantConfig = await TenantConfig.create({
          organizationId: orgId,
          businessName: 'JK Homes',
          industry: 'real_estate',
          terminology: {
            lead: 'Lead',
            property: 'Product',
            siteVisit: 'Site Visit',
            inventory: 'Catalogue'
          }
        });
        console.log(`  ✅ TenantConfig created for JK Homes`);
      } else {
        console.log(`  TenantConfig already exists for JK Homes`);
      }
    } catch (e) {
      console.log(`  ⚠️  TenantConfig model not available: ${e.message}`);
    }

    // ─── Summary ───
    console.log('\n═══════════════════════════════════════════════');
    console.log('  ✅ JK Homes Organization Setup Complete!');
    console.log('═══════════════════════════════════════════════');
    console.log(`\n  Organization: ${org.name} (${org._id})`);
    console.log(`  Owner: J Kamalakannan (owner@jkhomes.com)`);
    console.log(`  Admin: J Kamalakannan (admin@jkhomes.com)`);
    console.log(`  Plan: ${org.plan}`);
    console.log(`  Timezone: ${org.settings?.timezone}`);
    console.log(`  Currency: ${org.settings?.currency}`);
    console.log('\n  Login and check Settings → Profile to verify!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('Disconnected from MongoDB');
  }
}

setupJKHomesOrg();
