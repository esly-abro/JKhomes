/**
 * Auth Service
 * Business logic for authentication
 */

const usersModel = require('../users/users.model');
const { generateTokenPair, verifyToken } = require('./jwt');
const { UnauthorizedError, ValidationError } = require('../utils/errors');

/**
 * Login user with email and password
 */
async function login(email, password, ipAddress, userAgent) {
    // Validate input
    if (!email || !password) {
        throw new ValidationError('Email and password are required');
    }

    // DEMO MODE: Allow specific demo accounts with any password
    const demoAccounts = ['owner@jkhomes.com', 'agent@jkhomes.com'];
    const isDemoLogin = demoAccounts.includes(email.toLowerCase());

    // Find user
    const user = await usersModel.findByEmail(email);
    if (!user) {
        throw new UnauthorizedError('Invalid email or password');
    }

    // Skip approval and active checks for demo accounts
    if (!isDemoLogin) {
        // Check if user is approved
        if (user.approvalStatus !== 'approved') {
            if (user.approvalStatus === 'pending') {
                throw new UnauthorizedError('Your account is pending approval from the owner');
            } else if (user.approvalStatus === 'rejected') {
                throw new UnauthorizedError('Your account registration was rejected');
            }
        }

        // Check if user account is active (not disabled)
        if (user.isActive === false) {
            throw new UnauthorizedError('Your account has been disabled. Please contact the administrator.');
        }

        // Verify password
        const isValidPassword = await usersModel.verifyPassword(password, user.passwordHash);
        if (!isValidPassword) {
            throw new UnauthorizedError('Invalid email or password');
        }
    } else {
        console.log(`🎭 DEMO LOGIN: ${email} logged in with demo bypass`);
    }

    // Update user's active status and last login time on successful login
    try {
        await usersModel.updateLastLogin(user._id || user.id);
    } catch (err) {
        console.error('Failed to update last login:', err);
        // Don't fail login if this fails
    }

    // Generate tokens
    const tokens = generateTokenPair(user);

    // Store refresh token with userId
    await usersModel.storeRefreshToken(tokens.refreshToken, user._id || user.id);

    // Record login history
    try {
        const LoginHistory = require('../models/LoginHistory');
        await LoginHistory.recordLogin(
            user._id || user.id,
            ipAddress || 'unknown',
            userAgent || 'unknown',
            tokens.refreshToken.substring(0, 32) // Use part of refresh token as session ID
        );
    } catch (err) {
        console.error('Failed to record login history:', err);
        // Don't fail login if this fails
    }

    return {
        ...tokens,
        user: usersModel.getSafeUser({ ...user, isActive: true })
    };
}

/**
 * Refresh access token using refresh token
 */
async function refresh(refreshToken) {
    if (!refreshToken) {
        throw new ValidationError('Refresh token is required');
    }

    // Verify token exists in store
    const hasToken = await usersModel.hasRefreshToken(refreshToken);
    if (!hasToken) {
        throw new UnauthorizedError('Invalid refresh token');
    }

    // Verify and decode token
    let decoded;
    try {
        decoded = verifyToken(refreshToken);
    } catch (error) {
        // Remove invalid token from store
        usersModel.removeRefreshToken(refreshToken);
        throw error;
    }

    // Get user
    const user = await usersModel.findById(decoded.userId);
    if (!user) {
        usersModel.removeRefreshToken(refreshToken);
        throw new UnauthorizedError('User not found');
    }

    // Generate new access token (keep same refresh token)
    const { accessToken } = generateTokenPair(user);

    return {
        accessToken
    };
}

/**
 * Logout user (invalidate refresh token and set user as inactive)
 */
async function logout(refreshToken) {
    if (refreshToken) {
        // Get user ID from token before removing it, and set them as inactive
        try {
            const decoded = verifyToken(refreshToken);
            if (decoded && decoded.userId) {
                await usersModel.setUserInactive(decoded.userId);
                console.log(`✅ User ${decoded.userId} set to inactive on logout`);
            }
        } catch (err) {
            // Token might be invalid/expired, continue with logout anyway
            console.log('Could not decode token for logout status update:', err.message);
        }
        usersModel.removeRefreshToken(refreshToken);
    }

    return { message: 'Logged out successfully' };
}

module.exports = {
    login,
    refresh,
    logout
};
