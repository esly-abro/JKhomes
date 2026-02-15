require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Activity = require('../src/models/Activity');
  const Lead = require('../src/models/Lead');
  
  // Check activity types
  const types = await Activity.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]);
  console.log('Activity types:', JSON.stringify(types));
  
  // Check recent activities around 14:03 UTC
  const around = new Date('2026-02-14T14:00:00Z');
  const after = new Date('2026-02-14T14:10:00Z');
  const recentActivities = await Activity.find({
    createdAt: { $gte: around, $lte: after }
  }).sort({ createdAt: -1 }).limit(20).lean();
  
  console.log('\nActivities around 14:00-14:10 UTC:', recentActivities.length);
  for (const a of recentActivities) {
    console.log(`  type: ${a.type} | ${new Date(a.createdAt).toISOString()} | lead: ${a.lead}`);
  }
  
  // Check if any leads have zohoId (could sync from Zoho)
  const withZoho = await Lead.countDocuments({ zohoId: { $exists: true, $ne: null } });
  const withoutZoho = await Lead.countDocuments({ $or: [{ zohoId: { $exists: false } }, { zohoId: null }] });
  console.log('\nLeads with zohoId:', withZoho);
  console.log('Leads without zohoId:', withoutZoho);
  
  // Check Zoho sync data - can we get original statuses from Zoho fields?
  const sampleLeads = await Lead.find({}).select('name status zohoId zohoData zohoStatus createdAt updatedAt').limit(10).lean();
  console.log('\nSample leads with Zoho data:');
  for (const l of sampleLeads) {
    console.log(`  ${l.name} | status: ${l.status} | zohoId: ${l.zohoId || 'none'} | zohoStatus: ${l.zohoStatus || 'none'} | created: ${new Date(l.createdAt).toISOString()}`);
    if (l.zohoData) console.log('    zohoData keys:', Object.keys(l.zohoData).join(', '));
  }
  
  // Also check lead notes for AI Call Result timestamps to see which were actually called
  const leadsWithCallNotes = await Lead.find({ notes: /AI Call Result/ }).select('name status notes').lean();
  console.log('\nLeads with AI Call Result notes:', leadsWithCallNotes.length);
  for (const l of leadsWithCallNotes) {
    // Extract the dates from notes
    const matches = l.notes.match(/AI Call Result \(([^)]+)\)/g);
    console.log(`  ${l.name}: ${matches ? matches.length : 0} calls`);
  }
  
  // Check the exact update timestamps to understand the pattern better
  const allLeads = await Lead.find({}).select('name status updatedAt createdAt').sort({ updatedAt: -1 }).lean();
  
  // Group by update timestamp (rounded to minute)
  const byMinute = {};
  for (const l of allLeads) {
    const min = new Date(l.updatedAt).toISOString().slice(0, 16);
    byMinute[min] = (byMinute[min] || 0) + 1;
  }
  console.log('\nLeads grouped by update minute:');
  for (const [min, count] of Object.entries(byMinute).sort()) {
    console.log(`  ${min}: ${count} leads`);
  }
  
  await mongoose.disconnect();
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
