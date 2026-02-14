/**
 * Redis Configuration
 * 
 * Provides Redis connection config for BullMQ job queues.
 * 
 * BullMQ manages its own connections internally — we provide config, not instances.
 * A separate shared IORedis instance is kept only for health checks.
 * 
 * Environment Variables:
 *   REDIS_HOST     - Redis host (default: 127.0.0.1)
 *   REDIS_PORT     - Redis port (default: 6379)
 *   REDIS_PASSWORD - Redis password (optional)
 *   REDIS_URL      - Full Redis URL (overrides host/port/password)
 *   REDIS_DB       - Redis database index (default: 0)
 */

const IORedis = require('ioredis');
const logger = require('../utils/logger');

let _healthConnection = null;
let _redisAvailable = null; // null = unknown, true/false = checked

// ─── Connection Config (for BullMQ) ────────────────────────────

/**
 * Returns a plain config object suitable for BullMQ Queue / Worker `connection` option.
 * BullMQ will create and manage its own IORedis instances from this config.
 */
function getRedisConfig() {
    if (process.env.REDIS_URL) {
        // Parse URL into components for BullMQ (it needs host/port, not url)
        try {
            const url = new URL(process.env.REDIS_URL);
            return {
                host: url.hostname || '127.0.0.1',
                port: parseInt(url.port, 10) || 6379,
                password: url.password || undefined,
                db: parseInt(url.pathname?.slice(1), 10) || 0,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            };
        } catch {
            logger.warn('Invalid REDIS_URL, falling back to host/port config');
        }
    }

    return {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,    // Required by BullMQ
    };
}

// ─── Health Check Connection ────────────────────────────────────

/**
 * Get a lightweight IORedis connection for health checks only.
 * This is NOT used by BullMQ — it manages its own connections.
 */
function _getHealthConnection() {
    if (_healthConnection) return _healthConnection;

    const config = getRedisConfig();
    _healthConnection = new IORedis({
        ...config,
        lazyConnect: true,           // Don't auto-connect
        retryStrategy: () => null,   // Don't auto-retry — health check is on-demand
    });

    // Suppress unhandled error events
    _healthConnection.on('error', () => {});

    return _healthConnection;
}

/**
 * Health check — returns true if Redis is reachable.
 * Non-blocking, times out after 2s.
 */
async function isRedisHealthy() {
    try {
        const conn = _getHealthConnection();
        if (conn.status !== 'ready' && conn.status !== 'connect') {
            await conn.connect();
        }
        const result = await Promise.race([
            conn.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
        _redisAvailable = (result === 'PONG');
        return _redisAvailable;
    } catch {
        _redisAvailable = false;
        return false;
    }
}

/**
 * Graceful shutdown — close health check connection.
 * BullMQ workers and queues close their own connections via .close().
 */
async function closeRedis() {
    if (_healthConnection) {
        try { await _healthConnection.quit(); } catch { /* ignore */ }
        _healthConnection = null;
    }
    logger.info('Redis connections closed');
}

module.exports = {
    getRedisConfig,
    closeRedis,
    isRedisHealthy,
};
