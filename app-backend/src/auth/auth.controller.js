/**
 * Auth Controller
 * HTTP handlers for authentication endpoints
 */

const authService = require('./auth.service');
const usersModel = require('../users/users.model');
const { notifyOwnerOfNewAgent } = require('../services/email.service');

/**
 * POST /auth/register
 * Register a new agent (requires owner approval in DB mode, auto-approved in memory mode)
 * If createdByOwner is true, the agent is auto-approved
 */
async function register(request, reply) {
    try {
        const { email, password, name, phone, role, createdByOwner } = request.body;

        // Validation
        if (!email || !password || !name) {
            return reply.code(400).send({
                success: false,
                message: 'Email, password, and name are required'
            });
        }

        // Validate role - only allow certain roles for registration
        const allowedRoles = ['agent', 'admin'];
        const userRole = allowedRoles.includes(role) ? role : 'agent';

        // Check if user already exists
        const existingUser = await usersModel.findByEmail(email);
        if (existingUser) {
            return reply.code(409).send({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Determine if we're in database mode or fallback mode
        const isDbMode = usersModel.useDatabase();
        
        // SECURITY FIX: Validate createdByOwner from JWT, not just request body
        // Only auto-approve if the requester is actually an owner/admin
        let autoApprove = false;
        if (createdByOwner === true) {
            // Check if there's a valid JWT token with owner/admin role
            const authHeader = request.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                try {
                    const { verifyToken } = require('./jwt');
                    const token = authHeader.substring(7);
                    const decoded = verifyToken(token);
                    // Only auto-approve if the requester is owner or admin
                    if (decoded && (decoded.role === 'owner' || decoded.role === 'admin')) {
                        autoApprove = true;
                        console.log(`✅ Agent creation auto-approved by ${decoded.role}: ${decoded.email}`);
                    } else {
                        console.log(`⚠️ createdByOwner flag ignored - requester role is: ${decoded?.role || 'unknown'}`);
                    }
                } catch (tokenErr) {
                    console.log('⚠️ createdByOwner flag ignored - invalid/missing auth token');
                }
            } else {
                console.log('⚠️ createdByOwner flag ignored - no auth header provided');
            }
        }
        
        // Create new user - requires admin approval unless created by owner
        const newUser = await usersModel.createUser({
            email: email.toLowerCase(),
            password,
            name,
            phone,
            role: userRole,
            // Auto-approve if created by owner, otherwise pending
            isActive: autoApprove,
            approvalStatus: autoApprove ? 'approved' : 'pending'
        });

        // In database mode, notify owners only if NOT created by owner (self-registration)
        if (isDbMode && !autoApprove) {
            try {
                const User = require('../models/User');
                const owners = await User.find({ 
                    role: 'owner', 
                    isActive: true,
                    approvalStatus: 'approved'
                });

                for (const owner of owners) {
                    try {
                        await notifyOwnerOfNewAgent(owner.email, {
                            email: newUser.email,
                            name: newUser.name,
                            phone: newUser.phone
                        });
                    } catch (emailError) {
                        console.error(`Failed to notify owner ${owner.email}:`, emailError);
                    }
                }
            } catch (err) {
                console.error('Error notifying owners:', err);
            }
        }

        const statusMsg = autoApprove ? 'auto-approved by owner' : (isDbMode ? 'pending approval' : 'auto-approved');
        console.log(`✅ New user registered: ${email} (${statusMsg})`);

        let message;
        if (autoApprove) {
            message = 'Agent created successfully! They can now log in.';
        } else if (isDbMode) {
            message = 'Registration successful! Your account is pending approval from the owner.';
        } else {
            message = 'Registration successful! You can now log in.';
        }

        return reply.code(201).send({
            success: true,
            message,
            data: {
                id: newUser._id || newUser.id,
                email: newUser.email,
                name: newUser.name,
                approvalStatus: newUser.approvalStatus
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        return reply.code(500).send({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
}

/**
 * POST /auth/login
 */
async function login(request, reply) {
    const { email, password } = request.body;
    
    // Get IP address and user agent for login tracking
    const ipAddress = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';

    const result = await authService.login(email, password, ipAddress, userAgent);

    return reply.code(200).send(result);
}

/**
 * POST /auth/refresh
 */
async function refresh(request, reply) {
    const { refreshToken } = request.body;

    const result = await authService.refresh(refreshToken);

    return reply.code(200).send(result);
}

/**
 * POST /auth/logout
 */
async function logout(request, reply) {
    const { refreshToken } = request.body;
    
    // Record logout in history
    try {
        const LoginHistory = require('../models/LoginHistory');
        if (refreshToken) {
            const sessionId = refreshToken.substring(0, 32);
            // Find the session by session ID (we need userId from token)
            const { verifyToken } = require('./jwt');
            const decoded = verifyToken(refreshToken);
            if (decoded && decoded.userId) {
                await LoginHistory.recordLogout(decoded.userId, sessionId);
            }
        }
    } catch (err) {
        console.error('Failed to record logout:', err);
        // Don't fail logout if this fails
    }

    const result = await authService.logout(refreshToken);

    return reply.code(200).send(result);
}

module.exports = {
    register,
    login,
    refresh,
    logout
};
