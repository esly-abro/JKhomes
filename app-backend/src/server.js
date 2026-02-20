/**
 * Server Entry Point
 * Starts the Fastify application with MongoDB connection
 * 
 * Production Features:
 * - Structured logging (Winston)
 * - Graceful shutdown with timeout
 * - Connection draining
 * - Health monitoring
 */

const buildApp = require('./app');
const config = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const { seedDefaultUsers, useDatabase } = require('./users/users.model');
const workflowEngine = require('./services/workflow.engine');
const { isRedisHealthy } = require('./config/redis');

// Structured logging
const logger = require('./utils/logger');

// Track active connections for graceful shutdown
let activeConnections = new Set();
let isShuttingDown = false;

async function start() {
    let app;

    try {
        // Connect to MongoDB if configured
        if (process.env.MONGODB_URI) {
            logger.info('📦 Connecting to MongoDB...');
            await connectDatabase();
            
            // Seed default users if database is empty
            await seedDefaultUsers();
            
            // Start workflow engine for automation processing
            logger.info('⚙️  Starting Workflow Engine...');
            workflowEngine.start(10000); // Process jobs every 10 seconds
        } else {
            logger.warn('⚠️  MONGODB_URI not set - using in-memory storage');
            logger.warn('   Set MONGODB_URI in .env for persistent storage');
        }

        // Build Fastify app
        app = await buildApp();

        // Track connections for graceful shutdown
        app.addHook('onRequest', (request, reply, done) => {
            if (!isShuttingDown) {
                activeConnections.add(request.id);
            }
            done();
        });

        app.addHook('onResponse', (request, reply, done) => {
            activeConnections.delete(request.id);
            done();
        });

        // Start server
        await app.listen({
            port: config.port,
            host: '0.0.0.0'
        });

        logger.info('');
        logger.info('🚀 Application Backend Started!');
        logger.info('================================');
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Port: ${config.port}`);
        logger.info(`Database: ${process.env.MONGODB_URI ? 'MongoDB' : 'In-Memory'}`);
        logger.info(`URL: http://localhost:${config.port}`);
        logger.info('');
        // Check Redis health
        const redisOk = await isRedisHealthy();
        logger.info(`Redis: ${redisOk ? '✅ Connected' : '⚠️  Not connected (workflows will queue when available)'}`);
        logger.info('');
        logger.info('Production Features:');
        logger.info('  ✓ Structured Logging (Winston)');
        logger.info('  ✓ Rate Limiting');
        logger.info('  ✓ Security Headers');
        logger.info('  ✓ Request Validation');
        logger.info('  ✓ Graceful Shutdown');
        logger.info('  ✓ BullMQ Workflow Engine (Redis)');
        logger.info('');
        logger.info('Health Endpoints:');
        logger.info(`  GET http://localhost:${config.port}/api/health`);
        logger.info(`  GET http://localhost:${config.port}/api/health/ready`);
        logger.info(`  GET http://localhost:${config.port}/api/health/live`);
        logger.info('');

        // ── Start auto-logout cron (every 60 seconds) ──
        const { autoLogoutStaleAgents, AGENT_TIMEOUT_MINUTES } = require('./controllers/attendance.controller');
        setInterval(autoLogoutStaleAgents, 60 * 1000);
        logger.info(`✓ Agent auto-logout active (${AGENT_TIMEOUT_MINUTES} min inactivity timeout)`);

        logger.info('Ready to accept requests! 🎉');
        logger.info('');

    } catch (error) {
        logger.error('Failed to start server:', { error: error.message, stack: error.stack });
        process.exit(1);
    }

    // Graceful shutdown with timeout and connection draining
    const shutdown = async (signal) => {
        if (isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }
        
        isShuttingDown = true;
        logger.info(`\n${signal} received, starting graceful shutdown...`);
        
        const SHUTDOWN_TIMEOUT = 30000; // 30 seconds
        
        // Set a timeout for forceful shutdown
        const forceShutdownTimeout = setTimeout(() => {
            logger.error('Shutdown timeout exceeded, forcing exit');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT);
        
        try {
            // Stop accepting new requests
            logger.info('Stopping new request acceptance...');
            
            // Stop workflow engine (stops BullMQ workers + queues + Redis)
            logger.info('Stopping Workflow Engine...');
            await workflowEngine.stop();

            // Wait for active connections to complete (max 10 seconds)
            if (activeConnections.size > 0) {
                logger.info(`Waiting for ${activeConnections.size} active connections to complete...`);
                const drainStart = Date.now();
                const DRAIN_TIMEOUT = 10000;
                
                while (activeConnections.size > 0 && (Date.now() - drainStart) < DRAIN_TIMEOUT) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                if (activeConnections.size > 0) {
                    logger.warn(`${activeConnections.size} connections did not complete, proceeding with shutdown`);
                }
            }

            // Close Fastify server
            if (app) {
                logger.info('Closing HTTP server...');
                await app.close();
            }

            // Disconnect from MongoDB
            if (process.env.MONGODB_URI) {
                logger.info('Disconnecting from MongoDB...');
                await disconnectDatabase();
            }

            clearTimeout(forceShutdownTimeout);
            logger.info('Graceful shutdown completed successfully');
            process.exit(0);
            
        } catch (error) {
            logger.error('Error during shutdown:', { error: error.message });
            clearTimeout(forceShutdownTimeout);
            process.exit(1);
        }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
        shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection:', { reason: reason?.message || reason, promise });
        // Don't shutdown on unhandled rejections, just log
    });
}

// Start server
start();
