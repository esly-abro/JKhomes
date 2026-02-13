/**
 * Quick fix: Link real agents to JK Homes organization
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('../src/models/User');
  
  const orgId = new mongoose.Types.ObjectId('698f32deaabae903f2021406');
  
  // These are real agents that registered with personal emails
  const agentEmails = [
    'eslykabro@gmail.com',
    'akil@gmail.com', 
    'esly@gmail.com',
    'test@gmail.com'
  ];
  
  // Link them to JK Homes org and activate them
  const result = await User.updateMany(
    { email: { $in: agentEmails } },
    { $set: { organizationId: orgId, isActive: true } }
  );
  console.log(`Updated ${result.modifiedCount} agents - linked to JK Homes and activated`);
  
  // Also activate the test agent@jkhomes.com
  await User.updateOne(
    { email: 'agent@jkhomes.com' },
    { $set: { isActive: true } }
  );
  console.log('Activated agent@jkhomes.com');
  
  // Show all JK Homes agents
  const agents = await User.find({ organizationId: orgId })
    .select('name email role isActive organizationId')
    .lean();
  
  console.log('\nAll JK Homes users:');
  agents.forEach(u => console.log(`  ${u.role.padEnd(8)} | ${u.name.padEnd(20)} | ${u.email.padEnd(30)} | active: ${u.isActive}`));
  console.log(`Total: ${agents.length}`);
  
  await mongoose.connection.close();
})();
