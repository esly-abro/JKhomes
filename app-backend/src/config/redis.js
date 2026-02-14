/**
 * Redis Configuration
 * 
 * Provides Redis connection for BullMQ job queues.
 * Supports both single-instance and Sentinel configurations.
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

// ─── Parse Config ───────────────────────────────────────────────

function getRedisConfig() {
    // If REDIS_URL is set, use it directly (e.g. redis://:password@host:6379/0)
    if (process.env.REDIS_URL) {
        return { url: process.env.REDIS_URL };
    }

    return {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,    // Required by BullMQ
        retryStrategy(times) {
            const delay = Math.min(times * 200, 5000);
            logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
            return delay;
        },
    };
}

// ─── Shared connection (for BullMQ Queue + Worker) ──────────────

let _connection = null;
let _subscriber = null;

/**
 * Get or create the shared Redis connection.
 * BullMQ requires maxRetriesPerRequest: null.
 */
function getRedisConnection() {
    if (_connection) return _connection;

    const config = getRedisConfig();

    if (config.url) {
        _connection = new IORedis(config.url, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    } else {
        _connection = new IORedis(config);
    }

    _connection.on('connect', () => {
        logger.info('✅ Redis connected');
    });

    _connection.on('error', (err) => {
        logger.error(`Redis connection error: ${err.message}`);
    });

    _connection.on('close', () => {
        logger.warn('Redis connection closed');
    });

    return _connection;
}

/**
 * Get a separate subscriber connection for BullMQ Worker.
 * BullMQ workers need their own subscriber connection.
 */
function getRedisSubscriber() {
    if (_subscriber) return _subscriber;

    const config = getRedisConfig();

    if (config.url) {
        _subscriber = new IORedis(config.url, {
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        });
    } else {
        _subscriber = new IORedis(config);
    }

    _subscriber.on('error', (err) => {
        logger.error(`Redis subscriber error: ${err.message}`);
    });

    return _subscriber;
}

/**
 * Graceful shutdown — close both connections.
 */
async function closeRedis() {
    const promises = [];
    if (_connection) {
        promises.push(_connection.quit().catch(() => _connection.disconnect()));
        _connection = null;
    }
    if (_subscriber) {
        promises.push(_subscriber.quit().catch(() => _subscriber.disconnect()));
        _subscriber = null;
    }
    await Promise.allSettled(promises);
    logger.info('Redis connections closed');
}

/**
 * Health check — returns true if Redis is reachable.
 */
async function isRedisHealthy() {
    try {
        const conn = getRedisConnection();
        const pong = await conn.ping();
        return pong === 'PONG';
    } catch {
        return false;
    }
}

module.exports = {
    getRedisConfig,
    getRedisConnection,
    getRedisSubscriber,
    closeRedis,
    isRedisHealthy,
};
