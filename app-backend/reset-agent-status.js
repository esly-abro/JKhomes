require('dotenv').config();
const mongoose = require('mongoose');

async function resetAgentStatus() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    // Set all agents to inactive (simulating they are logged out)
    const result = await mongoose.connection.db.collection('users').updateMany(
        { role: 'agent' },
        { $set: { isActive: false } }
    );

    console.log('Set', result.modifiedCount, 'agents to inactive');

    // Verify
    const agents = await mongoose.connection.db.collection('users').find({ role: 'agent' }).toArray();
    console.log('Agent status:');
    agents.forEach(a => {
        console.log(`  - ${a.name} (${a.email}): isActive=${a.isActive}`);
    });

    await mongoose.disconnect();
    console.log('Done! Agents will now show as Active only when logged in.');
}

resetAgentStatus().catch(console.error);
