/**
 * Metrics Service
 * Business logic for dashboard metrics and analytics
 */

const zohoClient = require('../clients/zoho.client');
const { mapZohoLeadToFrontend } = require('../leads/zoho.mapper');

/**
 * Get dashboard overview metrics
 */
async function getOverview() {
    // Fetch all leads (TODO: optimize with aggregation API)
    const zohoResponse = await zohoClient.getLeads(1, 500);
    const allLeads = (zohoResponse.data || []).map(mapZohoLeadToFrontend);

    // Calculate metrics
    const totalLeads = allLeads.length;

    // Active leads (New, Contacted, Qualified)
    const activeStatuses = ['New', 'Contacted', 'Qualified'];
    const activeLeads = allLeads.filter(l => activeStatuses.includes(l.status)).length;

    // Conversion rate (simplified - closed won / total)
    const closedWon = allLeads.filter(l => l.status === 'Closed Won').length;
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
