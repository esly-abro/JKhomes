/**
 * Auth Controller
 * HTTP handlers for authentication endpoints
 */

const authService = require('./auth.service');
const usersModel = require('../users/users.model');
const { notifyOwnerOfNewAgent, sendAgentCredentials } = require('../services/email.service');

/**
 * POST /auth/register-organization
 * Register a new organization with an owner account
 */
async function registerOrganization(request, reply) {
    try {
        const { organizationName, industry, catalogModuleLabel, categoryFieldLabel, appointmentFieldLabel, name, email, password, phone } = request.body;

        // Validation
        if (!organizationName || !name || !email || !password) {
            return reply.code(400).send({
                success: false,
                message: 'Organization name, name, email, and password are required'
            });
        }

        // Validate industry
        const validIndustries = ['real_estate', 'saas', 'healthcare', 'education', 'insurance', 'automotive', 'finance', 'generic'];
        const selectedIndustry = validIndustries.includes(industry) ? industry : 'generic';

        // Check if user already exists
        const existingUser = await usersModel.findByEmail(email);
        if (existingUser) {
            return reply.code(409).send({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Check if we're in database mode
        const isDbMode = usersModel.useDatabase();
        if (!isDbMode) {
            return reply.code(503).send({
                success: false,
                message: 'Organization registration requires database mode'
            });
        }

        // Import models (only needed in DB mode)
        const User = require('../models/User');
        const Organization = require('../models/organization.model');
        const TenantConfig = require('../models/tenantConfig.model');
        const bcrypt = require('bcrypt');

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create owner user first (organization requires ownerId)
        const user = new User({
            email: email.toLowerCase(),
            passwordHash,
            name,
            phone,
            role: 'owner',
            isActive: true,
            approvalStatus: 'approved'
        });
        await user.save();

        console.log(`✅ Owner user created: ${email} (${user._id})`);

        // Create organization with owner
        const organization = new Organization({
            name: organizationName,
            ownerId: user._id,
            isActive: true
        });
        await organization.save();

        console.log(`✅ Organization created: ${organizationName} (${organization._id})`);

        // Link user to organization
        user.organizationId = organization._id;
        await user.save();

        // Create tenant config with selected industry and custom labels
        const defaultConfig = new TenantConfig({
            organizationId: organization._id,
            industry: selectedIndustry,
            // Set field labels: use custom if provided, otherwise use industry defaults
            catalogModuleLabel: catalogModuleLabel || TenantConfig.getDefaultCatalogModuleLabel(selectedIndustry),
            categoryFieldLabel: categoryFieldLabel || TenantConfig.getDefaultCategoryFieldLabel(selectedIndustry),
            appointmentFieldLabel: appointmentFieldLabel || TenantConfig.getDefaultAppointmentFieldLabel(selectedIndustry)
        });

        await defaultConfig.save();

        console.log(`✅ Tenant config created for ${organization._id} with industry: ${selectedIndustry}`);

        return reply.code(201).send({
            success: true,
            message: 'Organization registered successfully! You can now log in.',
            data: {
                organizationId: organization._id,
                userId: user._id,
                email: user.email,
                name: user.name,
                organizationName: organization.name,
                industry: selectedIndustry
            }
        });
    } catch (error) {
        console.error('Register organization error:', error);
        return reply.code(500).send({
            success: false,
            message: 'Organization registration failed. Please try again.'
        });
    }
}

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
        
        // Determine organizationId from the requesting user's JWT token
        let organizationId = null;
        const authHeader2 = request.headers.authorization;
        if (authHeader2 && authHeader2.startsWith('Bearer ')) {
            try {
                const { verifyToken: vt } = require('./jwt');
                const decoded2 = vt(authHeader2.substring(7));
                organizationId = decoded2?.organizationId || null;
            } catch (_e) { /* ignore */ }
        }

        // Create new user - requires admin approval unless created by owner
        const newUser = await usersModel.createUser({
            email: email.toLowerCase(),
            password,
            name,
            phone,
            role: userRole,
            organizationId,
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
                    approvalStatus: 'approved',
                    organizationId: organizationId
                });

                const notificationService = require('../services/notification.service');
                for (const owner of owners) {
                    try {
                        await notifyOwnerOfNewAgent(owner.email, {
                            email: newUser.email,
                            name: newUser.name,
                            phone: newUser.phone
                        }, organizationId);
                        // In-app bell notification for owner
                        await notificationService.create({
                            userId: owner._id,
                            organizationId,
                            type: 'agent_registered',
                            title: 'New agent registered',
                            message: `${newUser.name || newUser.email} has registered and is pending approval`,
                            avatarFallback: (newUser.name || newUser.email).charAt(0).toUpperCase(),
                            data: { agentId: newUser._id, agentEmail: newUser.email }
                        });
                    } catch (emailError) {
                        console.error(`Failed to notify owner ${owner.email}:`, emailError);
                    }
                }
            } catch (err) {
                console.error('Error notifying owners:', err);
            }
        }

        // If created by owner, send credentials email to the new agent
        if (autoApprove && isDbMode) {
            try {
                // Get owner name from JWT
                let ownerName = 'Your manager';
                const authHeader3 = request.headers.authorization;
                if (authHeader3 && authHeader3.startsWith('Bearer ')) {
                    try {
                        const { verifyToken: vt3 } = require('./jwt');
                        const decoded3 = vt3(authHeader3.substring(7));
                        ownerName = decoded3?.name || 'Your manager';
                    } catch (_e) { /* ignore */ }
                }
                await sendAgentCredentials(email.toLowerCase(), name, password, ownerName, organizationId);
            } catch (emailError) {
                console.error(`Failed to send credentials email to ${email}:`, emailError);
                // Don't fail the creation if email fails
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
    
    // Record logout in history + mark offline + attendance check-out
    try {
        const LoginHistory = require('../models/LoginHistory');
        const User = require('../models/User');
        const Attendance = require('../models/Attendance');
        if (refreshToken) {
            const sessionId = refreshToken.substring(0, 32);
            const { verifyToken } = require('./jwt');
            const decoded = verifyToken(refreshToken);
            if (decoded && decoded.userId) {
                await LoginHistory.recordLogout(decoded.userId, sessionId);
                // Mark user offline (SSE disconnect will also handle this,
                // but explicit logout should be immediate, not wait for grace period)
                await User.findByIdAndUpdate(decoded.userId, { isOnline: false, lastHeartbeat: null });
                await Attendance.checkOut(decoded.userId, 'manual');
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
    registerOrganization,
    register,
    login,
    refresh,
    logout
};
