/**
 * Database Configuration
 * MongoDB connection using Mongoose
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/leadflow';

// Track if we're in fallback mode
let usingFallbackMode = false;

/**
 * Connect to MongoDB
 */
async function connectDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
        });
        console.log('✅ Connected to MongoDB');
        usingFallbackMode = false;
        return mongoose.connection;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('⚠️  Running in fallback mode (in-memory storage)');
        console.log('   Data will NOT persist across restarts!\n');
        usingFallbackMode = true;
        // Don't exit - allow fallback to in-memory mode
        return null;
    }
}

/**
 * Check if using fallback mode
 */
function isFallbackMode() {
    return usingFallbackMode;
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDatabase() {
    try {
        await mongoose.disconnect();
        console.log('📤 Disconnected from MongoDB');
    } catch (error) {
        console.error('Error disconnecting from MongoDB:', error.message);
    }
}

/**
 * Get connection status
 */
function isConnected() {
    return mongoose.connection.readyState === 1;
}

// Handle connection events
mongoose.connection.on('connected', () => {
    console.log('📦 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
    console.error('📛 Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('📤 Mongoose disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await disconnectDatabase();
    process.exit(0);
});

module.exports = {
    connectDatabase,
    disconnectDatabase,
    isConnected,
    isFallbackMode,
    mongoose
};
