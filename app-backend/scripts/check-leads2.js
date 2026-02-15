require('dotenv').config();
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Activity = require('../src/models/Activity');
  const Lead = require('../src/models/Lead');
  
  // Get the note activities from 14:02-14:04 and see what they contain
  const around = new Date('2026-02-14T14:02:00Z');
  const after = new Date('2026-02-14T14:04:00Z');
  const notes = await Activity.find({
    type: 'note',
    createdAt: { $gte: around, $lte: after }
  }).sort({ createdAt: 1 }).limit(5).lean();
  
  console.log('Note activities from 14:02-14:04:');
  for (const n of notes) {
    console.log('---');
    console.log('Lead:', n.lead, '| Created:', new Date(n.createdAt).toISOString());
    console.log('Content:', JSON.stringify(n.content || n.note || n.text || n.description || '?').slice(0, 300));
    // Print all keys
    console.log('Keys:', Object.keys(n).join(', '));
  }
  
  // Check what backend server was doing - look at the ElevenLabs webhook route
  // But first: how many Activities of type 'note' were created between 14:00-14:04?
  const noteCount = await Activity.countDocuments({
    type: 'note',
    createdAt: { $gte: new Date('2026-02-14T14:00:00Z'), $lte: new Date('2026-02-14T14:04:00Z') }
  });
  console.log('\nTotal notes 14:00-14:04:', noteCount);
  
  // Check ElevenLabs incoming webhook - look at the handleWebhook method
  // First: was there a conversation_id pattern in recent automation runs?
  const AutomationRun = require('../src/models/AutomationRun');
  const recentRuns = await AutomationRun.find({}).sort({ updatedAt: -1 }).limit(5).lean();
  console.log('\nRecent AutomationRun states:');
  for (const r of recentRuns) {
    console.log(`  ${r.context?.lead?.name} | status: ${r.status} | waitingForCall: ${JSON.stringify(r.waitingForCall)?.slice(0, 200)}`);
  }
  
  // KEY: check the webhook flow - did handleWebhook loop all leads?
  // The handleWebhook method receives a webhook and calls updateLeadWithCallResult
  // But it should only update ONE lead per call
  
  // Check: were there exactly 90 notes created in the 14:00-14:03 window?
  const allNotes1403 = await Activity.countDocuments({
    type: 'note', 
    createdAt: { $gte: new Date('2026-02-14T14:00:00Z'), $lte: new Date('2026-02-14T14:04:00Z') }
  });
  
  const callActs = await Activity.countDocuments({
    type: 'call', 
    createdAt: { $gte: new Date('2026-02-14T14:00:00Z'), $lte: new Date('2026-02-14T14:04:00Z') }
  });
  
  console.log('\nNotes in 14:00-14:04:', allNotes1403);
  console.log('Calls in 14:00-14:04:', callActs);
  
  // Maybe there's a sync-from-zoho that pulls Lead_Status?
  // Check the sync controller
  const allLogs = await Activity.find({
    createdAt: { $gte: new Date('2026-02-14T13:58:00Z'), $lte: new Date('2026-02-14T14:07:00Z') }  
  }).sort({ createdAt: 1 }).lean();
  
  console.log('\nALL activities from 13:58-14:07 (' + allLogs.length + ' total):');
  for (const a of allLogs) {
    console.log(`  ${new Date(a.createdAt).toISOString()} | ${a.type} | lead: ${a.lead}`);
  }
  
  await mongoose.disconnect();
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
