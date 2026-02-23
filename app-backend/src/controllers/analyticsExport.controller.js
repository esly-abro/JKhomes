/**
 * Analytics Export Controller
 * HTTP handler for analytics CSV/JSON export.
 */

const analyticsExportService = require('../services/analyticsExport.service');

/**
 * GET /api/analytics/export
 * Query: type (leads|performance|conversions|sources), format (csv|json), startDate, endDate, agentId
 */
async function exportAnalytics(request, reply) {
    const organizationId = request.user.organizationId;
    const { type, format, startDate, endDate, agentId } = request.query;

    const result = await analyticsExportService.generateExport(organizationId, {
        type: type || 'leads',
        format: format || 'csv',
        startDate,
        endDate,
        agentId
    });

    return reply
        .header('Content-Type', result.contentType)
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .send(result.body);
}

module.exports = {
    exportAnalytics
};
