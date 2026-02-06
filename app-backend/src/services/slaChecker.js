/**
 * Response SLA Checker Service
 * Monitors leads for SLA breaches and creates notifications
 */

const Lead = require('../models/Lead');
const Settings = require('../models/settings.model');
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

// Store interval reference for cleanup
let slaCheckInterval = null;

/**
 * Get all users with Response SLA enabled
 * @returns {Promise<Array>} Array of user settings with SLA enabled
 */
async function getUsersWithSlaEnabled() {
    try {
        const settings = await Settings.find({
            'crm.responseSlaEnabled': true
        }).populate('userId', 'name email');
        
        return settings.filter(s => s.userId);
    } catch (error) {
        logger.error('Failed to fetch users with SLA settings', { error: error.message });
        return [];
    }
}

/**
 * Find leads that have breached SLA
 * @param {string} userId - User ID
 * @param {number} slaHours - SLA time in hours
 * @returns {Promise<Array>} Array of leads that breached SLA
 */
async function findSlaBreachedLeads(userId, slaHours) {
    try {
        const slaTime = new Date();
        slaTime.setHours(slaTime.getHours() - slaHours);
        
        // Find NEW leads assigned to user that haven't been contacted
        // and were created before the SLA threshold
        const breachedLeads = await Lead.find({
            assignedTo: userId,
            status: 'new', // Only new leads that haven't been worked
            createdAt: { $lt: slaTime },
            // Not already notified for SLA breach
            slaBreachNotified: { $ne: true },
            // Not contacted yet
            $or: [
                { lastContactedAt: { $exists: false } },
                { lastContactedAt: null }
            ]
        })
        .select('name phone email status source createdAt assignedTo')
        .sort({ createdAt: 1 })
        .limit(50);
        
        return breachedLeads;
    } catch (error) {
        logger.error('Failed to find SLA breached leads', { userId, error: error.message });
        return [];
    }
}

/**
 * Create SLA breach notifications
 * @param {string} userId - User ID
 * @param {Array} leads - Array of breached leads
 * @param {number} slaHours - SLA threshold in hours
 */
async function createSlaBreachNotifications(userId, leads, slaHours) {
    if (!leads.length) return;
    
    try {
        const notifications = leads.map(lead => ({
            userId,
            type: 'sla_breach',
            title: 'SLA Breach Alert',
            message: `Lead "${lead.name}" has not been contacted within ${slaHours} hours`,
            leadId: lead._id,
            leadName: lead.name,
            priority: 'high',
            metadata: {
                slaHours,
                leadCreatedAt: lead.createdAt,
                hoursOverdue: Math.round((new Date() - new Date(lead.createdAt)) / (1000 * 60 * 60))
            }
        }));
        
        await Notification.insertMany(notifications);
        
        // Mark leads as notified for SLA breach
        await Lead.updateMany(
            { _id: { $in: leads.map(l => l._id) } },
            { $set: { slaBreachNotified: true, slaBreachedAt: new Date() } }
        );
        
        logger.info(`Created ${notifications.length} SLA breach notifications for user ${userId}`);
    } catch (error) {
        logger.error('Failed to create SLA breach notifications', { userId, error: error.message });
    }
}

/**
 * Run SLA check for all users
 */
async function runSlaCheck() {
    logger.info('Running Response SLA check...');
    
    try {
        const userSettings = await getUsersWithSlaEnabled();
        
        let totalBreaches = 0;
        const results = [];
        
        for (const setting of userSettings) {
            const userId = setting.userId._id || setting.userId;
            const slaHours = setting.crm?.responseSlaHours || 2;
            
            const breachedLeads = await findSlaBreachedLeads(userId, slaHours);
            
            if (breachedLeads.length > 0) {
                await createSlaBreachNotifications(userId, breachedLeads, slaHours);
                
                totalBreaches += breachedLeads.length;
                results.push({
                    userId,
                    userName: setting.userId.name,
                    breachCount: breachedLeads.length,
                    slaHours
                });
            }
        }
        
        logger.info('SLA check completed', { 
            usersChecked: userSettings.length,
            totalBreaches 
        });
        
        return { usersChecked: userSettings.length, totalBreaches, results };
    } catch (error) {
        logger.error('SLA check failed', { error: error.message });
        return { error: error.message };
    }
}

/**
 * Get SLA status for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} SLA status summary
 */
async function getSlaStatus(userId) {
    try {
        const settings = await Settings.findOne({ userId });
        const slaEnabled = settings?.crm?.responseSlaEnabled !== false;
        const slaHours = settings?.crm?.responseSlaHours || 2;
        
        if (!slaEnabled) {
            return { enabled: false, breachCount: 0, leads: [] };
        }
        
        const breachedLeads = await findSlaBreachedLeads(userId, slaHours);
        
        // Also get leads that are close to breaching (within 30 minutes)
        const warningTime = new Date();
        warningTime.setHours(warningTime.getHours() - slaHours);
        warningTime.setMinutes(warningTime.getMinutes() + 30);
        
        const warningLeads = await Lead.find({
            assignedTo: userId,
            status: 'new',
            createdAt: { $lt: warningTime, $gt: new Date(Date.now() - slaHours * 60 * 60 * 1000) },
            $or: [
                { lastContactedAt: { $exists: false } },
                { lastContactedAt: null }
            ]
        })
        .select('name phone createdAt')
        .limit(10);
        
        return {
            enabled: true,
            slaHours,
            breachCount: breachedLeads.length,
            breachedLeads: breachedLeads.slice(0, 10),
            warningCount: warningLeads.length,
            warningLeads
        };
    } catch (error) {
        logger.error('Failed to get SLA status', { userId, error: error.message });
        return { enabled: false, breachCount: 0, error: error.message };
    }
}

/**
 * Start periodic SLA checking
 * @param {number} intervalMinutes - Minutes between checks (default: 15)
 */
function startSlaChecker(intervalMinutes = 15) {
    if (slaCheckInterval) {
        clearInterval(slaCheckInterval);
    }
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Run immediately, then on interval
    runSlaCheck();
    
    slaCheckInterval = setInterval(runSlaCheck, intervalMs);
    
    logger.info(`Response SLA checker started (runs every ${intervalMinutes} minutes)`);
}

/**
 * Stop the SLA checker
 */
function stopSlaChecker() {
    if (slaCheckInterval) {
        clearInterval(slaCheckInterval);
        slaCheckInterval = null;
        logger.info('Response SLA checker stopped');
    }
}

module.exports = {
    getSlaStatus,
    runSlaCheck,
    findSlaBreachedLeads,
    startSlaChecker,
    stopSlaChecker
};
