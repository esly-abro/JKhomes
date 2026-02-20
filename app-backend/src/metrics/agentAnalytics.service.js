/**
 * Agent Analytics Service
 * Provides agent-scoped performance metrics
 * For individual agents to see their own stats (calls, leads, conversions, tasks, etc.)
 */

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const CallLog = require('../models/CallLog');
const Task = require('../tasks/Task.model');
const SiteVisit = require('../models/SiteVisit');
const TenantConfig = require('../models/tenantConfig.model');

/**
 * Helper: get closed status keys for an organization from TenantConfig
 */
async function getClosedStatusKeys(organizationId) {
    if (!organizationId) return ['Deal Closed', 'Lost', 'Closed', 'Won'];
    try {
        const config = await TenantConfig.findOne({ organizationId });
        if (config && config.leadStatuses && config.leadStatuses.length > 0) {
            return config.leadStatuses.filter(s => s.isClosed).map(s => s.key);
        }
    } catch (e) { /* fallback */ }
    return ['Deal Closed', 'Lost', 'Closed', 'Won'];
}

/**
 * Helper: get won/positive-closed status keys
 */
async function getWonStatusKeys(organizationId) {
    if (!organizationId) return ['Deal Closed', 'Won'];
    try {
        const config = await TenantConfig.findOne({ organizationId });
        if (config && config.leadStatuses && config.leadStatuses.length > 0) {
            // Return closed statuses that are NOT negative (Lost, etc.)
            return config.leadStatuses
                .filter(s => s.isClosed && !['Lost', 'Dropped', 'Rejected'].includes(s.key))
                .map(s => s.key);
        }
    } catch (e) { /* fallback */ }
    return ['Deal Closed', 'Won'];
}

/**
 * Get comprehensive agent performance metrics
 * @param {string} agentId - The agent's user ID
 * @param {string} organizationId - The org ID
 * @param {string} range - Time range: '7days' | '30days' | '90days'
 */
async function getAgentPerformance(agentId, organizationId, range = '30days') {
    const days = range === '7days' ? 7 : range === '90days' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);

    const agentObjId = new mongoose.Types.ObjectId(agentId);
    const orgObjId = organizationId ? new mongoose.Types.ObjectId(organizationId) : null;

    const closedKeys = await getClosedStatusKeys(organizationId);
    const wonKeys = await getWonStatusKeys(organizationId);

    // Run all queries in parallel for speed
    const [
        kpis,
        activityBreakdown,
        leadPipeline,
        taskStats,
        callStats,
        dailyActivity,
        recentActivity
    ] = await Promise.all([
        _getKPIs(agentObjId, orgObjId, startDate, prevStartDate, closedKeys, wonKeys),
        _getActivityBreakdown(agentId, orgObjId, startDate),
        _getLeadPipeline(agentObjId, orgObjId, closedKeys),
        _getTaskStats(agentObjId, orgObjId, startDate),
        _getCallStats(agentObjId, orgObjId, startDate),
        _getDailyActivity(agentId, orgObjId, startDate),
        _getRecentActivity(agentId, orgObjId)
    ]);

    return {
        kpis,
        activityBreakdown,
        leadPipeline,
        taskStats,
        callStats,
        dailyActivity,
        recentActivity
    };
}

/**
 * KPI cards: total leads, deals won, conversion rate, revenue, avg response time
 */
async function _getKPIs(agentObjId, orgObjId, startDate, prevStartDate, closedKeys, wonKeys) {
    const baseMatch = { assignedTo: agentObjId };
    if (orgObjId) baseMatch.organizationId = orgObjId;

    // Current period
    const [currentAgg] = await Lead.aggregate([
        { $match: baseMatch },
        {
            $facet: {
                total: [{ $count: 'count' }],
                recentLeads: [
                    { $match: { createdAt: { $gte: startDate } } },
                    { $count: 'count' }
                ],
                won: [
                    { $match: { status: { $in: wonKeys } } },
                    { $count: 'count' }
                ],
                recentWon: [
                    { $match: { status: { $in: wonKeys }, createdAt: { $gte: startDate } } },
                    { $count: 'count' }
                ],
                revenue: [
                    { $match: { status: { $in: wonKeys } } },
                    { $group: { _id: null, total: { $sum: '$value' } } }
                ],
                responseTime: [
                    {
                        $match: {
                            firstResponseAt: { $exists: true, $ne: null },
                            createdAt: { $gte: startDate }
                        }
                    },
                    {
                        $project: {
                            responseMs: { $subtract: ['$firstResponseAt', '$createdAt'] }
                        }
                    },
                    {
                        $group: { _id: null, avgMs: { $avg: '$responseMs' } }
                    }
                ]
            }
        }
    ]);

    // Previous period for comparison
    const [prevAgg] = await Lead.aggregate([
        {
            $match: {
                ...baseMatch,
                createdAt: { $gte: prevStartDate, $lt: startDate }
            }
        },
        {
            $facet: {
                total: [{ $count: 'count' }],
                won: [
                    { $match: { status: { $in: wonKeys } } },
                    { $count: 'count' }
                ]
            }
        }
    ]);

    const totalLeads = currentAgg.total[0]?.count || 0;
    const recentLeads = currentAgg.recentLeads[0]?.count || 0;
    const dealsWon = currentAgg.won[0]?.count || 0;
    const recentWon = currentAgg.recentWon[0]?.count || 0;
    const revenue = currentAgg.revenue[0]?.total || 0;
    const avgResponseMs = currentAgg.responseTime[0]?.avgMs || 0;
    const prevTotal = prevAgg.total[0]?.count || 0;
    const prevWon = prevAgg.won[0]?.count || 0;

    const conversionRate = totalLeads > 0 ? ((dealsWon / totalLeads) * 100).toFixed(1) : '0.0';

    // Changes
    const leadsChange = prevTotal > 0 ? (((recentLeads - prevTotal) / prevTotal) * 100).toFixed(0) : (recentLeads > 0 ? '100' : '0');
    const dealsChange = prevWon > 0 ? (((recentWon - prevWon) / prevWon) * 100).toFixed(0) : (recentWon > 0 ? '100' : '0');

    // Format response time
    let avgResponseTime = 'N/A';
    if (avgResponseMs > 0) {
        const mins = Math.round(avgResponseMs / 60000);
        if (mins < 60) avgResponseTime = `${mins}m`;
        else if (mins < 1440) avgResponseTime = `${Math.round(mins / 60)}h`;
        else avgResponseTime = `${Math.round(mins / 1440)}d`;
    }

    return {
        totalLeads,
        totalLeadsChange: `${leadsChange >= 0 ? '+' : ''}${leadsChange}%`,
        dealsWon,
        dealsWonChange: `${dealsChange >= 0 ? '+' : ''}${dealsChange}%`,
        conversionRate: `${conversionRate}%`,
        revenue,
        avgResponseTime
    };
}

/**
 * Activity breakdown: calls, emails, meetings, site visits, notes, WhatsApp messages
 */
async function _getActivityBreakdown(agentId, orgObjId, startDate) {
    const match = { userId: agentId, createdAt: { $gte: startDate } };
    if (orgObjId) match.organizationId = orgObjId.toString();

    const breakdown = await Activity.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$type',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    // Map to friendly labels
    const labelMap = {
        call: 'Calls',
        email: 'Emails',
        meeting: 'Meetings',
        site_visit: 'Site Visits',
        appointment: 'Appointments',
        whatsapp: 'WhatsApp',
        sms: 'SMS',
        note: 'Notes',
        task: 'Tasks',
        task_created: 'Tasks Created',
        status_change: 'Status Updates',
        assignment: 'Assignments',
        automation: 'Automations'
    };

    return breakdown.map(b => ({
        type: b._id,
        label: labelMap[b._id] || b._id,
        count: b.count
    }));
}

/**
 * Lead pipeline: how many leads in each status (funnel for this agent only)
 */
async function _getLeadPipeline(agentObjId, orgObjId, closedKeys) {
    const match = { assignedTo: agentObjId };
    if (orgObjId) match.organizationId = orgObjId;

    const pipeline = await Lead.aggregate([
        { $match: match },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    return pipeline.map(p => ({
        status: p._id || 'Unknown',
        count: p.count
    }));
}

/**
 * Task stats: pending, completed, overdue, completion rate
 */
async function _getTaskStats(agentObjId, orgObjId, startDate) {
    const match = { assignedTo: agentObjId };
    if (orgObjId) match.organizationId = orgObjId;

    const [result] = await Task.aggregate([
        { $match: match },
        {
            $facet: {
                total: [{ $count: 'count' }],
                pending: [{ $match: { status: 'pending' } }, { $count: 'count' }],
                inProgress: [{ $match: { status: 'in_progress' } }, { $count: 'count' }],
                completed: [{ $match: { status: 'completed' } }, { $count: 'count' }],
                overdue: [{ $match: { status: 'overdue' } }, { $count: 'count' }],
                recentCompleted: [
                    { $match: { status: 'completed', completedAt: { $gte: startDate } } },
                    { $count: 'count' }
                ]
            }
        }
    ]);

    const total = result.total[0]?.count || 0;
    const completed = result.completed[0]?.count || 0;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';

    return {
        total,
        pending: result.pending[0]?.count || 0,
        inProgress: result.inProgress[0]?.count || 0,
        completed,
        overdue: result.overdue[0]?.count || 0,
        recentCompleted: result.recentCompleted[0]?.count || 0,
        completionRate: `${completionRate}%`
    };
}

/**
 * Call stats: total calls, total duration, avg duration, inbound/outbound
 */
async function _getCallStats(agentObjId, orgObjId, startDate) {
    const match = { agentId: agentObjId, createdAt: { $gte: startDate } };
    if (orgObjId) match.organizationId = orgObjId;

    const [result] = await CallLog.aggregate([
        { $match: match },
        {
            $facet: {
                total: [{ $count: 'count' }],
                outbound: [{ $match: { direction: 'outbound' } }, { $count: 'count' }],
                inbound: [{ $match: { direction: 'inbound' } }, { $count: 'count' }],
                duration: [
                    { $group: { _id: null, total: { $sum: '$duration' }, avg: { $avg: '$duration' } } }
                ]
            }
        }
    ]);

    const totalDurationSec = result.duration[0]?.total || 0;
    const avgDurationSec = result.duration[0]?.avg || 0;

    // Format durations
    const formatDuration = (sec) => {
        if (!sec || sec === 0) return '0m';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    return {
        totalCalls: result.total[0]?.count || 0,
        outbound: result.outbound[0]?.count || 0,
        inbound: result.inbound[0]?.count || 0,
        totalDuration: formatDuration(totalDurationSec),
        avgDuration: formatDuration(Math.round(avgDurationSec))
    };
}

/**
 * Daily activity counts for the period (for trend line chart)
 */
async function _getDailyActivity(agentId, orgObjId, startDate) {
    const match = { userId: agentId, createdAt: { $gte: startDate } };
    if (orgObjId) match.organizationId = orgObjId.toString();

    const daily = await Activity.aggregate([
        { $match: match },
        {
            $group: {
                _id: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { '_id.date': 1 } }
    ]);

    return daily.map(d => ({
        date: d._id.date,
        count: d.count
    }));
}

/**
 * Recent activities for the agent (last 10)
 */
async function _getRecentActivity(agentId, orgObjId) {
    const match = { userId: agentId };
    if (orgObjId) match.organizationId = orgObjId.toString();

    const activities = await Activity.find(match)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    return activities.map(a => ({
        id: a._id,
        type: a.type,
        title: a.title,
        description: a.description,
        outcome: a.outcome,
        createdAt: a.createdAt
    }));
}

module.exports = {
    getAgentPerformance
};
