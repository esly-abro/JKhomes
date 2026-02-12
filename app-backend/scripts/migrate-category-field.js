#!/usr/bin/env node
/**
 * Migration Script: propertyType → category
 * 
 * This script migrates existing data from the old `propertyType` field
 * to the new `category` field on both Lead and Property documents.
 * 
 * Safe to run multiple times (idempotent).
 * 
 * Usage:
 *   node scripts/migrate-category-field.js
 * 
 * Options:
 *   --dry-run    Preview changes without writing to database
 *   --verbose    Show detailed per-document changes
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment config
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

async function migrate() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  
  if (!mongoUri) {
    console.error('❌ No MONGODB_URI or MONGO_URI found in environment.');
    console.error('   Set it in app-backend/.env or as an environment variable.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('  Migration: propertyType → category');
  console.log('='.repeat(60));
  console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (writing changes)'}`);
  console.log(`  Database: ${mongoUri.replace(/\/\/.*@/, '//***@')}`);
  console.log('='.repeat(60));
  console.log();

  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ── 1. Migrate Leads ──────────────────────────────────────────
  console.log('── Migrating Leads ──');
  const leadsCollection = db.collection('leads');

  // Find leads that have propertyType but no category
  const leadsToMigrate = await leadsCollection.find({
    propertyType: { $exists: true, $ne: null, $ne: '' },
    $or: [
      { category: { $exists: false } },
      { category: null },
      { category: '' }
    ]
  }).toArray();

  console.log(`  Found ${leadsToMigrate.length} leads to migrate`);

  if (leadsToMigrate.length > 0) {
    if (VERBOSE) {
      leadsToMigrate.forEach(lead => {
        console.log(`    Lead ${lead._id}: propertyType="${lead.propertyType}" → category="${lead.propertyType}"`);
      });
    }

    if (!DRY_RUN) {
      const leadResult = await leadsCollection.updateMany(
        {
          propertyType: { $exists: true, $ne: null, $ne: '' },
          $or: [
            { category: { $exists: false } },
            { category: null },
            { category: '' }
          ]
        },
        [
          { $set: { category: '$propertyType' } }
        ]
      );
      console.log(`  ✅ Updated ${leadResult.modifiedCount} leads`);
    } else {
      console.log(`  🔍 Would update ${leadsToMigrate.length} leads`);
    }
  }

  // Also set category on leads where it already exists (sync check)
  const leadsWithBoth = await leadsCollection.countDocuments({
    propertyType: { $exists: true, $ne: null },
    category: { $exists: true, $ne: null }
  });
  console.log(`  ℹ️  ${leadsWithBoth} leads already have both fields (no action needed)`);

  // ── 2. Migrate Properties ─────────────────────────────────────
  console.log('\n── Migrating Properties ──');
  const propertiesCollection = db.collection('properties');

  const propertiesToMigrate = await propertiesCollection.find({
    propertyType: { $exists: true, $ne: null, $ne: '' },
    $or: [
      { category: { $exists: false } },
      { category: null },
      { category: '' }
    ]
  }).toArray();

  console.log(`  Found ${propertiesToMigrate.length} properties to migrate`);

  if (propertiesToMigrate.length > 0) {
    if (VERBOSE) {
      propertiesToMigrate.forEach(prop => {
        console.log(`    Property ${prop._id} "${prop.name}": propertyType="${prop.propertyType}" → category="${prop.propertyType}"`);
      });
    }

    if (!DRY_RUN) {
      const propResult = await propertiesCollection.updateMany(
        {
          propertyType: { $exists: true, $ne: null, $ne: '' },
          $or: [
            { category: { $exists: false } },
            { category: null },
            { category: '' }
          ]
        },
        [
          { $set: { category: '$propertyType' } }
        ]
      );
      console.log(`  ✅ Updated ${propResult.modifiedCount} properties`);
    } else {
      console.log(`  🔍 Would update ${propertiesToMigrate.length} properties`);
    }
  }

  // ── 3. Migrate Automations (triggerConditions) ─────────────────
  console.log('\n── Migrating Automations ──');
  const automationsCollection = db.collection('automations');

  const automationsToMigrate = await automationsCollection.find({
    'triggerConditions.propertyTypes': { $exists: true, $not: { $size: 0 } },
    $or: [
      { 'triggerConditions.categories': { $exists: false } },
      { 'triggerConditions.categories': { $size: 0 } }
    ]
  }).toArray();

  console.log(`  Found ${automationsToMigrate.length} automations to migrate`);

  if (automationsToMigrate.length > 0) {
    if (VERBOSE) {
      automationsToMigrate.forEach(auto => {
        console.log(`    Automation ${auto._id} "${auto.name}": propertyTypes=${JSON.stringify(auto.triggerConditions?.propertyTypes)} → categories`);
      });
    }

    if (!DRY_RUN) {
      const autoResult = await automationsCollection.updateMany(
        {
          'triggerConditions.propertyTypes': { $exists: true, $not: { $size: 0 } },
          $or: [
            { 'triggerConditions.categories': { $exists: false } },
            { 'triggerConditions.categories': { $size: 0 } }
          ]
        },
        [
          { $set: { 'triggerConditions.categories': '$triggerConditions.propertyTypes' } }
        ]
      );
      console.log(`  ✅ Updated ${autoResult.modifiedCount} automations`);
    } else {
      console.log(`  🔍 Would update ${automationsToMigrate.length} automations`);
    }
  }

  // ── 4. Create indexes ──────────────────────────────────────────
  console.log('\n── Creating Indexes ──');
  if (!DRY_RUN) {
    try {
      await leadsCollection.createIndex({ category: 1 });
      console.log('  ✅ Created index on leads.category');
    } catch (e) {
      console.log(`  ℹ️  Index on leads.category: ${e.message}`);
    }

    try {
      await propertiesCollection.createIndex({ category: 1 });
      console.log('  ✅ Created index on properties.category');
    } catch (e) {
      console.log(`  ℹ️  Index on properties.category: ${e.message}`);
    }
  } else {
    console.log('  🔍 Would create indexes on leads.category and properties.category');
  }

  // ── Summary ────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('  Migration Summary');
  console.log('='.repeat(60));

  const totalLeads = await leadsCollection.countDocuments({});
  const leadsWithCategory = await leadsCollection.countDocuments({ category: { $exists: true, $ne: null, $ne: '' } });
  const totalProperties = await propertiesCollection.countDocuments({});
  const propsWithCategory = await propertiesCollection.countDocuments({ category: { $exists: true, $ne: null, $ne: '' } });

  console.log(`  Leads:       ${leadsWithCategory}/${totalLeads} have category field`);
  console.log(`  Properties:  ${propsWithCategory}/${totalProperties} have category field`);
  
  if (DRY_RUN) {
    console.log('\n  ⚠️  This was a DRY RUN. No changes were made.');
    console.log('     Run without --dry-run to apply changes.');
  } else {
    console.log('\n  ✅ Migration complete!');
    console.log('     The old propertyType field is preserved for backward compatibility.');
    console.log('     You can optionally remove it later with:');
    console.log('       db.leads.updateMany({}, { $unset: { propertyType: 1 } })');
    console.log('       db.properties.updateMany({}, { $unset: { propertyType: 1 } })');
  }

  console.log('='.repeat(60));

  await mongoose.disconnect();
  console.log('\n✅ Disconnected from MongoDB');
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err);
  mongoose.disconnect();
  process.exit(1);
});
