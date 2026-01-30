/**
 * Metrics Controller
 * HTTP handlers for metrics and analytics endpoints
 */

const metricsService = require('./metrics.service');
const analyticsService = require('./analytics.service');

/**
 * GET /api/metrics/overview
 */
async function getOverview(request, reply) {
    const metrics = await metricsService.getOverview();

    return reply.code(200).send(metrics);
}

/**
 * GET /api/analytics/monthly-trends
 */
async function getMonthlyTrends(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id;

    const trends = await analyticsService.getMonthlyTrends(userId, range);
    return reply.code(200).send(trends);
}

/**
 * GET /api/analytics/conversion-funnel
 */
async function getConversionFunnel(request, reply) {
    const userId = request.user?.id;

    const funnel = await analyticsService.getConversionFunnel(userId);
    return reply.code(200).send(funnel);
}

/**
 * GET /api/analytics/source-performance
 */
async function getSourcePerformance(request, reply) {
    const userId = request.user?.id;

    const sources = await analyticsService.getSourcePerformance(userId);
    return reply.code(200).send(sources);
}

/**
 * GET /api/analytics/team-performance
 */
async function getTeamPerformance(request, reply) {
    const userId = request.user?.id;

    const team = await analyticsService.getTeamPerformance(userId);
    return reply.code(200).send(team);
}

/**
 * GET /api/analytics/kpi-metrics
 */
async function getKPIMetrics(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id;

    const kpis = await analyticsService.getKPIMetrics(userId, range);
    return reply.code(200).send(kpis);
}

/**
 * GET /api/analytics (combined endpoint)
 */
async function getAllAnalytics(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id;

    const [monthlyTrends, conversionFunnel, sourcePerformance, teamPerformance, kpiMetrics] = await Promise.all([
        analyticsService.getMonthlyTrends(userId, range),
        analyticsService.getConversionFunnel(userId),
        analyticsService.getSourcePerformance(userId),
        analyticsService.getTeamPerformance(userId),
        analyticsService.getKPIMetrics(userId, range)
    ]);

    return reply.code(200).send({
        monthlyTrends,
        conversionFunnel,
        sourcePerformance,
        teamPerformance,
        kpiMetrics
    });
}

module.exports = {
    getOverview,
    getMonthlyTrends,
    getConversionFunnel,
    getSourcePerformance,
    getTeamPerformance,
    getKPIMetrics,
    getAllAnalytics
};
