/**
 * Stale Lead Checker Service
 * Checks for leads with no activity and flags/notifies based on settings
 */

const Lead = require('../models/Lead');
const Settings = require('../models/settings.model');
const User = require('../models/User');
const logger = require('../utils/logger');

// Store interval reference for cleanup
let staleCheckInterval = null;

/**
 * Get all users with stale lead alerts enabled
 * @returns {Promise<Array>} Array of user settings with stale alerts enabled
 */
async function getUsersWithStaleAlertsEnabled() {
    try {
        const settings = await Settings.find({
            'crm.staleAlertEnabled': true
        }).populate('userId', 'name email');
        
        return settings.filter(s => s.userId); // Only return valid user settings
    } catch (error) {
        logger.error('Failed to fetch users with stale alerts', { error: error.message });
        return [];
    }
}

/**
 * Find stale leads for a user based on their settings
 * @param {string} userId - User ID
 * @param {number} staleDays - Number of days to consider stale
 * @returns {Promise<Array>} Array of stale leads
 */
async function findStaleLeads(userId, staleDays) {
    try {
        const staleDate = new Date();
        staleDate.setDate(staleDate.getDate() - staleDays);
        
        // Find leads that haven't been contacted in X days
        // and are still in active statuses (not won/lost)
        const staleLeads = await Lead.find({
            assignedTo: userId,
            status: { $nin: ['won', 'lost', 'disqualified', 'closed'] },
            $or: [
                { lastContactedAt: { $lt: staleDate } },
                { lastContactedAt: { $exists: false }, createdAt: { $lt: staleDate } }
            ]
        })
        .select('name phone email status source createdAt lastContactedAt')
        .sort({ lastContactedAt: 1, createdAt: 1 })
        .limit(50); // Limit to prevent huge lists
        
        return staleLeads;
    } catch (error) {
        logger.error('Failed to find stale leads', { userId, error: error.message });
        return [];
    }
}

/**
 * Mark leads as stale in the database
 * @param {Array} leadIds - Array of lead IDs to mark as stale
 */
async function markLeadsAsStale(leadIds) {
    if (!leadIds.length) return;
    
    try {
        await Lead.updateMany(
            { _id: { $in: leadIds } },
            { 
                $set: { 
                    isStale: true,
                    staleMarkedAt: new Date()
                }
            }
        );
        logger.info(`Marked ${leadIds.length} leads as stale`);
    } catch (error) {
        logger.error('Failed to mark leads as stale', { error: error.message });
    }
}

/**
 * Get stale leads summary for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Summary of stale leads
 */
async function getStaleLeadsSummary(userId) {
    try {
        // Get user settings
        const settings = await Settings.findOne({ userId });
        const staleDays = settings?.crm?.staleAlertDays || 7;
        const isEnabled = settings?.crm?.staleAlertEnabled !== false;
        
        if (!isEnabled) {
            return { enabled: false, count: 0, leads: [] };
        }
        
        const staleLeads = await findStaleLeads(userId, staleDays);
        
        return {
            enabled: true,
            staleDays,
            count: staleLeads.length,
            leads: staleLeads
        };
    } catch (error) {
        logger.error('Failed to get stale leads summary', { userId, error: error.message });
        return { enabled: false, count: 0, leads: [], error: error.message };
    }
}

/**
 * Run stale lead check for all users
 * This should be called periodically (e.g., daily)
 */
async function runStaleLeadCheck() {
    logger.info('Running stale lead check...');
    
    try {
        const userSettings = await getUsersWithStaleAlertsEnabled();
        
        let totalStale = 0;
        const results = [];
        
        for (const setting of userSettings) {
            const userId = setting.userId._id || setting.userId;
            const staleDays = setting.crm?.staleAlertDays || 7;
            
            const staleLeads = await findStaleLeads(userId, staleDays);
            
            if (staleLeads.length > 0) {
                // Mark leads as stale
                await markLeadsAsStale(staleLeads.map(l => l._id));
                
                totalStale += staleLeads.length;
                results.push({
                    userId,
                    userName: setting.userId.name,
                    staleCount: staleLeads.length,
                    staleDays
                });
                
                logger.info(`Found ${staleLeads.length} stale leads for user ${setting.userId.name}`, {
                    userId,
                    staleDays
                });
            }
        }
        
        logger.info('Stale lead check completed', { 
            usersChecked: userSettings.length,
            totalStaleLeads: totalStale 
        });
        
        return { usersChecked: userSettings.length, totalStale, results };
    } catch (error) {
        logger.error('Stale lead check failed', { error: error.message });
        return { error: error.message };
    }
}

/**
 * Start periodic stale lead checking
 * @param {number} intervalHours - Hours between checks (default: 24)
 */
function startStaleLeadChecker(intervalHours = 24) {
    // Clear any existing interval
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
    }
    
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    // Run immediately, then on interval
    runStaleLeadCheck();
    
    staleCheckInterval = setInterval(runStaleLeadCheck, intervalMs);
    
    logger.info(`Stale lead checker started (runs every ${intervalHours} hours)`);
}

/**
 * Stop the stale lead checker
 */
function stopStaleLeadChecker() {
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
        logger.info('Stale lead checker stopped');
    }
}

module.exports = {
    getStaleLeadsSummary,
    runStaleLeadCheck,
    findStaleLeads,
    startStaleLeadChecker,
    stopStaleLeadChecker
};
