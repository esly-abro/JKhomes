/**
 * Organization Scoping Middleware
 * Ensures every authenticated request has a valid organizationId.
 * Injects request.organizationId for mandatory downstream use.
 * 
 * Must be used AFTER requireAuth so request.user is available.
 */

const { ForbiddenError } = require('../utils/errors');

/**
 * Require organization context.
 * Rejects requests where the user has no organizationId (null / undefined).
 * Injects request.organizationId as a convenience shortcut.
 */
async function requireOrg(request, reply) {
    if (!request.user) {
        throw new ForbiddenError('Authentication required before organization check');
    }

    const orgId = request.user.organizationId;

    if (!orgId) {
        throw new ForbiddenError(
            'Your account is not associated with any organization. Please contact your administrator.'
        );
    }

    // Inject convenience property — controllers should use this
    request.organizationId = orgId.toString();
}

module.exports = requireOrg;
