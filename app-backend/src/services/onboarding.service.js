/**
 * Onboarding Service
 * Persists onboarding wizard progress and preferences to the User model.
 * Each step is saved as the user progresses, so they can resume later.
 */

const User = require('../models/User');
const { NotFoundError, ValidationError } = require('../errors/AppError');
const logger = require('../utils/logger');

// Onboarding step definitions
const STEPS = ['welcome', 'company_info', 'team_setup', 'integrations', 'preferences', 'complete'];

/**
 * Get the user's onboarding state
 */
async function getOnboardingState(userId) {
    const user = await User.findById(userId).select('onboarding name email role').lean();
    if (!user) throw new NotFoundError('User');

    // Return existing or default state
    return user.onboarding || {
        completed: false,
        currentStep: 'welcome',
        stepsCompleted: [],
        data: {},
        startedAt: null,
        completedAt: null
    };
}

/**
 * Update onboarding step data
 * @param {string} userId
 * @param {string} step - The step being saved
 * @param {object} data - The step's form data
 */
async function saveStepData(userId, step, data = {}) {
    if (!STEPS.includes(step)) {
        throw new ValidationError(`Invalid onboarding step: ${step}. Valid steps: ${STEPS.join(', ')}`);
    }

    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    // Initialize onboarding if not present
    if (!user.onboarding) {
        user.onboarding = {
            completed: false,
            currentStep: step,
            stepsCompleted: [],
            data: {},
            startedAt: new Date()
        };
    }

    // Save step data
    user.onboarding.data = user.onboarding.data || {};
    user.onboarding.data[step] = data;

    // Mark step as completed
    if (!user.onboarding.stepsCompleted.includes(step)) {
        user.onboarding.stepsCompleted.push(step);
    }

    // Advance to next step
    const currentIdx = STEPS.indexOf(step);
    if (currentIdx < STEPS.length - 1) {
        user.onboarding.currentStep = STEPS[currentIdx + 1];
    }

    // Check if all content steps are done (exclude 'complete' metastep)
    const contentSteps = STEPS.filter(s => s !== 'complete');
    const allDone = contentSteps.every(s => user.onboarding.stepsCompleted.includes(s));
    if (allDone) {
        user.onboarding.completed = true;
        user.onboarding.completedAt = new Date();
        user.onboarding.currentStep = 'complete';
    }

    user.markModified('onboarding');
    await user.save();

    logger.info(`Onboarding step saved: ${step} for user ${userId}`);
    return user.onboarding;
}

/**
 * Complete onboarding (skip remaining steps)
 */
async function completeOnboarding(userId) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    if (!user.onboarding) {
        user.onboarding = { data: {}, stepsCompleted: [], startedAt: new Date() };
    }

    user.onboarding.completed = true;
    user.onboarding.completedAt = new Date();
    user.onboarding.currentStep = 'complete';

    user.markModified('onboarding');
    await user.save();

    logger.info(`Onboarding completed for user ${userId}`);
    return user.onboarding;
}

/**
 * Reset onboarding (admin action)
 */
async function resetOnboarding(userId) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User');

    user.onboarding = {
        completed: false,
        currentStep: 'welcome',
        stepsCompleted: [],
        data: {},
        startedAt: null,
        completedAt: null
    };

    user.markModified('onboarding');
    await user.save();

    logger.info(`Onboarding reset for user ${userId}`);
    return user.onboarding;
}

module.exports = {
    STEPS,
    getOnboardingState,
    saveStepData,
    completeOnboarding,
    resetOnboarding
};
