require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Lead = require('../src/models/Lead');
  
  const statuses = await Lead.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  console.log('Current status distribution:', JSON.stringify(statuses, null, 2));
  
  const total = await Lead.countDocuments({});
  console.log('Total leads:', total);
  
  // Check a few specific leads
  const samples = await Lead.find({}).select('name status updatedAt').sort({ updatedAt: -1 }).limit(10).lean();
  console.log('\nLast 10 updated leads:');
  for (const l of samples) {
    console.log(`  ${l.name}: ${l.status} (updated: ${new Date(l.updatedAt).toISOString()})`);
  }
  
  await mongoose.disconnect();
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
