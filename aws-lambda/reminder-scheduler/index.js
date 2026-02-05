/**
 * AWS Lambda Function - Reminder Scheduler
 * 
 * Runs daily at 8 AM IST (2:30 AM UTC) via EventBridge
 * Checks MongoDB for site visits and sends reminders:
 * - 1 day before: REMINDER_1_DAY
 * - Same day: REMINDER_TODAY
 * 
 * Environment Variables:
 * - MONGODB_URI: MongoDB connection string
 * - EMAIL_API_ENDPOINT: API Gateway endpoint for email Lambda
 * - EMAIL_API_KEY: API key for authentication
 * - COMPANY_NAME: Company name (default: JK Construction)
 */

const https = require('https');
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const EMAIL_API_ENDPOINT = process.env.EMAIL_API_ENDPOINT;
const EMAIL_API_KEY = process.env.EMAIL_API_KEY;
const COMPANY_NAME = process.env.COMPANY_NAME || 'JK Construction';

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    
    const client = await MongoClient.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });
    
    cachedDb = client.db();
    return cachedDb;
}

/**
 * Send email via API Gateway
 */
async function sendEmail(payload) {
    return new Promise((resolve, reject) => {
        const url = new URL(EMAIL_API_ENDPOINT);
        
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': EMAIL_API_KEY
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data });
                }
            });
        });
        
        req.on('error', reject);
        req.write(JSON.stringify(payload));
        req.end();
    });
}

/**
 * Get start and end of a day in IST
 */
function getISTDateRange(daysFromNow = 0) {
    const now = new Date();
    
    // Add days offset
    now.setDate(now.getDate() + daysFromNow);
    
    // Set to start of day in IST (UTC+5:30)
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0 - 5, 0 - 30, 0, 0); // Convert IST midnight to UTC
    
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCHours(endOfDay.getUTCHours() + 24);
    
    return { start: startOfDay, end: endOfDay };
}

exports.handler = async (event) => {
    console.log('Reminder Scheduler triggered at:', new Date().toISOString());
    
    if (!MONGODB_URI || !EMAIL_API_ENDPOINT || !EMAIL_API_KEY) {
        console.error('Missing required environment variables');
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Missing configuration' })
        };
    }
    
    try {
        const db = await connectToDatabase();
        const siteVisitsCollection = db.collection('sitevisits');
        const leadsCollection = db.collection('leads');
        const propertiesCollection = db.collection('properties');
        const usersCollection = db.collection('users');
        
        const results = {
            todayReminders: [],
            tomorrowReminders: [],
            errors: []
        };
        
        // Get date ranges
        const today = getISTDateRange(0);
        const tomorrow = getISTDateRange(1);
        
        console.log('Checking visits for TODAY:', today.start, 'to', today.end);
        console.log('Checking visits for TOMORROW:', tomorrow.start, 'to', tomorrow.end);
        
        // Find visits scheduled for TODAY
        const todayVisits = await siteVisitsCollection.find({
            scheduledAt: { $gte: today.start, $lt: today.end },
            status: 'scheduled'
        }).toArray();
        
        console.log(`Found ${todayVisits.length} visits for today`);
        
        // Find visits scheduled for TOMORROW
        const tomorrowVisits = await siteVisitsCollection.find({
            scheduledAt: { $gte: tomorrow.start, $lt: tomorrow.end },
            status: 'scheduled'
        }).toArray();
        
        console.log(`Found ${tomorrowVisits.length} visits for tomorrow`);
        
        // Process TODAY reminders
        for (const visit of todayVisits) {
            try {
                // Get lead details
                const lead = await leadsCollection.findOne({ zohoId: visit.leadId });
                if (!lead || !lead.email) {
                    console.log(`Skipping visit ${visit._id}: No lead email`);
                    continue;
                }
                
                // Get property details
                const property = visit.propertyId ? 
                    await propertiesCollection.findOne({ _id: visit.propertyId }) : null;
                
                // Get agent details
                const agent = visit.agentId ?
                    await usersCollection.findOne({ _id: visit.agentId }) : null;
                
                const emailPayload = {
                    type: 'REMINDER_TODAY',
                    lead: {
                        name: lead.name,
                        email: lead.email,
                        phone: lead.phone
                    },
                    siteVisit: {
                        scheduledAt: visit.scheduledAt,
                        agentName: agent?.name || visit.agentName || 'Our representative'
                    },
                    property: property ? {
                        name: property.name,
                        address: property.address || property.location
                    } : null,
                    metadata: { companyName: COMPANY_NAME }
                };
                
                const result = await sendEmail(emailPayload);
                results.todayReminders.push({
                    visitId: visit._id,
                    leadEmail: lead.email,
                    result
                });
                console.log(`✅ Sent TODAY reminder to ${lead.email}`);
                
            } catch (error) {
                console.error(`❌ Failed to send TODAY reminder for visit ${visit._id}:`, error.message);
                results.errors.push({
                    visitId: visit._id,
                    type: 'TODAY',
                    error: error.message
                });
            }
        }
        
        // Process TOMORROW reminders
        for (const visit of tomorrowVisits) {
            try {
                // Get lead details
                const lead = await leadsCollection.findOne({ zohoId: visit.leadId });
                if (!lead || !lead.email) {
                    console.log(`Skipping visit ${visit._id}: No lead email`);
                    continue;
                }
                
                // Get property details
                const property = visit.propertyId ?
                    await propertiesCollection.findOne({ _id: visit.propertyId }) : null;
                
                // Get agent details
                const agent = visit.agentId ?
                    await usersCollection.findOne({ _id: visit.agentId }) : null;
                
                const emailPayload = {
                    type: 'REMINDER_1_DAY',
                    lead: {
                        name: lead.name,
                        email: lead.email,
                        phone: lead.phone
                    },
                    siteVisit: {
                        scheduledAt: visit.scheduledAt,
                        agentName: agent?.name || visit.agentName || 'Our representative'
                    },
                    property: property ? {
                        name: property.name,
                        address: property.address || property.location
                    } : null,
                    metadata: { companyName: COMPANY_NAME }
                };
                
                const result = await sendEmail(emailPayload);
                results.tomorrowReminders.push({
                    visitId: visit._id,
                    leadEmail: lead.email,
                    result
                });
                console.log(`✅ Sent TOMORROW reminder to ${lead.email}`);
                
            } catch (error) {
                console.error(`❌ Failed to send TOMORROW reminder for visit ${visit._id}:`, error.message);
                results.errors.push({
                    visitId: visit._id,
                    type: 'TOMORROW',
                    error: error.message
                });
            }
        }
        
        console.log('Reminder Scheduler completed:', JSON.stringify(results, null, 2));
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                summary: {
                    todayReminders: results.todayReminders.length,
                    tomorrowReminders: results.tomorrowReminders.length,
                    errors: results.errors.length
                },
                details: results
            })
        };
        
    } catch (error) {
        console.error('Reminder Scheduler error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
