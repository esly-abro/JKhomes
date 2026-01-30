// Quick script to generate password hashes
const bcrypt = require('bcrypt');

async function generateHashes() {
    const admin = await bcrypt.hash('admin123', 10);
    const agent = await bcrypt.hash('agent123', 10);
    const manager = await bcrypt.hash('manager123', 10);

    console.log('\nPassword Hashes:');
    console.log('================');
    console.log('admin@example.com (admin123):');
    console.log(admin);
    console.log('\nagent@example.com (agent123):');
    console.log(agent);
    console.log('\nmanager@example.com (manager123):');
    console.log(manager);
    console.log('\n');
}

generateHashes();
