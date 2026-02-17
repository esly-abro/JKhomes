require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const Org = require('./src/models/organization.model');
    const userId = '6964ca6465727b7876df2e35';

    // Test 1: Simple string query
    let org = await Org.findOne({ ownerId: userId });
    console.log('Test 1 (string):', !!org, org?._id?.toString(), org?.whatsapp?.provider);

    // Test 2: ObjectId query
    org = await Org.findOne({ ownerId: new mongoose.Types.ObjectId(userId) });
    console.log('Test 2 (ObjectId):', !!org, org?._id?.toString(), org?.whatsapp?.provider);

    // Test 3: $in query
    org = await Org.findOne({ ownerId: { $in: [userId, new mongoose.Types.ObjectId(userId)] }, 'whatsapp.isConnected': true });
    console.log('Test 3 ($in + connected):', !!org, org?._id?.toString(), org?.whatsapp?.provider);

    // Test 4: Just ObjectId + connected
    org = await Org.findOne({ ownerId: new mongoose.Types.ObjectId(userId), 'whatsapp.isConnected': true });
    console.log('Test 4 (ObjId + connected):', !!org, org?._id?.toString(), org?.whatsapp?.provider);

    // Test 5: Direct send via Twilio service
    const twilioService = require('./src/services/whatsapp.twilio.service');
    try {
        const result = await twilioService.sendTextMessage('+919159811458', 'Hello from Pulsar CRM via Twilio! 🚀', userId);
        console.log('Test 5 (Twilio send):', JSON.stringify(result));
    } catch (e) {
        console.log('Test 5 FAILED:', e.message);
    }

    process.exit(0);
}).catch(err => { console.error(err); process.exit(1); });
