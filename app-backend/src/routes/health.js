/**
 * Health Check Route
 * Provides health and readiness endpoints for monitoring
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Get database connection status
 */
function getDatabaseStatus() {
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };
    
    const state = mongoose.connection.readyState;
    
    return {
        status: state === 1 ? 'healthy' : 'unhealthy',
        state: states[state] || 'unknown',
        host: mongoose.connection.host || 'unknown'
    };
}

/**
 * Get memory usage
 */
function getMemoryUsage() {
    const usage = process.memoryUsage();
    const toMB = (bytes) => Math.round(bytes / 1024 / 1024 * 100) / 100;
    
    return {
        heapUsed: toMB(usage.heapUsed) + ' MB',
        heapTotal: toMB(usage.heapTotal) + ' MB',
        rss: toMB(usage.rss) + ' MB',
        external: toMB(usage.external) + ' MB'
    };
}

/**
 * Get uptime
 */
function getUptime() {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    
    return {
        seconds: Math.floor(uptime),
        formatted: `${days}d ${hours}h ${minutes}m ${seconds}s`
    };
}

/**
 * Basic health check handler
 * Returns 200 if server is running
 */
async function healthCheck(req, res) {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
}

/**
 * Detailed health check handler
 * Checks all dependencies
 */
async function detailedHealthCheck(req, res) {
    const checks = {
        server: { status: 'healthy' },
        database: getDatabaseStatus(),
        memory: {
            status: 'healthy',
            ...getMemoryUsage()
        },
        uptime: getUptime()
    };
    
    // Check Redis if configured
    if (process.env.REDIS_URL) {
        try {
            // Add Redis check here if using Redis
            checks.redis = { status: 'healthy' };
        } catch (error) {
            checks.redis = { status: 'unhealthy', error: error.message };
        }
    }
    
    // Determine overall status
    const isHealthy = Object.values(checks)
        .filter(c => c.status)
        .every(c => c.status === 'healthy');
    
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        checks
    });
}

/**
 * Readiness check handler
 * Returns 200 if server is ready to accept traffic
 */
async function readinessCheck(req, res) {
    try {
        // Check database connection
        const dbStatus = getDatabaseStatus();
        
        if (dbStatus.status !== 'healthy') {
            return res.status(503).json({
                status: 'not ready',
                reason: 'Database not connected',
                timestamp: new Date().toISOString()
            });
        }
        
        // Optionally check other dependencies
        // ...
        
        res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Readiness check failed', { error: error.message });
        
        res.status(503).json({
            status: 'not ready',
            reason: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

/**
 * Liveness check handler
 * Simple check to verify process is alive
 */
async function livenessCheck(req, res) {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid
    });
}

/**
 * Register health routes with Express app
 * @param {Object} app - Express app
 */
function registerHealthRoutes(app) {
    app.get('/health', healthCheck);
    app.get('/health/detailed', detailedHealthCheck);
    app.get('/ready', readinessCheck);
    app.get('/live', livenessCheck);
    
    // Also register at /api path
    app.get('/api/health', healthCheck);
    app.get('/api/ready', readinessCheck);
}

/**
 * Register health routes with Fastify
 * @param {Object} fastify - Fastify instance
 */
function registerFastifyHealthRoutes(fastify) {
    // Basic health check handler
    const basicHealthHandler = async (request, reply) => {
        return {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
    };

    // Detailed health check handler
    const detailedHealthHandler = async (request, reply) => {
        const checks = {
            server: { status: 'healthy' },
            database: getDatabaseStatus(),
            memory: {
                status: 'healthy',
                ...getMemoryUsage()
            },
            uptime: getUptime()
        };
        
        const isHealthy = Object.values(checks)
            .filter(c => c.status)
            .every(c => c.status === 'healthy');
        
        reply.code(isHealthy ? 200 : 503);
        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            checks
        };
    };

    // Ready check handler
    const readyHandler = async (request, reply) => {
        const dbStatus = getDatabaseStatus();
        
        if (dbStatus.status !== 'healthy') {
            reply.code(503);
            return {
                status: 'not ready',
                reason: 'Database not connected',
                timestamp: new Date().toISOString()
            };
        }
        
        return {
            status: 'ready',
            timestamp: new Date().toISOString()
        };
    };

    // Live check handler
    const liveHandler = async () => ({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid
    });

    // Register at root level
    fastify.get('/health', basicHealthHandler);
    fastify.get('/health/detailed', detailedHealthHandler);
    fastify.get('/ready', readyHandler);
    fastify.get('/live', liveHandler);
    
    // Also register at /api prefix
    fastify.get('/api/health', basicHealthHandler);
    fastify.get('/api/health/detailed', detailedHealthHandler);
    fastify.get('/api/health/ready', readyHandler);
    fastify.get('/api/health/live', liveHandler);
}

module.exports = {
    healthCheck,
    detailedHealthCheck,
    readinessCheck,
    livenessCheck,
    registerHealthRoutes,
    registerFastifyHealthRoutes,
    getDatabaseStatus,
    getMemoryUsage,
    getUptime
};
