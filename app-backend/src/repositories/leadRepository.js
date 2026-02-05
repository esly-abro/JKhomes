/**
 * Lead Repository
 * Database access layer for Lead operations
 */

const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const { DatabaseError } = require('../errors/AppError');
const logger = require('../utils/logger');

class LeadRepository {
    /**
     * Create a new lead
     * @param {Object} leadData - Lead data
     * @returns {Promise<Object>} Created lead
     */
    async create(leadData) {
        try {
            const lead = new Lead(leadData);
            await lead.save();
            return lead.toObject();
        } catch (error) {
            logger.error('Repository: Failed to create lead', { error: error.message });
            throw new DatabaseError('create lead', error);
        }
    }

    /**
     * Find lead by ID
     * @param {string} id - Lead ID
     * @param {Object} options - Query options
     * @returns {Promise<Object|null>} Lead or null
     */
    async findById(id, options = {}) {
        try {
            let query = Lead.findById(id);
            
            if (options.populate) {
                query = query.populate(options.populate);
            }
            
            if (options.select) {
                query = query.select(options.select);
            }
            
            const lead = await query.lean();
            return lead;
        } catch (error) {
            if (error.name === 'CastError') {
                return null;
            }
            logger.error('Repository: Failed to find lead by ID', { id, error: error.message });
            throw new DatabaseError('find lead', error);
        }
    }

    /**
     * Find leads with filters and pagination
     * @param {Object} filter - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of leads
     */
    async findMany(filter = {}, options = {}) {
        try {
            const {
                skip = 0,
                limit = 20,
                sort = { createdAt: -1 },
                populate,
                select
            } = options;

            let query = Lead.find(filter);
            
            if (populate) {
                query = query.populate(populate);
            }
            
            if (select) {
                query = query.select(select);
            }
            
            const leads = await query
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean();
            
            return leads;
        } catch (error) {
            logger.error('Repository: Failed to find leads', { error: error.message });
            throw new DatabaseError('find leads', error);
        }
    }

    /**
     * Count leads with filters
     * @param {Object} filter - Query filters
     * @returns {Promise<number>} Count
     */
    async count(filter = {}) {
        try {
            return await Lead.countDocuments(filter);
        } catch (error) {
            logger.error('Repository: Failed to count leads', { error: error.message });
            throw new DatabaseError('count leads', error);
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
     * Update lead by ID
     * @param {string} id - Lead ID
     * @param {Object} updates - Fields to update
     * @param {Object} options - Update options
     * @returns {Promise<Object|null>} Updated lead
     */
    async update(id, updates, options = {}) {
        try {
            const lead = await Lead.findByIdAndUpdate(
                id,
                { $set: updates, updatedAt: new Date() },
                { new: true, runValidators: true, ...options }
            ).lean();
            
            return lead;
        } catch (error) {
            logger.error('Repository: Failed to update lead', { id, error: error.message });
            throw new DatabaseError('update lead', error);
        }
    }

    /**
     * Delete lead by ID
     * @param {string} id - Lead ID
     * @returns {Promise<boolean>} Success
     */
    async delete(id) {
        try {
            const result = await Lead.findByIdAndDelete(id);
            return !!result;
        } catch (error) {
            logger.error('Repository: Failed to delete lead', { id, error: error.message });
            throw new DatabaseError('delete lead', error);
        }
    }

    /**
     * Soft delete lead
     * @param {string} id - Lead ID
     * @returns {Promise<Object|null>} Updated lead
     */
    async softDelete(id) {
        try {
            return await this.update(id, { 
                isDeleted: true, 
                deletedAt: new Date() 
            });
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find lead by phone
     * @param {string} phone - Phone number
     * @returns {Promise<Object|null>} Lead or null
     */
    async findByPhone(phone) {
        try {
            const lead = await Lead.findOne({ 
                phone: { $regex: phone.replace(/[^0-9]/g, ''), $options: 'i' }
            }).lean();
            return lead;
        } catch (error) {
            logger.error('Repository: Failed to find lead by phone', { error: error.message });
            throw new DatabaseError('find lead by phone', error);
        }
    }

    /**
     * Find lead by email
     * @param {string} email - Email address
     * @returns {Promise<Object|null>} Lead or null
     */
    async findByEmail(email) {
        try {
            const lead = await Lead.findOne({ 
                email: email.toLowerCase() 
            }).lean();
            return lead;
        } catch (error) {
            throw new DatabaseError('find lead by email', error);
        }
    }

    /**
     * Find leads by agent ID
     * @param {string} agentId - Agent ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of leads
     */
    async findByAgentId(agentId, options = {}) {
        try {
            return await this.findMany({ assignedTo: agentId }, options);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find leads by status
     * @param {string} status - Lead status
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of leads
     */
    async findByStatus(status, options = {}) {
        try {
            return await this.findMany({ status }, options);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get lead statistics
     * @param {Object} filter - Optional filter
     * @returns {Promise<Object>} Statistics
     */
    async getStats(filter = {}) {
        try {
            const pipeline = [
                { $match: filter },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ];

            const results = await Lead.aggregate(pipeline);
            
            const stats = {
                total: 0,
                byStatus: {}
            };
            
            results.forEach(item => {
                stats.byStatus[item._id] = item.count;
                stats.total += item.count;
            });
            
            return stats;
        } catch (error) {
            logger.error('Repository: Failed to get lead stats', { error: error.message });
            throw new DatabaseError('get lead stats', error);
        }
    }

    /**
     * Search leads
     * @param {string} query - Search query
     * @param {Object} options - Search options
     * @returns {Promise<Array>} Matching leads
     */
    async search(query, options = {}) {
        try {
            const searchRegex = new RegExp(query, 'i');
            const filter = {
                $or: [
                    { name: searchRegex },
                    { phone: searchRegex },
                    { email: searchRegex },
                    { notes: searchRegex }
                ]
            };
            
            return await this.findMany(filter, options);
        } catch (error) {
            throw new DatabaseError('search leads', error);
        }
    }

    /**
     * Bulk update leads
     * @param {Array} ids - Array of lead IDs
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Update result
     */
    async bulkUpdate(ids, updates) {
        try {
            const result = await Lead.updateMany(
                { _id: { $in: ids } },
                { $set: updates, updatedAt: new Date() }
            );
            return result;
        } catch (error) {
            throw new DatabaseError('bulk update leads', error);
        }
    }

    /**
     * Get leads created in date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Leads
     */
    async findByDateRange(startDate, endDate, options = {}) {
        try {
            const filter = {
                createdAt: {
                    $gte: startDate,
                    $lte: endDate
                }
            };
            return await this.findMany(filter, options);
        } catch (error) {
            throw new DatabaseError('find leads by date range', error);
        }
    }

    /**
     * Get daily lead counts
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Array>} Daily counts
     */
    async getDailyCounts(startDate, endDate) {
        try {
            const pipeline = [
                {
                    $match: {
                        createdAt: { $gte: startDate, $lte: endDate }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ];
            
            return await Lead.aggregate(pipeline);
        } catch (error) {
            throw new DatabaseError('get daily lead counts', error);
        }
    }
}

module.exports = new LeadRepository();
