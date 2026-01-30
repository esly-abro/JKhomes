/**
 * Authentication Middleware
 * JWT verification and user context injection
 */

const { verifyToken } = require('../auth/jwt');
const usersModel = require('../users/users.model');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Require authentication middleware
 * Verifies JWT and attaches user to request
 */
async function requireAuth(request, reply) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = verifyToken(token);

    // Get user
    const user = await usersModel.findById(decoded.userId);
    if (!user) {
        throw new UnauthorizedError('User not found');
    }

    // Attach safe user to request
    request.user = usersModel.getSafeUser(user);
}

module.exports = requireAuth;
