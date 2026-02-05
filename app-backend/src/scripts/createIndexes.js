/**
 * Database Indexes Script
 * Creates optimized indexes for production performance
 * 
 * Run with: node src/scripts/createIndexes.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const logger = console;

const indexes = {
    leads: [
        // Frequently queried fields
        { phone: 1 },
        { email: 1 },
        { status: 1 },
        { source: 1 },
        { assignedTo: 1 },
        
        // Compound indexes for common queries
        { status: 1, createdAt: -1 },
        { assignedTo: 1, status: 1 },
        { source: 1, status: 1 },
        
        // Date range queries
        { createdAt: -1 },
        { updatedAt: -1 },
        
        // Text search
        { name: 'text', email: 'text', phone: 'text', notes: 'text' },
        
        // Soft delete filtering
        { isDeleted: 1, status: 1 }
    ],
    
    users: [
        // Unique constraints
        { email: 1 },
        
        // Frequently queried
        { role: 1 },
        { status: 1 },
        
        // Compound indexes
        { role: 1, status: 1 },
        
        // Text search
        { name: 'text', email: 'text' }
    ],
    
    properties: [
        // Status queries
        { status: 1 },
        { propertyType: 1 },
        
        // Location queries
        { 'location.city': 1 },
        
        // Price range queries
        { price: 1 },
        
        // Compound indexes
        { status: 1, propertyType: 1 },
        { status: 1, price: 1 },
        { 'location.city': 1, status: 1 },
        
        // Date queries
        { createdAt: -1 },
        
        // Text search
        { title: 'text', description: 'text', 'location.address': 'text' }
    ],
    
    sitevisits: [
        // Date queries
        { visitDate: 1 },
        { createdAt: -1 },
        
        // Reference queries
        { leadId: 1 },
        { propertyId: 1 },
        { agentId: 1 },
        
        // Compound indexes
        { visitDate: 1, status: 1 },
        { agentId: 1, visitDate: 1 },
        { propertyId: 1, visitDate: 1 }
    ],
    
    activities: [
        // Date queries
        { createdAt: -1 },
        
        // Reference queries
        { leadId: 1 },
        { performedBy: 1 },
        { type: 1 },
        
        // Compound indexes
        { leadId: 1, createdAt: -1 },
        { performedBy: 1, createdAt: -1 }
    ],
    
    calllogs: [
        // Date queries
        { createdAt: -1 },
        { startTime: -1 },
        
        // Reference queries
        { leadId: 1 },
        { agentId: 1 },
        { status: 1 },
        
        // External ID lookup
        { callSid: 1 },
        
        // Compound indexes
        { leadId: 1, createdAt: -1 },
        { agentId: 1, createdAt: -1 }
    ],
    
    tasks: [
        // Date queries
        { dueDate: 1 },
        { createdAt: -1 },
        
        // Status queries
        { status: 1 },
        { priority: 1 },
        
        // Reference queries
        { leadId: 1 },
        { assignedTo: 1 },
        
        // Compound indexes
        { assignedTo: 1, status: 1, dueDate: 1 },
        { status: 1, dueDate: 1 }
    ],
    
    automations: [
        // Status queries
        { isActive: 1 },
        { trigger: 1 },
        
        // Compound indexes
        { isActive: 1, trigger: 1 }
    ],
    
    automationexecutions: [
        // Date queries
        { startedAt: -1 },
        
        // Status queries
        { status: 1 },
        
        // Reference queries
        { automationId: 1 },
        { leadId: 1 },
        
        // Compound indexes
        { automationId: 1, status: 1 },
        { leadId: 1, startedAt: -1 }
    ]
};

async function createIndexes() {
    if (!process.env.MONGODB_URI) {
        logger.error('MONGODB_URI not set');
        process.exit(1);
    }

    try {
        logger.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        logger.log('Connected successfully\n');

        const db = mongoose.connection.db;

        for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
            logger.log(`Creating indexes for collection: ${collectionName}`);
            
            try {
                const collection = db.collection(collectionName);
                
                for (const indexSpec of collectionIndexes) {
                    try {
                        // Handle text indexes specially
                        const isTextIndex = Object.values(indexSpec).includes('text');
                        
                        const options = {
                            background: true
                        };
                        
                        if (isTextIndex) {
                            options.name = `${collectionName}_text_search`;
                        }
                        
                        await collection.createIndex(indexSpec, options);
                        logger.log(`  ✓ Created index: ${JSON.stringify(indexSpec)}`);
                    } catch (indexError) {
                        if (indexError.code === 85 || indexError.code === 86) {
                            // Index already exists or name conflict
                            logger.log(`  ⊙ Index already exists: ${JSON.stringify(indexSpec)}`);
                        } else {
                            throw indexError;
                        }
                    }
                }
                
                logger.log('');
            } catch (collError) {
                logger.error(`  ✗ Error creating indexes for ${collectionName}:`, collError.message);
            }
        }

        logger.log('Index creation completed!');
        
        // Show index stats
        logger.log('\n=== Index Statistics ===\n');
        
        for (const collectionName of Object.keys(indexes)) {
            try {
                const collection = db.collection(collectionName);
                const indexInfo = await collection.indexes();
                logger.log(`${collectionName}: ${indexInfo.length} indexes`);
            } catch (err) {
                // Collection might not exist yet
            }
        }

    } catch (error) {
        logger.error('Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        logger.log('\nDisconnected from MongoDB');
    }
}

// Run if called directly
if (require.main === module) {
    createIndexes();
}

module.exports = { createIndexes, indexes };
