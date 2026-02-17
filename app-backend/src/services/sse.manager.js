/**
 * SSE (Server-Sent Events) Manager
 * Manages per-user SSE connections for real-time push notifications
 */

// Map of userId (string) -> Set of response objects (one user can have multiple tabs)
const clients = new Map();

/**
 * Register a new SSE client connection
 * @param {string} userId
 * @param {object} reply - Fastify reply object (raw Node.js response)
 */
function addClient(userId, reply) {
    const id = userId.toString();
    if (!clients.has(id)) {
        clients.set(id, new Set());
    }
    clients.get(id).add(reply);
    console.log(`📡 SSE client connected: user ${id} (${clients.get(id).size} tab(s))`);
}

/**
 * Remove an SSE client connection (on disconnect)
 * @param {string} userId
 * @param {object} reply
 */
function removeClient(userId, reply) {
    const id = userId.toString();
    const userClients = clients.get(id);
    if (userClients) {
        userClients.delete(reply);
        if (userClients.size === 0) {
            clients.delete(id);
        }
        console.log(`📡 SSE client disconnected: user ${id} (${clients.has(id) ? clients.get(id).size : 0} tab(s) remaining)`);
    }
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
 * Get count of connected users
 */
function getConnectedCount() {
    return clients.size;
}

module.exports = {
    addClient,
    removeClient,
    sendToUser,
    getConnectedCount
};
