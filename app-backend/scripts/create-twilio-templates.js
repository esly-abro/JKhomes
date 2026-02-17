/**
 * Create Twilio Content Templates for WhatsApp
 * 
 * Usage: node scripts/create-twilio-templates.js
 * 
 * Creates 3 ready-to-use templates:
 *   1. welcome_message - Greet new leads
 *   2. site_visit_reminder - Appointment reminder
 *   3. follow_up - Follow-up after no response
 */

process.chdir(__dirname + '/..');
require('dotenv').config();

const mongoose = require('mongoose');
const Organization = require('../src/models/organization.model');

const TEMPLATES = [
    {
        friendly_name: 'welcome_message',
        language: 'en',
        variables: { '1': 'name', '2': 'company' },
        types: {
            'twilio/text': {
                body: 'Hi {{1}}! 👋 Welcome to {{2}}. We are excited to help you find your dream property. Reply YES if you would like to know more!'
            }
        }
    },
    {
        friendly_name: 'site_visit_reminder',
        language: 'en',
        variables: { '1': 'name', '2': 'date', '3': 'location' },
        types: {
            'twilio/text': {
                body: 'Hello {{1}}, this is a reminder for your property visit scheduled on {{2}} at {{3}}. Reply CONFIRM to confirm or RESCHEDULE to pick a new time.'
            }
        }
    },
    {
        friendly_name: 'follow_up',
        language: 'en',
        variables: { '1': 'name' },
        types: {
            'twilio/text': {
                body: 'Hi {{1}}, we noticed you were interested in our properties. Would you like to schedule a visit? Reply YES to get started or CALL ME and our team will reach out. 🏠'
            }
        }
    }
];

async function main() {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('❌ MONGODB_URI not found in .env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Find org with Twilio credentials
    const org = await Organization.findOne({ 'whatsapp.provider': 'twilio', 'whatsapp.isConnected': true });
    if (!org) {
        console.error('❌ No organization with Twilio WhatsApp found');
        process.exit(1);
    }

    let accountSid, authToken;
    try {
        accountSid = org.whatsapp.twilioAccountSid;
        authToken = org.whatsapp.twilioAuthToken;
    } catch (e) {
        console.error('❌ Could not decrypt Twilio credentials:', e.message);
        process.exit(1);
    }

    if (!accountSid || !authToken) {
        console.error('❌ Twilio credentials are empty');
        process.exit(1);
    }

    console.log(`📱 Using Twilio Account: ${accountSid}`);
    console.log(`📱 Org: ${org.name} (${org._id})`);

    // Create Twilio client
    const twilio = require('twilio');
    const client = twilio(accountSid, authToken);

    // List existing templates
    console.log('\n📋 Existing Content Templates:');
    try {
        const existing = await client.content.v1.contents.list({ limit: 50 });
        if (existing.length === 0) {
            console.log('   (none)');
        } else {
            for (const t of existing) {
                console.log(`   • ${t.friendlyName} (${t.sid}) - ${Object.keys(t.types || {}).join(', ')}`);
            }
        }
    } catch (e) {
        console.log(`   ⚠️ Could not list: ${e.message}`);
    }

    // Create new templates
    console.log('\n🔨 Creating templates...\n');

    for (const tmpl of TEMPLATES) {
        try {
            // Check if already exists
            const existing = await client.content.v1.contents.list({ limit: 100 });
            const dupe = existing.find(e => e.friendlyName === tmpl.friendly_name);
            if (dupe) {
                console.log(`⏭️  "${tmpl.friendly_name}" already exists (${dupe.sid}) — skipping`);
                continue;
            }

            const result = await client.content.v1.contents.create(tmpl);
            console.log(`✅ Created "${tmpl.friendly_name}" → SID: ${result.sid}`);
        } catch (e) {
            console.error(`❌ Failed to create "${tmpl.friendly_name}": ${e.message}`);
            if (e.message.includes('not enabled') || e.message.includes('upgrade')) {
                console.log('   💡 Content API may require account upgrade. Try creating templates at:');
                console.log('      https://console.twilio.com/develop/sms/content-template-builder');
                break;
            }
        }
    }

    // List all templates after creation
    console.log('\n📋 Final template list:');
    try {
        const all = await client.content.v1.contents.list({ limit: 50 });
        for (const t of all) {
            const body = t.types?.['twilio/text']?.body || '(no body)';
            console.log(`   ✅ ${t.friendlyName} (${t.sid})`);
            console.log(`      Body: ${body.substring(0, 80)}...`);
        }
        if (all.length === 0) {
            console.log('   (none created — see instructions above)');
        }
    } catch (e) {
        console.log(`   ⚠️ Could not list: ${e.message}`);
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
