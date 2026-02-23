/**
 * SSE (Server-Sent Events) Manager
 * Manages per-user SSE connections for real-time push notifications
 * AND presence tracking — SSE connection = online, disconnect = offline (after grace period)
 * 
 * SaaS-ready: Scales to thousands of concurrent connections.
 * No HTTP polling — the SSE connection IS the presence signal.
 */

const User = require('../models/User');
const Attendance = require('../models/Attendance');

// Map of userId (string) -> Set of response objects (one user can have multiple tabs)
const clients = new Map();

// Map of userId (string) -> { timer, organizationId } — grace period before marking offline
const disconnectTimers = new Map();

// Grace period: how long to wait after ALL tabs close before marking offline (ms)
// Covers page refreshes, brief network blips
const DISCONNECT_GRACE_MS = 30 * 1000; // 30 seconds

/**
 * Register a new SSE client connection.
 * Also marks user online + creates attendance check-in.
 * @param {string} userId
 * @param {object} reply - Fastify reply object (raw Node.js response)
 * @param {string} organizationId - User's org (for attendance records)
 */
function addClient(userId, reply, organizationId) {
    const id = userId.toString();

    // Cancel any pending disconnect grace timer (user reconnected in time)
    if (disconnectTimers.has(id)) {
        clearTimeout(disconnectTimers.get(id).timer);
        disconnectTimers.delete(id);
    }

    const wasDisconnected = !clients.has(id) || clients.get(id).size === 0;

    if (!clients.has(id)) {
        clients.set(id, new Set());
    }
    clients.get(id).add(reply);

    // If user had zero connections before → mark online + attendance check-in
    if (wasDisconnected) {
        markOnline(id, organizationId).catch(err =>
            console.error(`Failed to mark user ${id} online:`, err.message)
        );
    }

    console.log(`📡 SSE client connected: user ${id} (${clients.get(id).size} tab(s))`);
}

/**
 * Remove an SSE client connection (on disconnect).
 * If ALL tabs are closed, starts a grace period before marking offline.
 * @param {string} userId
 * @param {object} reply
 * @param {string} organizationId
 */
function removeClient(userId, reply, organizationId) {
    const id = userId.toString();
    const userClients = clients.get(id);
    if (userClients) {
        userClients.delete(reply);

        const remaining = userClients.size;
        console.log(`📡 SSE client disconnected: user ${id} (${remaining} tab(s) remaining)`);

        // If ALL tabs/connections are gone → start grace period
        if (remaining === 0) {
            clients.delete(id);

            // Don't immediately mark offline — give time for page refresh / reconnect
            const timer = setTimeout(() => {
                disconnectTimers.delete(id);

                // Double-check they haven't reconnected during grace period
                if (!clients.has(id) || clients.get(id).size === 0) {
                    markOffline(id).catch(err =>
                        console.error(`Failed to mark user ${id} offline:`, err.message)
                    );
                }
            }, DISCONNECT_GRACE_MS);

            disconnectTimers.set(id, { timer, organizationId });
        }
    }
}

/**
 * Mark user online in DB + create attendance check-in
 */
async function markOnline(userId, organizationId) {
    await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastHeartbeat: new Date()
    });

    if (organizationId) {
        try {
            await Attendance.checkIn(userId, organizationId);
        } catch (err) {
            console.error(`Attendance check-in failed for ${userId}:`, err.message);
        }
    }

    console.log(`🟢 User ${userId} marked ONLINE (SSE connected)`);
}

/**
 * Mark user offline in DB + close attendance session
 */
async function markOffline(userId) {
    await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastHeartbeat: null
    });

    try {
        await Attendance.checkOut(userId, 'disconnect');
    } catch (err) {
        console.error(`Attendance check-out failed for ${userId}:`, err.message);
    }

    console.log(`🔴 User ${userId} marked OFFLINE (SSE disconnected, grace period expired)`);
}

/**
 * Send an SSE event to a specific user (all their tabs)
 * @param {string} userId
 * @param {string} event - Event name (e.g., 'notification')
 * @param {object} data - Data to send
 */
function sendToUser(userId, event, data) {
    const id = userId.toString();
    const userClients = clients.get(id);
    if (!userClients || userClients.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const reply of userClients) {
        try {
            reply.raw.write(payload);
        } catch (err) {
            console.error(`SSE write error for user ${id}:`, err.message);
            userClients.delete(reply);
        }
    }
}

/**
 * Check if a user currently has at least one SSE connection
 * @param {string} userId
 * @returns {boolean}
 */
function isUserConnected(userId) {
    const id = userId.toString();
    return clients.has(id) && clients.get(id).size > 0;
}

/**
 * Get all connected user IDs
 * @returns {string[]}
 */
function getConnectedUserIds() {
    return Array.from(clients.keys());
}

/**
 * Get count of connected users
 */
function getConnectedCount() {
    return clients.size;
}

module.exports = {
    addClient,
    removeClient,
    sendToUser,
    isUserConnected,
    getConnectedUserIds,
    getConnectedCount
};
