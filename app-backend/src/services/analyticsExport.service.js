/**
 * Analytics Export Service
 * Generates CSV/JSON exports of analytics data.
 * Supports: leads, performance, conversion funnel, source data.
 */

const Lead = require('../models/Lead');
const Activity = require('../models/Activity');
const { ValidationError } = require('../errors/AppError');
const logger = require('../utils/logger');

/**
 * Generate an analytics export
 * @param {string} organizationId
 * @param {object} options
 * @param {string} options.type - 'leads' | 'performance' | 'conversions' | 'sources'
 * @param {string} options.format - 'csv' | 'json'
 * @param {string} [options.startDate]
 * @param {string} [options.endDate]
 * @param {string} [options.agentId] - Filter by agent
 */
async function generateExport(organizationId, options = {}) {
    const { type = 'leads', format = 'csv', startDate, endDate, agentId } = options;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    let data;
    let columns;

    switch (type) {
        case 'leads':
            ({ data, columns } = await _exportLeads(organizationId, dateFilter, agentId));
            break;
        case 'performance':
            ({ data, columns } = await _exportPerformance(organizationId, dateFilter));
            break;
        case 'conversions':
            ({ data, columns } = await _exportConversions(organizationId, dateFilter));
            break;
        case 'sources':
            ({ data, columns } = await _exportSources(organizationId, dateFilter));
            break;
        default:
            throw new ValidationError(`Unknown export type: ${type}`);
    }

    if (format === 'csv') {
        return {
            contentType: 'text/csv',
            filename: `${type}-export-${new Date().toISOString().split('T')[0]}.csv`,
            body: _toCsv(data, columns)
        };
    }

    return {
        contentType: 'application/json',
        filename: `${type}-export-${new Date().toISOString().split('T')[0]}.json`,
        body: JSON.stringify({ exportedAt: new Date().toISOString(), type, count: data.length, data }, null, 2)
    };
}

/**
 * Export leads data
 */
async function _exportLeads(organizationId, dateFilter, agentId) {
    const filter = { organizationId };
    if (Object.keys(dateFilter).length) filter.createdAt = dateFilter;
    if (agentId) filter.assignedTo = agentId;

    const leads = await Lead.find(filter)
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .lean();

    const columns = ['Name', 'Email', 'Phone', 'Source', 'Status', 'Category', 'Budget', 'Assigned To', 'Created At', 'Last Contact'];

    const data = leads.map(l => ({
        'Name': l.name || l.firstName || '',
        'Email': l.email || '',
        'Phone': l.phone || l.mobile || '',
        'Source': l.source || '',
        'Status': l.status || '',
        'Category': l.category || '',
        'Budget': l.budget || '',
        'Assigned To': l.assignedTo?.name || 'Unassigned',
        'Created At': l.createdAt ? new Date(l.createdAt).toISOString() : '',
        'Last Contact': l.lastContactAt ? new Date(l.lastContactAt).toISOString() : ''
    }));

    return { data, columns };
}

/**
 * Export agent performance summary
 */
async function _exportPerformance(organizationId, dateFilter) {
    const matchStage = { organizationId };
    if (Object.keys(dateFilter).length) matchStage.createdAt = dateFilter;

    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: '$assignedTo',
                totalLeads: { $sum: 1 },
                convertedLeads: {
                    $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] }
                },
                activeleads: {
                    $sum: { $cond: [{ $in: ['$status', ['new', 'contacted', 'qualified', 'negotiation']] }, 1, 0] }
                }
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'agent'
            }
        },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        { $sort: { totalLeads: -1 } }
    ];

    const results = await Lead.aggregate(pipeline);
    const columns = ['Agent', 'Email', 'Total Leads', 'Active Leads', 'Converted', 'Conversion Rate'];

    const data = results.map(r => ({
        'Agent': r.agent?.name || 'Unassigned',
        'Email': r.agent?.email || '',
        'Total Leads': r.totalLeads,
        'Active Leads': r.activeleads,
        'Converted': r.convertedLeads,
        'Conversion Rate': r.totalLeads > 0 ? `${((r.convertedLeads / r.totalLeads) * 100).toFixed(1)}%` : '0%'
    }));

    return { data, columns };
}

/**
 * Export conversion funnel data
 */
async function _exportConversions(organizationId, dateFilter) {
    const matchStage = { organizationId };
    if (Object.keys(dateFilter).length) matchStage.createdAt = dateFilter;

    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ];

    const results = await Lead.aggregate(pipeline);
    const columns = ['Status', 'Count'];
    const data = results.map(r => ({ 'Status': r._id || 'Unknown', 'Count': r.count }));

    return { data, columns };
}

/**
 * Export lead source breakdown
 */
async function _exportSources(organizationId, dateFilter) {
    const matchStage = { organizationId };
    if (Object.keys(dateFilter).length) matchStage.createdAt = dateFilter;

    const pipeline = [
        { $match: matchStage },
        {
            $group: {
                _id: '$source',
                count: { $sum: 1 },
                converted: {
                    $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] }
                }
            }
        },
        { $sort: { count: -1 } }
    ];

    const results = await Lead.aggregate(pipeline);
    const columns = ['Source', 'Total Leads', 'Converted', 'Conversion Rate'];

    const data = results.map(r => ({
        'Source': r._id || 'Unknown',
        'Total Leads': r.count,
        'Converted': r.converted,
        'Conversion Rate': r.count > 0 ? `${((r.converted / r.count) * 100).toFixed(1)}%` : '0%'
    }));

    return { data, columns };
}

/**
 * Convert data array to CSV string
 */
function _toCsv(data, columns) {
    if (!data.length) return columns.join(',') + '\n';

    const header = columns.join(',');
    const rows = data.map(row =>
        columns.map(col => {
            const val = String(row[col] ?? '');
            // Escape values containing commas, quotes, or newlines
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        }).join(',')
    );

    return [header, ...rows].join('\n');
}

module.exports = {
    generateExport
};
