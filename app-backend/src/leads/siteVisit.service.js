/**
 * Site Visit Service
 * Manages site visit scheduling and tracking
 */

const SiteVisit = require('../models/SiteVisit');
const Lead = require('../models/Lead');
const zohoClient = require('../clients/zoho.client');
const googleSheetsService = require('../services/googleSheets.service');
const workflowEngine = require('../services/workflow.engine');
const availabilityService = require('../services/availability.service');
const dataLayer = require('./lead.dataLayer');
const awsEmailService = require('../services/awsEmail.service');

// Check if MongoDB is available
const useDatabase = () => !!process.env.MONGODB_URI;

/**
 * Confirm/schedule a site visit
 */
async function confirmSiteVisit(leadId, scheduledAt, userId, propertyId = null) {
    // Parse scheduledAt to get date and time
    const scheduledDate = new Date(scheduledAt);
    const dateStr = scheduledDate.toISOString().split('T')[0];
    const hours = scheduledDate.getHours().toString().padStart(2, '0');
    const minutes = scheduledDate.getMinutes().toString().padStart(2, '0');
    const startTime = `${hours}:${minutes}`;
    
    // Check for conflicts if propertyId is provided
    if (propertyId) {
        const conflicts = await availabilityService.checkConflicts(propertyId, userId, dateStr, startTime);
        
        if (conflicts.hasConflict) {
            const messages = [];
            if (conflicts.propertyConflict) {
                messages.push(conflicts.propertyConflict.message);
            }
            if (conflicts.agentConflict) {
                messages.push(conflicts.agentConflict.message);
            }
            const error = new Error(messages.join('. '));
            error.statusCode = 409; // Conflict
            error.conflicts = conflicts;
            throw error;
        }
        
        // Also check if the slot is available according to property settings
        const slotCheck = await availabilityService.checkSlotAvailability(propertyId, dateStr, startTime);
        if (!slotCheck.available) {
            const error = new Error(slotCheck.reason || 'Selected time slot is not available');
            error.statusCode = 400;
            throw error;
        }
    }
    
    // Fetch lead from Zoho to get details (or fallback to MongoDB)
    let zohoLead = null;
    try {
        const lead = await zohoClient.getLead(leadId);
        zohoLead = lead.data && lead.data[0];
    } catch (zohoError) {
        console.warn('[SiteVisit] Zoho fetch failed, trying MongoDB:', zohoError.message);
        // Try to get lead data from MongoDB instead
        try {
            const mongoLead = await Lead.findOne({ zohoId: leadId });
            if (mongoLead) {
                zohoLead = {
                    Full_Name: mongoLead.name,
                    Last_Name: mongoLead.name,
                    Phone: mongoLead.phone,
                    Mobile: mongoLead.phone,
                    Email: mongoLead.email
                };
            }
        } catch (mongoError) {
            console.warn('[SiteVisit] MongoDB fallback also failed:', mongoError.message);
        }
    }

    // Update status via data layer - this syncs to Zoho FIRST, then MongoDB
    try {
        await dataLayer.updateLeadStatus(leadId, 'Site Visit Scheduled', {
            reason: 'site_visit_confirmed'
        });
        console.log(`[SiteVisit] Status synced to Zoho for lead ${leadId}`);
    } catch (statusError) {
        console.error('[SiteVisit] Status sync failed:', statusError.message);
        // Continue with site visit creation - status sync can be retried
    }

    // Update local-only fields (propertyId) via data layer
    if (propertyId) {
        try {
            await dataLayer.updateLocalFields(leadId, { propertyId });
        } catch (localError) {
            console.error('[SiteVisit] Local fields update failed:', localError.message);
        }
    }

    // Ensure MongoDB record exists with basic info
    await dataLayer.ensureMongoRecord(leadId, {
        name: zohoLead?.Full_Name || zohoLead?.Last_Name || 'Unknown',
        phone: zohoLead?.Phone || zohoLead?.Mobile || '',
        email: zohoLead?.Email || ''
    });

    // Create a new site visit with updated schema
    const visit = await SiteVisit.create({
        leadId: leadId,
        leadName: zohoLead?.Full_Name || zohoLead?.Last_Name || 'Unknown',
        leadPhone: zohoLead?.Phone || zohoLead?.Mobile || '',
        scheduledAt,
        agentId: userId,
        propertyId: propertyId,
        status: 'scheduled',
        syncStatus: 'pending'
    });

    // Sync site visit to Google Sheets (non-blocking)
    try {
        const populatedVisit = await SiteVisit.findById(visit._id)
            .populate('propertyId', 'name location')
            .populate('agentId', 'name');
        googleSheetsService.syncSiteVisit(populatedVisit).catch(err => {
            console.error('[GoogleSheets] Site visit sync error:', err.message);
        });
    } catch (err) {
        console.error('[GoogleSheets] Site visit sync error:', err.message);
    }

    // Trigger automation workflows for site visit scheduled
    try {
        const mongoLead = await Lead.findOne({ zohoId: leadId });
        if (mongoLead) {
            // Trigger asynchronously to not block the response
            workflowEngine.triggerSiteVisitScheduled(mongoLead, {
                visitId: visit._id,
                scheduledAt: visit.scheduledAt,
                propertyId: visit.propertyId,
                agentId: visit.agentId,
                status: visit.status
            }).catch(err => {
                console.error('Error triggering site visit automations:', err);
            });
        }
    } catch (automationError) {
        console.error('Failed to trigger site visit automations:', automationError);
        // Don't fail the request - site visit creation succeeded
    }

    // Send AWS email notification for site visit (non-blocking)
    if (awsEmailService.isConfigured()) {
        try {
            const populatedVisitForEmail = await SiteVisit.findById(visit._id)
                .populate('propertyId', 'name location address')
                .populate('agentId', 'name email phone');
            
            const customerEmail = zohoLead?.Email;
            if (customerEmail) {
                awsEmailService.sendSiteVisitEmail({
                    customerName: zohoLead?.Full_Name || zohoLead?.Last_Name || 'Valued Customer',
                    customerEmail: customerEmail,
                    scheduledAt: visit.scheduledAt,
                    propertyName: populatedVisitForEmail?.propertyId?.name || 'Property',
                    propertyLocation: populatedVisitForEmail?.propertyId?.location || populatedVisitForEmail?.propertyId?.address || '',
                    agentName: populatedVisitForEmail?.agentId?.name || 'Our Team',
                    agentPhone: populatedVisitForEmail?.agentId?.phone || process.env.COMPANY_PHONE || ''
                }).then(result => {
                    console.log('[AWSEmail] Site visit confirmation email sent:', result?.messageId);
                }).catch(err => {
                    console.error('[AWSEmail] Site visit email failed:', err.message);
                });
            }
        } catch (emailError) {
            console.error('[AWSEmail] Site visit email error:', emailError.message);
            // Don't fail the request - email is non-critical
        }
    }

    return visit;
}

/**
 * Get site visits for today
 */
async function getSiteVisitsForToday(userId) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    // Use agentId instead of confirmedBy
    const visits = await SiteVisit.find({
        agentId: userId,
        scheduledAt: { $gte: start, $lte: end }
    }).populate('agentId', 'name email');

    return visits;
}

/**
 * Get site visits by user ID (for agent's own visits)
 */
async function getSiteVisitsByUser(userId, limit = 50) {
    return SiteVisit.find({ agentId: userId })
        .sort({ scheduledAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Get all site visits (for owner/admin/manager)
 */
async function getAllSiteVisits(limit = 100) {
    return SiteVisit.find()
        .sort({ scheduledAt: -1 })
        .limit(parseInt(limit))
        .populate('agentId', 'name email');
}

/**
 * Sync all site visits to Google Sheets
 */
async function syncAllSiteVisitsToGoogleSheets() {
    try {
        const visits = await SiteVisit.find({ status: { $in: ['scheduled', 'completed'] } })
            .populate('propertyId', 'name location')
            .populate('agentId', 'name')
            .sort({ scheduledAt: -1 });
        
        const result = await googleSheetsService.syncAllSiteVisits(visits);
        return {
            success: true,
            message: `Synced ${visits.length} site visits to Google Sheets`,
            result
        };
    } catch (error) {
        console.error('Sync all site visits to Google Sheets error:', error);
        throw error;
    }
}

/**
 * Update site visit status
 */
async function updateSiteVisitStatus(visitId, status, notes = null) {
    const update = { status };
    if (notes) {
        update.notes = notes;
    }
    if (status === 'completed') {
        update.completedAt = new Date();
    }
    
    return SiteVisit.findByIdAndUpdate(visitId, update, { new: true });
}

/**
 * Get site visit by ID
 */
async function getSiteVisitById(visitId) {
    return SiteVisit.findById(visitId)
        .populate('propertyId', 'name location')
        .populate('agentId', 'name email');
}

module.exports = {
    confirmSiteVisit,
    getSiteVisitsForToday,
    getSiteVisitsByUser,
    getAllSiteVisits,
    syncAllSiteVisitsToGoogleSheets,
    updateSiteVisitStatus,
    getSiteVisitById
};
