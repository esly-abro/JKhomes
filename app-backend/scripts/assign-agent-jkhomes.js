/**
 * Assign existing ElevenLabs "Pulsar" agent to JK Homes organization
 * 
 * This maps agent_3901kgrjk9nvffq9hg9xtz3fkjpp → JK Homes org in the DB
 * so the org-scoped agent management system recognizes it.
 * 
 * Run once: node scripts/assign-agent-jkhomes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Organization = require('../src/models/organization.model');
const ElevenLabsAgent = require('../src/models/elevenLabsAgent.model');

const AGENT_ID = 'agent_3901kgrjk9nvffq9hg9xtz3fkjpp';
const AGENT_NAME = 'Pulsar';
const OWNER_EMAIL = 'owner@jkhomes.com';

async function main() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/jkhomes';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);

    // 1. Find the JK Homes owner user
    const owner = await User.findOne({ email: OWNER_EMAIL });
    if (!owner) {
        console.error(`❌ User ${OWNER_EMAIL} not found`);
        process.exit(1);
    }
    console.log(`✅ Found owner: ${owner.name} (${owner._id})`);

    // 2. Find the JK Homes organization
    const org = await Organization.findByUser(owner._id);
    if (!org) {
        console.error('❌ Organization not found for owner');
        process.exit(1);
    }
    console.log(`✅ Found org: ${org.name} (${org._id})`);

    // 3. Check if agent already exists in DB
    const existing = await ElevenLabsAgent.findOne({ agentId: AGENT_ID });
    if (existing) {
        console.log(`⚠️ Agent ${AGENT_ID} already mapped to org ${existing.organizationId}`);
        if (existing.organizationId.toString() === org._id.toString()) {
            console.log('✅ Already correctly assigned to JK Homes — updating isDefault');
            existing.isDefault = true;
            existing.name = AGENT_NAME;
            await existing.save();
            console.log('✅ Done!');
        } else {
            console.log(`⚠️ Currently mapped to different org: ${existing.organizationId}`);
            console.log('Reassigning to JK Homes...');
            existing.organizationId = org._id;
            existing.isDefault = true;
            existing.name = AGENT_NAME;
            await existing.save();
            console.log('✅ Reassigned to JK Homes!');
        }
        await mongoose.disconnect();
        return;
    }

    // 4. Create the mapping
    const agentDoc = await ElevenLabsAgent.create({
        agentId: AGENT_ID,
        organizationId: org._id,
        createdBy: owner._id,
        name: AGENT_NAME,
        isDefault: true,
    });

    console.log(`\n✅ Agent "${AGENT_NAME}" (${AGENT_ID}) assigned to ${org.name}`);
    console.log(`   DB record: ${agentDoc._id}`);
    console.log(`   isDefault: true`);

    await mongoose.disconnect();
    console.log('\nDone!');
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
