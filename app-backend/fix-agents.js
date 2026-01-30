require('dotenv').config();
const mongoose = require('mongoose');

async function fixAgents() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    const result = await mongoose.connection.db.collection('users').updateMany(
        { role: 'agent' },
        { $set: { isActive: true, approvalStatus: 'approved' } }
    );

    console.log('Updated', result.modifiedCount, 'agent documents');

    // Verify the updates
    const agents = await mongoose.connection.db.collection('users').find({ role: 'agent' }).toArray();
    console.log('Agents now:');
    agents.forEach(a => {
        console.log(`  - ${a.name} (${a.email}): isActive=${a.isActive}, approvalStatus=${a.approvalStatus}`);
    });

    await mongoose.disconnect();
    console.log('Done!');
}

fixAgents().catch(console.error);
