/**
 * Billing Controller
 * HTTP handlers for billing/subscription management.
 * Returns 501 for payment operations until a payment gateway is configured.
 */

const billingService = require('../services/billing.service');

/**
 * GET /api/billing/plans
 */
async function getPlans(request, reply) {
    const plans = await billingService.getPlans();
    return reply.code(200).send({ success: true, data: plans });
}

/**
 * GET /api/billing
 * Get current billing info + usage for the org
 */
async function getBillingInfo(request, reply) {
    const organizationId = request.user.organizationId;
    const info = await billingService.getBillingInfo(organizationId);
    return reply.code(200).send({ success: true, data: info });
}

/**
 * POST /api/billing/upgrade
 * Body: { planId: 'starter' | 'professional' | 'enterprise' }
 */
async function upgradePlan(request, reply) {
    const organizationId = request.user.organizationId;
    const { planId } = request.body;

    const result = await billingService.upgradePlan(organizationId, planId);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * PUT /api/billing/payment-method
 */
async function updatePaymentMethod(request, reply) {
    const organizationId = request.user.organizationId;
    const result = await billingService.updatePaymentMethod(organizationId, request.body);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * GET /api/billing/invoices
 */
async function getInvoices(request, reply) {
    const organizationId = request.user.organizationId;
    const result = await billingService.getInvoices(organizationId);
    return reply.code(200).send({ success: true, data: result });
}

/**
 * POST /api/billing/cancel
 */
async function cancelSubscription(request, reply) {
    const organizationId = request.user.organizationId;
    const result = await billingService.cancelSubscription(organizationId);
    return reply.code(200).send({ success: true, data: result });
}

module.exports = {
    getPlans,
    getBillingInfo,
    upgradePlan,
    updatePaymentMethod,
    getInvoices,
    cancelSubscription
};
