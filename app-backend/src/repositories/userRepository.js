/**
 * User Repository
 * Database access layer for User/Agent operations
 */

const User = require('../models/User');
const { DatabaseError } = require('../errors/AppError');
const logger = require('../utils/logger');

class UserRepository {
    /**
     * Create a new user
     * @param {Object} userData - User data
     * @returns {Promise<Object>} Created user
     */
    async create(userData) {
        try {
            const user = new User(userData);
            await user.save();
            
            // Return without password
            const userObj = user.toObject();
            delete userObj.password;
            return userObj;
        } catch (error) {
            logger.error('Repository: Failed to create user', { error: error.message });
            throw new DatabaseError('create user', error);
        }
    }

    /**
     * Find user by ID
     * @param {string} id - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Object|null>} User or null
     */
    async findById(id, options = {}) {
        try {
            let query = User.findById(id);
            
            if (!options.includePassword) {
                query = query.select('-password');
            }
            
            if (options.populate) {
                query = query.populate(options.populate);
            }
            
            const user = await query.lean();
            return user;
        } catch (error) {
            if (error.name === 'CastError') {
                return null;
            }
            throw new DatabaseError('find user', error);
        }
    }

    /**
     * Find user by email
     * @param {string} email - Email address
     * @param {Object} options - Query options
     * @returns {Promise<Object|null>} User or null
     */
    async findByEmail(email, options = {}) {
        try {
            let query = User.findOne({ email: email.toLowerCase() });
            
            if (!options.includePassword) {
                query = query.select('-password');
            }
            
            const user = await query.lean();
            return user;
        } catch (error) {
            throw new DatabaseError('find user by email', error);
        }
    }

    /**
     * Find user by email with password (for authentication)
     * @param {string} email - Email address
     * @returns {Promise<Object|null>} User with password or null
     */
    async findByEmailForAuth(email) {
        try {
            const user = await User.findOne({ 
                email: email.toLowerCase() 
            }).select('+password').lean();
            return user;
        } catch (error) {
            throw new DatabaseError('find user for auth', error);
        }
    }

    /**
     * Find users with filters and pagination
     * @param {Object} filter - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of users
     */
    async findMany(filter = {}, options = {}) {
        try {
            const {
                skip = 0,
                limit = 20,
                sort = { createdAt: -1 },
                select = '-password'
            } = options;

            const users = await User.find(filter)
                .select(select)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean();
            
            return users;
        } catch (error) {
            throw new DatabaseError('find users', error);
        }
    }

    /**
     * Count users with filters
     * @param {Object} filter - Query filters
     * @returns {Promise<number>} Count
     */
    async count(filter = {}) {
        try {
            return await User.countDocuments(filter);
        } catch (error) {
            throw new DatabaseError('count users', error);
        }
    }

    /**
     * Find and count (for pagination)
     * @param {Object} filter - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Object>} { data, total }
     */
    async findAndCount(filter = {}, options = {}) {
        try {
            const [data, total] = await Promise.all([
                this.findMany(filter, options),
                this.count(filter)
            ]);
            return { data, total };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Update user by ID
     * @param {string} id - User ID
     * @param {Object} updates - Fields to update
     * @param {Object} options - Update options
     * @returns {Promise<Object|null>} Updated user
     */
    async update(id, updates, options = {}) {
        try {
            const user = await User.findByIdAndUpdate(
                id,
                { $set: updates, updatedAt: new Date() },
                { new: true, runValidators: true, ...options }
            ).select('-password').lean();
            
            return user;
        } catch (error) {
            throw new DatabaseError('update user', error);
        }
    }

    /**
     * Update user password
     * @param {string} id - User ID
     * @param {string} hashedPassword - New hashed password
     * @returns {Promise<boolean>} Success
     */
    async updatePassword(id, hashedPassword) {
        try {
            const result = await User.findByIdAndUpdate(
                id,
                { password: hashedPassword, updatedAt: new Date() }
            );
            return !!result;
        } catch (error) {
            throw new DatabaseError('update password', error);
        }
    }

    /**
     * Delete user by ID
     * @param {string} id - User ID
     * @returns {Promise<boolean>} Success
     */
    async delete(id) {
        try {
            const result = await User.findByIdAndDelete(id);
            return !!result;
        } catch (error) {
            throw new DatabaseError('delete user', error);
        }
    }

    /**
     * Find active agents
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Active agents
     */
    async findActiveAgents(options = {}) {
        try {
            const filter = { role: { $in: ['agent', 'manager'] }, status: 'active' };
            if (options.organizationId) filter.organizationId = options.organizationId;
            return await this.findMany(
                filter,
                options
            );
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find users by role
     * @param {string} role - User role
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Users
     */
    async findByRole(role, options = {}) {
        try {
            return await this.findMany({ role }, options);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Check if email exists
     * @param {string} email - Email to check
     * @param {string} excludeId - ID to exclude from check
     * @returns {Promise<boolean>} Whether email exists
     */
    async emailExists(email, excludeId = null) {
        try {
            const filter = { email: email.toLowerCase() };
            if (excludeId) {
                filter._id = { $ne: excludeId };
            }
            const count = await User.countDocuments(filter);
            return count > 0;
        } catch (error) {
            throw new DatabaseError('check email exists', error);
        }
    }

    /**
     * Get user statistics
     * @returns {Promise<Object>} Statistics
     */
    async getStats(organizationId = null) {
        try {
            const pipeline = [];
            
            // Scope to organization if provided
            if (organizationId) {
                pipeline.push({ $match: { organizationId } });
            }
            
            pipeline.push({
                    $group: {
                        _id: { role: '$role', status: '$status' },
                        count: { $sum: 1 }
                    }
            });

            const results = await User.aggregate(pipeline);
            
            const stats = {
                total: 0,
                byRole: {},
                byStatus: {}
            };
            
            results.forEach(item => {
                const { role, status } = item._id;
                
                if (!stats.byRole[role]) stats.byRole[role] = 0;
                stats.byRole[role] += item.count;
                
                if (!stats.byStatus[status]) stats.byStatus[status] = 0;
                stats.byStatus[status] += item.count;
                
                stats.total += item.count;
            });
            
            return stats;
        } catch (error) {
            throw new DatabaseError('get user stats', error);
        }
    }

    /**
     * Update last login
     * @param {string} id - User ID
     * @returns {Promise<boolean>} Success
     */
    async updateLastLogin(id) {
        try {
            const result = await User.findByIdAndUpdate(id, {
                lastLoginAt: new Date()
            });
            return !!result;
        } catch (error) {
            throw new DatabaseError('update last login', error);
        }
    }

    /**
     * Search users
     * @param {string} query - Search query
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Matching users
     */
    async search(query, options = {}) {
        try {
            const searchRegex = new RegExp(query, 'i');
            const filter = {
                $or: [
                    { name: searchRegex },
                    { email: searchRegex },
                    { phone: searchRegex }
                ]
            };
            
            // Scope to organization if provided
            if (options.organizationId) {
                filter.organizationId = options.organizationId;
            }
            
            return await this.findMany(filter, options);
        } catch (error) {
            throw new DatabaseError('search users', error);
        }
    }
}

module.exports = new UserRepository();
