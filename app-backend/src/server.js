/**
 * Server Entry Point
 * Starts the Fastify application with MongoDB connection
 */

const buildApp = require('./app');
const config = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { seedDefaultUsers, useDatabase } = require('./users/users.model');
const workflowEngine = require('./services/workflow.engine');

async function start() {
    let app;

    try {
        // Connect to MongoDB if configured
        if (process.env.MONGODB_URI) {
            console.log('📦 Connecting to MongoDB...');
            await connectDatabase();
            
            // Seed default users if database is empty
            await seedDefaultUsers();
            
            // Start workflow engine for automation processing
            console.log('⚙️  Starting Workflow Engine...');
            workflowEngine.start(10000); // Process jobs every 10 seconds
        } else {
            console.log('⚠️  MONGODB_URI not set - using in-memory storage');
            console.log('   Set MONGODB_URI in .env for persistent storage');
        }

        // Build Fastify app
        app = await buildApp();

        // Start server
        await app.listen({
            port: config.port,
            host: '0.0.0.0'
        });

        console.log('');
        console.log('🚀 Application Backend Started!');
        console.log('================================');
        console.log(`Environment: ${config.nodeEnv}`);
        console.log(`Port: ${config.port}`);
        console.log(`Database: ${process.env.MONGODB_URI ? 'MongoDB' : 'In-Memory'}`);
        console.log(`URL: http://localhost:${config.port}`);
        console.log('');
        console.log('Available Endpoints:');
        console.log('  Public:');
        console.log(`    POST   http://localhost:${config.port}/auth/login`);
        console.log(`    POST   http://localhost:${config.port}/auth/refresh`);
        console.log(`    POST   http://localhost:${config.port}/auth/logout`);
        console.log('  Protected (requires JWT):');
        console.log(`    GET    http://localhost:${config.port}/api/leads`);
        console.log(`    GET    http://localhost:${config.port}/api/leads/:id`);
        console.log(`    POST   http://localhost:${config.port}/api/leads`);
        console.log(`    GET    http://localhost:${config.port}/api/metrics/overview`);
        console.log('  Utility:');
        console.log(`    GET    http://localhost:${config.port}/health`);
        console.log('');
        console.log('Ready to accept requests! 🎉');
        console.log('');

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\n${signal} received, shutting down gracefully...`);

        // Stop workflow engine
        workflowEngine.stop();

        if (app) {
            await app.close();
        }

        // Disconnect from MongoDB
        if (process.env.MONGODB_URI) {
            await disconnectDatabase();
        }

        console.log('Server closed.');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server
start();
