/**
 * Billing Routes
 * Fastify plugin for billing/subscription management.
 * Prefix: /api/billing
 */

const billingController = require('../controllers/billing.controller');
const { requireRole } = require('../middleware/roles');

async function billingRoutes(fastify, options) {
    // Get available plans (any authenticated user)
    fastify.get('/plans', billingController.getPlans);

    // Get billing info (owner/admin only)
    fastify.get('/', {
        preHandler: requireRole(['owner', 'admin'])
    }, billingController.getBillingInfo);

    // Upgrade plan (owner only)
    fastify.post('/upgrade', {
        preHandler: requireRole(['owner'])
    }, billingController.upgradePlan);

    // Update payment method (owner only)
    fastify.put('/payment-method', {
        preHandler: requireRole(['owner'])
    }, billingController.updatePaymentMethod);

    // Get invoices (owner/admin)
    fastify.get('/invoices', {
        preHandler: requireRole(['owner', 'admin'])
    }, billingController.getInvoices);

    // Cancel subscription (owner only)
    fastify.post('/cancel', {
        preHandler: requireRole(['owner'])
    }, billingController.cancelSubscription);
}

module.exports = billingRoutes;
