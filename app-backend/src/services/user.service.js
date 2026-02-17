/**
 * User Service
 * Business logic layer for User/Agent operations
 * Uses repository for data access
 */

const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');
const { NotFoundError, ValidationError, ConflictError, UnauthorizedError } = require('../errors/AppError');
const logger = require('../utils/logger');
const { USER_ROLES, USER_STATUSES, ROLE_HIERARCHY } = require('../constants');

const SALT_ROUNDS = 12;

class UserService {
    /**
     * Get paginated users with filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} { data, pagination }
     */
    async getUsers(params = {}) {
        const {
            page = 1,
            limit = 20,
            role,
            status,
            search,
            organizationId,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = params;

        // Build filter
        const filter = {};
        
        if (role) filter.role = role;
        if (status) filter.status = status;
        if (organizationId) filter.organizationId = organizationId;

        // Build options
        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
        
        const options = {
            skip,
            limit: parseInt(limit),
            sort
        };

        // Search handling
        if (search) {
            const searchResults = await userRepository.search(search, { ...options, organizationId });
            const total = await userRepository.count(filter);
            
            return {
                data: searchResults,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            };
        }

        const { data, total } = await userRepository.findAndCount(filter, options);

        return {
            data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    /**
     * Get user by ID
     * @param {string} id - User ID
     * @returns {Promise<Object>} User
     */
    async getUserById(id) {
        const user = await userRepository.findById(id);
        
        if (!user) {
            throw new NotFoundError('User');
        }
        
        return user;
    }

    /**
     * Get user by email
     * @param {string} email - Email address
     * @returns {Promise<Object|null>} User or null
     */
    async getUserByEmail(email) {
        return await userRepository.findByEmail(email);
    }

    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    async createUser(userData) {
        // Check for duplicate email
        const existingUser = await userRepository.findByEmail(userData.email);
        if (existingUser) {
            throw new ConflictError('User with this email already exists');
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(userData.password, SALT_ROUNDS);

        // Set defaults
        const user = {
            ...userData,
            password: hashedPassword,
            role: userData.role || USER_ROLES.AGENT,
            status: userData.status || USER_STATUSES.PENDING
        };

        const createdUser = await userRepository.create(user);
        
        logger.info('User created', { 
            userId: createdUser._id, 
            email: user.email,
            role: user.role 
        });
        
        return createdUser;
    }

    /**
     * Update user
     * @param {string} id - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated user
     */
    async updateUser(id, updates) {
        await this.getUserById(id); // Verify exists
        
        // Check for duplicate email if updating
        if (updates.email) {
            const exists = await userRepository.emailExists(updates.email, id);
            if (exists) {
                throw new ConflictError('User with this email already exists');
            }
        }

        // Don't allow password update through this method
        delete updates.password;

        const updatedUser = await userRepository.update(id, updates);

        logger.info('User updated', { userId: id, updates: Object.keys(updates) });
        
        return updatedUser;
    }

    /**
     * Update user password
     * @param {string} id - User ID
     * @param {string} currentPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<boolean>} Success
     */
    async updatePassword(id, currentPassword, newPassword) {
        const user = await userRepository.findByEmailForAuth(
            (await this.getUserById(id)).email
        );
        
        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            throw new UnauthorizedError('Current password is incorrect');
        }

        // Hash and update new password
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await userRepository.updatePassword(id, hashedPassword);

        logger.info('User password updated', { userId: id });
        
        return true;
    }

    /**
     * Reset user password (admin function)
     * @param {string} id - User ID
     * @param {string} newPassword - New password
     * @returns {Promise<boolean>} Success
     */
    async resetPassword(id, newPassword) {
        await this.getUserById(id); // Verify exists
        
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await userRepository.updatePassword(id, hashedPassword);

        logger.info('User password reset by admin', { userId: id });
        
        return true;
    }

    /**
     * Delete user
     * @param {string} id - User ID
     * @returns {Promise<boolean>} Success
     */
    async deleteUser(id) {
        await this.getUserById(id); // Verify exists
        
        await userRepository.delete(id);
        
        logger.info('User deleted', { userId: id });
        
        return true;
    }

    /**
     * Authenticate user
     * @param {string} email - Email address
     * @param {string} password - Password
     * @returns {Promise<Object>} User (without password)
     */
    async authenticate(email, password) {
        const user = await userRepository.findByEmailForAuth(email);
        
        if (!user) {
            throw new UnauthorizedError('Invalid email or password');
        }

        if (user.status !== USER_STATUSES.ACTIVE) {
            throw new UnauthorizedError('Account is not active');
        }

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            throw new UnauthorizedError('Invalid email or password');
        }

        // Update last login
        await userRepository.updateLastLogin(user._id);

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        logger.info('User authenticated', { userId: user._id, email });
        
        return userWithoutPassword;
    }

    /**
     * Approve pending user
     * @param {string} id - User ID
     * @param {Object} approvedBy - Admin approving
     * @returns {Promise<Object>} Updated user
     */
    async approveUser(id, approvedBy = null) {
        const user = await this.getUserById(id);
        
        if (user.status !== USER_STATUSES.PENDING) {
            throw new ValidationError('User is not in pending status');
        }

        const updatedUser = await userRepository.update(id, {
            status: USER_STATUSES.ACTIVE,
            approvedAt: new Date(),
            approvedBy: approvedBy?._id || approvedBy
        });

        logger.info('User approved', { 
            userId: id, 
            approvedBy: approvedBy?._id 
        });
        
        return updatedUser;
    }

    /**
     * Suspend user
     * @param {string} id - User ID
     * @param {string} reason - Suspension reason
     * @returns {Promise<Object>} Updated user
     */
    async suspendUser(id, reason = '') {
        const user = await this.getUserById(id);
        
        if (user.role === USER_ROLES.ADMIN) {
            throw new ValidationError('Cannot suspend admin users');
        }

        const updatedUser = await userRepository.update(id, {
            status: USER_STATUSES.SUSPENDED,
            suspendedAt: new Date(),
            suspensionReason: reason
        });

        logger.info('User suspended', { userId: id, reason });
        
        return updatedUser;
    }

    /**
     * Update user role
     * @param {string} id - User ID
     * @param {string} newRole - New role
     * @param {Object} updatedBy - User making the change
     * @returns {Promise<Object>} Updated user
     */
    async updateRole(id, newRole, updatedBy = null) {
        if (!Object.values(USER_ROLES).includes(newRole)) {
            throw new ValidationError(`Invalid role: ${newRole}`);
        }

        // Check permission hierarchy
        if (updatedBy) {
            const updaterRole = updatedBy.role;
            if (ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY[updaterRole]) {
                throw new ValidationError('Cannot assign role equal to or higher than your own');
            }
        }

        const updatedUser = await userRepository.update(id, { role: newRole });

        logger.info('User role updated', { 
            userId: id, 
            newRole,
            updatedBy: updatedBy?._id 
        });
        
        return updatedUser;
    }

    /**
     * Get active agents
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Active agents
     */
    async getActiveAgents(options = {}) {
        return await userRepository.findActiveAgents(options);
    }

    /**
     * Get pending users
     * @param {Object} options - Query options (includes organizationId)
     * @returns {Promise<Array>} Pending users
     */
    async getPendingUsers(options = {}) {
        const filter = { status: USER_STATUSES.PENDING };
        if (options.organizationId) filter.organizationId = options.organizationId;
        return await userRepository.findMany(
            filter,
            options
        );
    }

    /**
     * Get user statistics
     * @param {string} organizationId - Optional org scope
     * @returns {Promise<Object>} Statistics
     */
    async getStats(organizationId = null) {
        return await userRepository.getStats(organizationId);
    }

    /**
     * Check if email exists
     * @param {string} email - Email to check
     * @param {string} excludeId - ID to exclude
     * @returns {Promise<boolean>} Whether email exists
     */
    async emailExists(email, excludeId = null) {
        return await userRepository.emailExists(email, excludeId);
    }
}

module.exports = new UserService();
