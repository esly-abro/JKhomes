/**
 * Call Log Service
 * Manages call log retrieval and tracking
 */

const CallLog = require('../models/CallLog');

/**
 * Get call logs by user ID (for agent's own calls, scoped to org)
 */
async function getCallLogsByUser(organizationId, userId, limit = 50) {
    const query = { agentId: userId };
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return CallLog.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Get all call logs (for owner/admin/manager, scoped to org)
 */
async function getAllCallLogs(organizationId, limit = 100) {
    const query = {};
    if (organizationId) {
        query.organizationId = organizationId;
    }
    return CallLog.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Create a call log entry
 */
async function createCallLog(callData) {
    return CallLog.create(callData);
}

/**
 * Get call log by ID
 */
async function getCallLogById(callLogId) {
    return CallLog.findById(callLogId)
        .populate('agentId', 'name email');
}

/**
 * Update call log
 */
async function updateCallLog(callLogId, updates) {
    return CallLog.findByIdAndUpdate(callLogId, updates, { new: true });
}

module.exports = {
    getCallLogsByUser,
    getAllCallLogs,
    createCallLog,
    getCallLogById,
    updateCallLog
};
