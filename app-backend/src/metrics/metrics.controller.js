/**
 * Metrics Controller
 * HTTP handlers for metrics and analytics endpoints
 */

const metricsService = require('./metrics.service');
const analyticsService = require('./analytics.service');
const agentAnalyticsService = require('./agentAnalytics.service');

/**
 * GET /api/metrics/overview
 */
async function getOverview(request, reply) {
    const organizationId = request.user?.organizationId;
    const metrics = await metricsService.getOverview(organizationId);

    return reply.code(200).send(metrics);
}

/**
 * GET /api/analytics/monthly-trends
 */
async function getMonthlyTrends(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId;

    const trends = await analyticsService.getMonthlyTrends(userId, range, organizationId);
    return reply.code(200).send(trends);
}

/**
 * GET /api/analytics/conversion-funnel
 */
async function getConversionFunnel(request, reply) {
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId;

    const funnel = await analyticsService.getConversionFunnel(userId, organizationId);
    return reply.code(200).send(funnel);
}

/**
 * GET /api/analytics/source-performance
 */
async function getSourcePerformance(request, reply) {
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId;

    const sources = await analyticsService.getSourcePerformance(userId, organizationId);
    return reply.code(200).send(sources);
}

/**
 * GET /api/analytics/team-performance
 */
async function getTeamPerformance(request, reply) {
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId;

    const team = await analyticsService.getTeamPerformance(userId, organizationId);
    return reply.code(200).send(team);
}

/**
 * GET /api/analytics/kpi-metrics
 */
async function getKPIMetrics(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId;

    const kpis = await analyticsService.getKPIMetrics(userId, range, organizationId);
    return reply.code(200).send(kpis);
}

/**
 * GET /api/analytics (combined endpoint)
 */
async function getAllAnalytics(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id;
    const organizationId = request.user?.organizationId;

    const [monthlyTrends, conversionFunnel, sourcePerformance, teamPerformance, kpiMetrics] = await Promise.all([
        analyticsService.getMonthlyTrends(userId, range, organizationId),
        analyticsService.getConversionFunnel(userId, organizationId),
        analyticsService.getSourcePerformance(userId, organizationId),
        analyticsService.getTeamPerformance(userId, organizationId),
        analyticsService.getKPIMetrics(userId, range, organizationId)
    ]);

    return reply.code(200).send({
        monthlyTrends,
        conversionFunnel,
        sourcePerformance,
        teamPerformance,
        kpiMetrics
    });
}

/**
 * GET /api/analytics/my-performance
 * Agent-scoped performance dashboard — accessible by ALL authenticated users
 */
async function getMyPerformance(request, reply) {
    const { range = '30days' } = request.query;
    const userId = request.user?.id || request.user?._id;
    const organizationId = request.user?.organizationId;

    if (!userId) {
        return reply.code(401).send({ error: 'Unauthorized' });
    }

    const performance = await agentAnalyticsService.getAgentPerformance(userId, organizationId, range);
    return reply.code(200).send(performance);
}

module.exports = {
    getOverview,
    getMonthlyTrends,
    getConversionFunnel,
    getSourcePerformance,
    getTeamPerformance,
    getKPIMetrics,
    getAllAnalytics,
    getMyPerformance
};
