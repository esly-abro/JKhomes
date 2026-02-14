/**
 * Metrics Service
 * Business logic for dashboard metrics and analytics
 */

const zohoClient = require('../clients/zoho.client');
const { mapZohoLeadToFrontend } = require('../leads/zoho.mapper');
const TenantConfig = require('../models/tenantConfig.model');

/**
 * Get dashboard overview metrics (scoped to organization)
 */
async function getOverview(organizationId) {
    // Fetch all leads (TODO: optimize with aggregation API)
    const zohoResponse = await zohoClient.getLeads(1, 500);
    const allLeadsRaw = (zohoResponse.data || []).map(mapZohoLeadToFrontend);

    // Filter by organizationId if provided
    const allLeads = organizationId
        ? allLeadsRaw.filter(l => l.organizationId && l.organizationId.toString() === organizationId.toString())
        : allLeadsRaw;

    // Load active/closed status keys from TenantConfig
    let activeStatuses = ['New', 'Call Attended', 'Interested', 'Appointment Booked', 'Appointment Scheduled', 'No Response'];
    let closedStatuses = ['Deal Closed', 'Lost'];
    try {
        if (organizationId) {
            const config = await TenantConfig.findOne({ organizationId });
            if (config && config.leadStatuses && config.leadStatuses.length > 0) {
                activeStatuses = config.leadStatuses.filter(s => s.isActive && !s.isClosed).map(s => s.key);
                closedStatuses = config.leadStatuses.filter(s => s.isClosed).map(s => s.key);
            }
        }
    } catch (e) { /* fallback */ }

    // Calculate metrics
    const totalLeads = allLeads.length;
    const activeLeads = allLeads.filter(l => activeStatuses.includes(l.status)).length;

    // Conversion rate (closed / total)
    const closedWon = allLeads.filter(l => closedStatuses.includes(l.status)).length;
    const conversionRate = totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(1) : 0;

    // Pipeline value
    const pipelineValue = allLeads.reduce((sum, lead) => sum + (lead.value || 0), 0);

    // Leads by source
    const leadsBySource = {};
    allLeads.forEach(lead => {
        const source = lead.source || 'Unknown';
        leadsBySource[source] = (leadsBySource[source] || 0) + 1;
    });

    // Leads by status
    const leadsByStatus = {};
    allLeads.forEach(lead => {
        const status = lead.status || 'New';
        leadsByStatus[status] = (leadsByStatus[status] || 0) + 1;
    });

    // Recent leads (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentLeads = allLeads.filter(lead => {
        const createdDate = new Date(lead.createdAt);
        return createdDate >= sevenDaysAgo;
    }).length;

    return {
        totalLeads,
        activeLeads,
        conversionRate: parseFloat(conversionRate),
        pipelineValue,
        leadsBySource,
        leadsByStatus,
        recentLeads,
        period: 'last_7_days'
    };
}

module.exports = {
    getOverview
};
