const mongoose = require('mongoose');
require('dotenv').config();

async function checkLeads() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const Lead = mongoose.model('Lead', new mongoose.Schema({}, { strict: false, collection: 'leads' }));
        
        // Search for bhuvan
        const bhuvanLeads = await Lead.find({ name: { $regex: 'bhuvan', $options: 'i' } }).lean();
        console.log('\n=== Leads matching "bhuvan" ===');
        console.log('Found:', bhuvanLeads.length);
        
        if (bhuvanLeads.length > 0) {
            console.log('Data:', JSON.stringify(bhuvanLeads[0], null, 2));
        }
        
        // Count total leads
        const total = await Lead.countDocuments();
        console.log('\n=== Total leads in MongoDB ===');
        console.log('Count:', total);
        
        // Get last 5 created leads
        const recentLeads = await Lead.find().sort({ createdAt: -1 }).limit(5).lean();
        console.log('\n=== Most recent 5 leads ===');
        recentLeads.forEach((l, i) => {
            console.log(`${i+1}. ${l.name || 'No Name'} | ID: ${l.zohoId || l._id} | Created: ${l.createdAt || 'N/A'}`);
        });
        
        await mongoose.disconnect();
        console.log('\nDone!');
    } catch (e) {
        console.error('Error:', e.message);
        process.exit(1);
    }
}

checkLeads();
