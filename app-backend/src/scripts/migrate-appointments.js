#!/usr/bin/env node

/**
 * Migration Script: Site Visit → Appointment
 * 
 * Migrates existing data to use the new generic appointment naming:
 * 1. Leads: renames siteVisitScheduled → appointmentScheduled, siteVisitDate → appointmentDate
 * 2. Leads: updates status values from 'Site Visit Booked/Scheduled' → 'Appointment Booked/Scheduled'
 * 3. SiteVisits: adds appointmentType='site_visit' to records that don't have it
 * 4. Activities: adds 'appointment' type alias for 'site_visit' activities
 * 5. Tasks: updates task types from old names to new names
 * 
 * Safe to run multiple times (idempotent). Does NOT delete old fields (virtual getters handle backward compat).
 * 
 * Usage:
 *   node src/scripts/migrate-appointments.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
const isDryRun = process.argv.includes('--dry-run');

async function migrate() {
    console.log('='.repeat(60));
    console.log('Migration: Site Visit → Appointment');
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log('='.repeat(60));

    if (!MONGODB_URI) {
        console.error('ERROR: MONGODB_URI not set in environment');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const db = mongoose.connection.db;
    const results = {
        leadsFieldsRenamed: 0,
        leadsStatusUpdated: 0,
        siteVisitsUpdated: 0,
        activitiesUpdated: 0,
        tasksUpdated: 0,
    };

    // ===== 1. Rename Lead fields =====
    console.log('--- Step 1: Rename Lead fields ---');
    const leadsCollection = db.collection('leads');
    
    // Rename siteVisitScheduled → appointmentScheduled
    const leadsWithOldField = await leadsCollection.countDocuments({
        siteVisitScheduled: { $exists: true },
        appointmentScheduled: { $exists: false }
    });
    console.log(`  Leads with siteVisitScheduled to rename: ${leadsWithOldField}`);
    
    if (!isDryRun && leadsWithOldField > 0) {
        // Copy siteVisitScheduled → appointmentScheduled
        await leadsCollection.updateMany(
            { siteVisitScheduled: { $exists: true }, appointmentScheduled: { $exists: false } },
            [{ $set: { appointmentScheduled: '$siteVisitScheduled' } }]
        );
    }

    // Rename siteVisitDate → appointmentDate
    const leadsWithOldDate = await leadsCollection.countDocuments({
        siteVisitDate: { $exists: true },
        appointmentDate: { $exists: false }
    });
    console.log(`  Leads with siteVisitDate to rename: ${leadsWithOldDate}`);
    
    if (!isDryRun && leadsWithOldDate > 0) {
        await leadsCollection.updateMany(
            { siteVisitDate: { $exists: true }, appointmentDate: { $exists: false } },
            [{ $set: { appointmentDate: '$siteVisitDate' } }]
        );
    }
    results.leadsFieldsRenamed = leadsWithOldField + leadsWithOldDate;

    // ===== 2. Update Lead status values =====
    console.log('\n--- Step 2: Update Lead status values ---');
    
    const statusMappings = [
        { from: 'Site Visit Booked', to: 'Appointment Booked' },
        { from: 'Site Visit Scheduled', to: 'Appointment Scheduled' },
    ];

    for (const mapping of statusMappings) {
        const count = await leadsCollection.countDocuments({ status: mapping.from });
        console.log(`  Leads with status '${mapping.from}': ${count}`);
        if (!isDryRun && count > 0) {
            await leadsCollection.updateMany(
                { status: mapping.from },
                { $set: { status: mapping.to } }
            );
        }
        results.leadsStatusUpdated += count;
    }

    // ===== 3. Add appointmentType to SiteVisit records =====
    console.log('\n--- Step 3: Add appointmentType to SiteVisit records ---');
    const siteVisitsCollection = db.collection('sitevisits');
    
    const visitsWithoutType = await siteVisitsCollection.countDocuments({
        appointmentType: { $exists: false }
    });
    console.log(`  SiteVisit records without appointmentType: ${visitsWithoutType}`);
    
    if (!isDryRun && visitsWithoutType > 0) {
        await siteVisitsCollection.updateMany(
            { appointmentType: { $exists: false } },
            { $set: { appointmentType: 'site_visit' } }
        );
    }
    results.siteVisitsUpdated = visitsWithoutType;

    // ===== 4. Update Activity type 'site_visit' → keep both =====
    console.log('\n--- Step 4: Check Activity types ---');
    const activitiesCollection = db.collection('activities');
    
    const siteVisitActivities = await activitiesCollection.countDocuments({ type: 'site_visit' });
    console.log(`  Activities with type 'site_visit': ${siteVisitActivities} (no change needed - both types supported)`);
    results.activitiesUpdated = 0; // No change needed, both 'site_visit' and 'appointment' are valid

    // ===== 5. Update Task types =====
    console.log('\n--- Step 5: Check Task types ---');
    const tasksCollection = db.collection('tasks');
    
    const taskTypeMappings = [
        { from: 'confirm_site_visit', to: 'confirm_appointment' },
        { from: 'update_after_visit', to: 'update_after_appointment' },
        { from: 'schedule_visit', to: 'schedule_appointment' },
    ];

    for (const mapping of taskTypeMappings) {
        const count = await tasksCollection.countDocuments({ type: mapping.from });
        console.log(`  Tasks with type '${mapping.from}': ${count}`);
        if (!isDryRun && count > 0) {
            await tasksCollection.updateMany(
                { type: mapping.from },
                { $set: { type: mapping.to } }
            );
        }
        results.tasksUpdated += count;
    }

    // ===== 6. Add appointmentType index =====
    console.log('\n--- Step 6: Ensure indexes ---');
    if (!isDryRun) {
        try {
            await siteVisitsCollection.createIndex({ appointmentType: 1 });
            console.log('  Created index on sitevisits.appointmentType');
        } catch (err) {
            console.log(`  Index on appointmentType: ${err.message}`);
        }
    } else {
        console.log('  Skipped index creation (dry run)');
    }

    // ===== Summary =====
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary:');
    console.log(`  Lead fields renamed: ${results.leadsFieldsRenamed}`);
    console.log(`  Lead statuses updated: ${results.leadsStatusUpdated}`);
    console.log(`  SiteVisit records updated: ${results.siteVisitsUpdated}`);
    console.log(`  Task types updated: ${results.tasksUpdated}`);
    console.log(`  Activities: No change needed (both types valid)`);
    if (isDryRun) {
        console.log('\n  *** DRY RUN - No changes were made ***');
        console.log('  Run without --dry-run to apply changes');
    } else {
        console.log('\n  ✓ Migration completed successfully');
    }
    console.log('='.repeat(60));

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
