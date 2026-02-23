/**
 * Billing Service
 * Abstraction layer for billing/subscription management.
 *
 * Returns 501 (Not Implemented) for payment operations until Stripe/Razorpay is configured.
 * Provides plan info and usage stats from local data.
 */

const User = require('../models/User');
const Lead = require('../models/Lead');
const { AppError } = require('../errors/AppError');
const logger = require('../utils/logger');

// Plan definitions (local — no payment gateway needed)
const PLANS = {
    free: {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'INR',
        limits: { users: 3, leads: 100, storage: '500MB' },
        features: ['Basic CRM', 'Up to 3 users', '100 leads']
    },
    starter: {
        id: 'starter',
        name: 'Starter',
        price: 1999,
        currency: 'INR',
        limits: { users: 10, leads: 1000, storage: '5GB' },
        features: ['All Free features', 'Up to 10 users', '1,000 leads', 'WhatsApp integration', 'Basic analytics']
    },
    professional: {
        id: 'professional',
        name: 'Professional',
        price: 4999,
        currency: 'INR',
        limits: { users: 50, leads: 10000, storage: '25GB' },
        features: ['All Starter features', 'Up to 50 users', '10,000 leads', 'Advanced analytics', 'Automations', 'API access']
    },
    enterprise: {
        id: 'enterprise',
        name: 'Enterprise',
        price: null,
        currency: 'INR',
        limits: { users: -1, leads: -1, storage: 'Unlimited' },
        features: ['All Professional features', 'Unlimited users', 'Unlimited leads', 'Priority support', 'Custom integrations']
    }
};

/**
 * Get available plans
 */
async function getPlans() {
    return Object.values(PLANS);
}

/**
 * Get the current organization's billing info
 * Pulls from org metadata and computes usage.
 */
async function getBillingInfo(organizationId) {
    const [userCount, leadCount] = await Promise.all([
        User.countDocuments({ organizationId, isActive: true }),
        Lead.countDocuments({ organizationId })
    ]);

    // Default to free plan — org plan stored in Organization model if exists
    const currentPlan = 'free';

    return {
        plan: PLANS[currentPlan] || PLANS.free,
        usage: {
            users: userCount,
            leads: leadCount,
            storageUsed: '0MB' // TODO: Compute from uploads
        },
        billing: {
            status: 'active',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            paymentMethod: null,
            invoices: []
        }
    };
}

/**
 * Upgrade plan — requires payment gateway
 */
async function upgradePlan(organizationId, planId) {
    if (!PLANS[planId]) {
        throw new AppError('Invalid plan', 400, 'INVALID_PLAN');
    }

    // Payment gateway not configured
    throw new AppError(
        'Payment processing is not yet configured. Please contact support to upgrade your plan.',
        501,
        'PAYMENT_NOT_CONFIGURED'
    );
}

/**
 * Update payment method — requires payment gateway
 */
async function updatePaymentMethod(organizationId, paymentData) {
    throw new AppError(
        'Payment processing is not yet configured. Please contact support.',
        501,
        'PAYMENT_NOT_CONFIGURED'
    );
}

/**
 * Get invoices — requires payment gateway  
 */
async function getInvoices(organizationId) {
    // Return empty list until payment gateway is configured
    return {
        invoices: [],
        message: 'Invoice history will be available once billing is configured.'
    };
}

/**
 * Cancel subscription — requires payment gateway
 */
async function cancelSubscription(organizationId) {
    throw new AppError(
        'Subscription management is not yet configured. Please contact support.',
        501,
        'PAYMENT_NOT_CONFIGURED'
    );
}

module.exports = {
    getPlans,
    getBillingInfo,
    upgradePlan,
    updatePaymentMethod,
    getInvoices,
    cancelSubscription
};
