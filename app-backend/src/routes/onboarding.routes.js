/**
 * Onboarding Routes
 * Fastify plugin for onboarding wizard persistence.
 * Prefix: /api/onboarding
 */

const onboardingController = require('../controllers/onboarding.controller');
const { requireRole } = require('../middleware/roles');

async function onboardingRoutes(fastify, options) {
    // Get onboarding state
    fastify.get('/', onboardingController.getState);

    // Save step data
    fastify.post('/steps/:step', onboardingController.saveStep);

    // Complete onboarding (skip remaining)
    fastify.post('/complete', onboardingController.complete);

    // Reset onboarding (admin only)
    fastify.post('/reset', {
        preHandler: requireRole(['owner', 'admin'])
    }, onboardingController.reset);
}

module.exports = onboardingRoutes;
