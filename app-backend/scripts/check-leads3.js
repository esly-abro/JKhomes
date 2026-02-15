require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Activity = require('../src/models/Activity');
  const Lead = require('../src/models/Lead');
  
  // Get first note activity from the batch to see ALL its fields
  const firstNote = await Activity.findOne({
    type: 'note',
    createdAt: { $gte: new Date('2026-02-14T14:00:00Z'), $lte: new Date('2026-02-14T14:04:00Z') }
  }).sort({ createdAt: 1 }).lean();
  
  console.log('=== FIRST NOTE ACTIVITY (full document) ===');
  console.log(JSON.stringify(firstNote, null, 2));
  
  // Check if leads have notes text with "Gemini" or classification info
  const leadWithNotes = await Lead.findOne({ notes: { $regex: /Gemini|classified|confidence/ } }).lean();
  if (leadWithNotes) {
    console.log('\n=== LEAD WITH CLASSIFICATION NOTES ===');
    console.log('Name:', leadWithNotes.name);
    console.log('Notes:', leadWithNotes.notes?.slice(-500));
  } else {
    // Check lead notes generally
    const anyLead = await Lead.findOne({ notes: { $exists: true, $ne: null, $ne: '' } }).select('name notes').lean();
    console.log('\n=== SAMPLE LEAD NOTES ===');
    if (anyLead) {
      console.log('Name:', anyLead.name);
      console.log('Notes:', anyLead.notes?.slice(-500));
    } else {
      console.log('No leads with notes found');
    }
  }
  
  // Match note activities to leads by leadId
  const notes = await Activity.find({
    type: 'note',
    createdAt: { $gte: new Date('2026-02-14T14:00:00Z'), $lte: new Date('2026-02-14T14:04:00Z') }
  }).sort({ createdAt: 1 }).limit(3).lean();
  
  console.log('\n=== MATCHING NOTES TO LEADS ===');
  for (const n of notes) {
    const leadId = n.leadId || n.lead;
    if (leadId) {
      const lead = await Lead.findById(leadId).select('name status').lean();
      console.log(`Activity leadId: ${leadId} -> Lead: ${lead?.name}, status: ${lead?.status}`);
    } else {
      console.log('Note has no leadId/lead field');
    }
    console.log('  title:', n.title);
    console.log('  description:', n.description?.slice(0, 200));
    console.log('  metadata:', JSON.stringify(n.metadata || {}).slice(0, 200));
  }
  
  // Check if the status was also updated in Zoho (check Lead_Status field in Zoho)
  // For now, check if Zoho still has original statuses by looking at the mapZohoLeadToFrontend
  const sampleLead = await Lead.findOne({}).select('name status lastStatusChange pendingZohoSync statusSyncedToZoho statusUpdatedAt').lean();
  console.log('\n=== SAMPLE LEAD STATUS FIELDS ===');
  console.log(JSON.stringify(sampleLead, null, 2));
  
  await mongoose.disconnect();
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
