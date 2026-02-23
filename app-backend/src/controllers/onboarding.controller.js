/**
 * Onboarding Controller
 * HTTP handlers for onboarding wizard state persistence.
 */

const onboardingService = require('../services/onboarding.service');

/**
 * GET /api/onboarding
 * Get current onboarding state for the logged-in user
 */
async function getState(request, reply) {
    const userId = request.user.id || request.user._id;
    const state = await onboardingService.getOnboardingState(userId);
    return reply.code(200).send({ success: true, data: state });
}

/**
 * POST /api/onboarding/steps/:step
 * Save data for a specific onboarding step
 */
async function saveStep(request, reply) {
    const userId = request.user.id || request.user._id;
    const { step } = request.params;
    const data = request.body;

    const state = await onboardingService.saveStepData(userId, step, data);
    return reply.code(200).send({ success: true, data: state });
}

/**
 * POST /api/onboarding/complete
 * Mark onboarding as complete (skip remaining)
 */
async function complete(request, reply) {
    const userId = request.user.id || request.user._id;
    const state = await onboardingService.completeOnboarding(userId);
    return reply.code(200).send({ success: true, data: state });
}

/**
 * POST /api/onboarding/reset
 * Reset onboarding (admin only)
 */
async function reset(request, reply) {
    const { userId } = request.body;
    const targetUserId = userId || request.user.id || request.user._id;

    const state = await onboardingService.resetOnboarding(targetUserId);
    return reply.code(200).send({ success: true, data: state });
}

module.exports = {
    getState,
    saveStep,
    complete,
    reset
};
