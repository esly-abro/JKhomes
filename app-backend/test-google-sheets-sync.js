/**
 * Test Google Sheets Integration
 * Run this script to test the property sync functionality
 * 
 * Usage: node test-google-sheets-sync.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const googleSheetsService = require('./src/services/googleSheets.service');
const Property = require('./src/properties/properties.model');

const MONGODB_URI = process.env.MONGODB_URI;
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

async function testGoogleSheetsSync() {
    console.log('\n========================================');
    console.log('Google Sheets Integration Test');
    console.log('========================================\n');

    // Check configuration
    console.log('1. Checking configuration...');
    
    if (!GOOGLE_APPS_SCRIPT_URL) {
        console.log('❌ GOOGLE_APPS_SCRIPT_URL is not configured in .env');
        console.log('\nPlease follow the setup instructions in GOOGLE_SHEETS_SETUP.md');
        console.log('to deploy the Google Apps Script and get the Web App URL.\n');
        return;
    }
    
    console.log('✅ GOOGLE_APPS_SCRIPT_URL is configured');
    console.log(`   URL: ${GOOGLE_APPS_SCRIPT_URL.substring(0, 60)}...`);

    // Test connection to Google Sheets
    console.log('\n2. Testing Google Sheets connection...');
    try {
        const status = await googleSheetsService.getSyncStatus();
        if (status.configured) {
            console.log('✅ Google Sheets connection successful');
            console.log(`   Sheet: ${status.sheetName}`);
            console.log(`   Total Properties: ${status.totalProperties}`);
        } else {
            console.log('❌ Google Sheets not properly configured');
            console.log(`   Error: ${status.message || status.error}`);
            return;
        }
    } catch (error) {
        console.log('❌ Failed to connect to Google Sheets');
        console.log(`   Error: ${error.message}`);
        return;
    }

    // Connect to MongoDB
    console.log('\n3. Connecting to MongoDB...');
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.log('❌ Failed to connect to MongoDB');
        console.log(`   Error: ${error.message}`);
        return;
    }

    // Fetch properties
    console.log('\n4. Fetching properties from database...');
    try {
        const properties = await Property.find({})
            .populate('assignedAgent', 'name email phone');
        
        console.log(`✅ Found ${properties.length} properties`);
        
        if (properties.length === 0) {
            console.log('\n⚠️  No properties found in database.');
            console.log('   Add some properties through the app first.\n');
            await mongoose.disconnect();
            return;
        }

        // Display sample property
        const sample = properties[0];
        console.log('\n   Sample property:');
        console.log(`   - Name: ${sample.name}`);
        console.log(`   - Type: ${sample.propertyType}`);
        console.log(`   - Location: ${sample.location}`);
        console.log(`   - Status: ${sample.status}`);
    } catch (error) {
        console.log('❌ Failed to fetch properties');
        console.log(`   Error: ${error.message}`);
        await mongoose.disconnect();
        return;
    }

    // Sync to Google Sheets
    console.log('\n5. Syncing properties to Google Sheets...');
    try {
        const properties = await Property.find({})
            .populate('assignedAgent', 'name email phone');
        
        const result = await googleSheetsService.syncAllProperties(properties);
        
        if (result.success) {
            console.log('✅ Sync completed successfully!');
            console.log(`   Action: ${result.action}`);
            console.log(`   Properties synced: ${result.count}`);
        } else {
            console.log('❌ Sync failed');
            console.log(`   Error: ${result.error}`);
        }
    } catch (error) {
        console.log('❌ Sync error');
        console.log(`   Error: ${error.message}`);
    }

    // Disconnect
    await mongoose.disconnect();
    console.log('\n✅ Test completed. Disconnected from MongoDB.');
    
    console.log('\n========================================');
    console.log('Next Steps:');
    console.log('========================================');
    console.log('1. Open your Google Sheet to verify the data:');
    console.log('   https://docs.google.com/spreadsheets/d/1FWMTLGGPV8MfhsMpz7L8FDpeL8YVUQtAed0HKBlZFtw/edit');
    console.log('\n2. The "Properties" sheet should now contain all your property data.');
    console.log('\n3. Configure ElevenLabs to use this sheet for property information.');
    console.log('\n');
}

// Run the test
testGoogleSheetsSync().catch(console.error);
