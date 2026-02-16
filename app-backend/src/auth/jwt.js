/**
 * JWT Utilities
 * Token generation and verification
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Generate access token (short-lived)
 */
function generateAccessToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.accessExpiry
    });
}

/**
 * Generate refresh token (long-lived)
 */
function generateRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.refreshExpiry
    });
}

/**
 * Verify and decode token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, config.jwt.secret);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            throw new UnauthorizedError('Token expired');
        }
        throw new UnauthorizedError('Invalid token');
    }
}

/**
 * Generate token pair (access + refresh)
 */
function generateTokenPair(user) {
    const payload = {
        userId: user._id?.toString() || user.id, // Support both MongoDB _id and plain id
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId?.toString() || null
    };

    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload)
    };
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    generateTokenPair
};
