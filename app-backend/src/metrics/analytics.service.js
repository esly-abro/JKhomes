/**
 * Analytics Service
 * Provides real-time analytics data from database
 */

const Lead = require('../models/Lead');
const User = require('../models/User');
const TenantConfig = require('../models/tenantConfig.model');

/**
 * Helper: get closed status keys for an organization from TenantConfig
 * Falls back to ['Deal Closed', 'Lost'] if no config found
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
 * Get monthly trends for leads and deals
 */
async function getMonthlyTrends(userId, range = '30days', organizationId = null) {
    const months = range === '90days' ? 3 : range === 'year' ? 12 : 1;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const closedKeys = await getClosedStatusKeys(organizationId);

    const matchFilter = { createdAt: { $gte: startDate } };
    if (organizationId) {
        matchFilter.organizationId = new (require('mongoose').Types.ObjectId)(organizationId);
    }

    // Get leads grouped by month
    const monthlyData = await Lead.aggregate([
        {
            $match: matchFilter
        },
        {
            $group: {
                _id: {
                    year: { $year: '$createdAt' },
                    month: { $month: '$createdAt' }
                },
                leads: { $sum: 1 },
                deals: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', closedKeys] },
                            1,
                            0
                        ]
                    }
                },
                revenue: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', closedKeys] },
                            '$value',
                            0
                        ]
                    }
                }
            }
        },
        {
            $sort: { '_id.year': 1, '_id.month': 1 }
        }
    ]);

    // Format data with month names
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return monthlyData.map(item => ({
        month: monthNames[item._id.month - 1],
        leads: item.leads,
        deals: item.deals,
        revenue: item.revenue
    }));
}

/**
 * Get conversion funnel data
 */
async function getConversionFunnel(userId, organizationId = null) {
    // Build funnel from TenantConfig lead statuses (progressive narrowing)
    let allKeys = [];
    try {
        if (organizationId) {
            const config = await TenantConfig.findOne({ organizationId });
            if (config && config.leadStatuses && config.leadStatuses.length > 0) {
                allKeys = config.leadStatuses
                    .filter(s => s.isActive)
                    .sort((a, b) => a.order - b.order)
                    .map(s => s.key);
            }
        }
    } catch (e) { /* fallback */ }

    if (allKeys.length === 0) {
        allKeys = ['New', 'Call Attended', 'No Response', 'Interested', 'Appointment Booked', 'Appointment Scheduled', 'Not Interested', 'Deal Closed', 'Lost'];
    }

    // Build progressive funnel: each stage includes itself and all later stages
    const stages = allKeys.map((key, i) => ({
        stage: key,
        statuses: allKeys.slice(i)
    }));

    const funnelData = await Promise.all(
        stages.map(async ({ stage, statuses }) => {
            const query = { status: { $in: statuses } };
            if (organizationId) {
                query.organizationId = organizationId;
            }
            const count = await Lead.countDocuments(query);
            return { stage, count };
        })
    );

    return funnelData.filter(d => d.count > 0);
}

/**
 * Get source performance data
 */
async function getSourcePerformance(userId, organizationId = null) {
    const closedKeys = await getClosedStatusKeys(organizationId);
    const matchFilter = {};
    if (organizationId) {
        matchFilter.organizationId = new (require('mongoose').Types.ObjectId)(organizationId);
    }

    const sources = await Lead.aggregate([
        { $match: matchFilter },
        {
            $group: {
                _id: '$source',
                leads: { $sum: 1 },
                conversions: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', closedKeys] },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                source: '$_id',
                leads: 1,
                conversion: {
                    $cond: [
                        { $eq: ['$leads', 0] },
                        0,
                        { $multiply: [{ $divide: ['$conversions', '$leads'] }, 100] }
                    ]
                }
            }
        },
        {
            $sort: { leads: -1 }
        }
    ]);

    return sources.map(item => ({
        source: item.source || 'Unknown',
        leads: item.leads,
        conversion: Math.round(item.conversion)
    }));
}

/**
 * Get team performance data
 */
async function getTeamPerformance(userId, organizationId = null) {
    const closedKeys = await getClosedStatusKeys(organizationId);
    // Get all users with role agent, manager, or bpo
    const matchFilter = {};
    if (organizationId) {
        matchFilter.organizationId = new (require('mongoose').Types.ObjectId)(organizationId);
    }

    const teamMembers = await Lead.aggregate([
        { $match: matchFilter },
        {
            $lookup: {
                from: 'users',
                localField: 'owner',
                foreignField: '_id',
                as: 'ownerData'
            }
        },
        {
            $unwind: {
                path: '$ownerData',
                preserveNullAndEmptyArrays: true
            }
        },
        {
            $group: {
                _id: '$owner',
                name: { $first: '$ownerData.name' },
                email: { $first: '$ownerData.email' },
                leads: { $sum: 1 },
                deals: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', closedKeys] },
                            1,
                            0
                        ]
                    }
                },
                revenue: {
                    $sum: {
                        $cond: [
                            { $in: ['$status', closedKeys] },
                            '$value',
                            0
                        ]
                    }
                }
            }
        },
        {
            $match: {
                _id: { $ne: null }
            }
        },
        {
            $sort: { leads: -1 }
        }
    ]);

    return teamMembers.map(member => ({
        name: member.name || member.email?.split('@')[0] || 'Unknown',
        leads: member.leads,
        deals: member.deals,
        revenue: member.revenue
    }));
}

/**
 * Get KPI metrics
 */
async function getKPIMetrics(userId, range = '30days', organizationId = null) {
    const days = range === '7days' ? 7 : range === '90days' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const closedKeys = await getClosedStatusKeys(organizationId);

    const baseMatch = {};
    if (organizationId) {
        baseMatch.organizationId = new (require('mongoose').Types.ObjectId)(organizationId);
    }

    // Current period metrics
    const currentMetrics = await Lead.aggregate([
        { $match: baseMatch },
        {
            $facet: {
                total: [
                    { $count: 'count' }
                ],
                recent: [
                    { $match: { createdAt: { $gte: startDate } } },
                    { $count: 'count' }
                ],
                closed: [
                    { $match: { status: { $in: closedKeys } } },
                    { $count: 'count' }
                ],
                recentClosed: [
                    {
                        $match: {
                            status: { $in: closedKeys },
                            createdAt: { $gte: startDate }
                        }
                    },
                    { $count: 'count' }
                ],
                revenue: [
                    {
                        $match: { status: { $in: closedKeys } }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: '$value' }
                        }
                    }
                ]
            }
        }
    ]);

    const total = currentMetrics[0].total[0]?.count || 0;
    const recent = currentMetrics[0].recent[0]?.count || 0;
    const closed = currentMetrics[0].closed[0]?.count || 0;
    const recentClosed = currentMetrics[0].recentClosed[0]?.count || 0;
    const revenue = currentMetrics[0].revenue[0]?.total || 0;

    // Calculate conversion rate
    const conversionRate = total > 0 ? ((closed / total) * 100).toFixed(1) : '0.0';

    // Calculate previous period for comparison
    const previousStartDate = new Date(startDate);
    previousStartDate.setDate(previousStartDate.getDate() - days);

    const previousMetrics = await Lead.aggregate([
        {
            $match: {
                ...baseMatch,
                createdAt: { $gte: previousStartDate, $lt: startDate }
            }
        },
        {
            $facet: {
                total: [{ $count: 'count' }],
                closed: [
                    { $match: { status: { $in: closedKeys } } },
                    { $count: 'count' }
                ]
            }
        }
    ]);

    const previousTotal = previousMetrics[0].total[0]?.count || 1;
    const previousClosed = previousMetrics[0].closed[0]?.count || 1;

    // Calculate changes
    const totalChange = previousTotal > 0 ? (((recent - previousTotal) / previousTotal) * 100).toFixed(1) : '0';
    const closedChange = previousClosed > 0 ? (((recentClosed - previousClosed) / previousClosed) * 100).toFixed(1) : '0';

    return {
        totalLeads: total,
        totalLeadsChange: `${totalChange >= 0 ? '+' : ''}${totalChange}%`,
        conversionRate: `${conversionRate}%`,
        conversionRateChange: '+0%', // TODO: Calculate from historical data
        dealsClosed: closed,
        dealsClosedChange: `${closedChange >= 0 ? '+' : ''}${closedChange}%`,
        totalRevenue: revenue,
        totalRevenueChange: '+0%' // TODO: Calculate from historical data
    };
}

module.exports = {
    getMonthlyTrends,
    getConversionFunnel,
    getSourcePerformance,
    getTeamPerformance,
    getKPIMetrics
};
