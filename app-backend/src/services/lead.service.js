/**
 * Lead Service (Refactored)
 * Business logic layer for Lead operations
 * Uses repository for data access
 */

const leadRepository = require('../repositories/leadRepository');
const { NotFoundError, ValidationError, ConflictError } = require('../errors/AppError');
const logger = require('../utils/logger');
const { LEAD_STATUSES, LEAD_STATUS_TRANSITIONS } = require('../constants');

class LeadService {
    /**
     * Get paginated leads with filters
     * @param {Object} params - Query parameters
     * @returns {Promise<Object>} { data, pagination }
     */
    async getLeads(params = {}) {
        const {
            page = 1,
            limit = 20,
            status,
            source,
            assignedTo,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            startDate,
            endDate
        } = params;

        // Build filter
        const filter = { isDeleted: { $ne: true } };
        
        if (status) filter.status = status;
        if (source) filter.source = source;
        if (assignedTo) filter.assignedTo = assignedTo;
        
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // Build options
        const skip = (page - 1) * limit;
        const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
        
        const options = {
            skip,
            limit: parseInt(limit),
            sort,
            populate: [
                { path: 'assignedTo', select: 'name email' }
            ]
        };

        // Search handling
        if (search) {
            const searchResults = await leadRepository.search(search, options);
            const total = await leadRepository.count(filter);
            
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

        const { data, total } = await leadRepository.findAndCount(filter, options);

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
     * Get lead by ID
     * @param {string} id - Lead ID
     * @returns {Promise<Object>} Lead
     */
    async getLeadById(id) {
        const lead = await leadRepository.findById(id, {
            populate: [
                { path: 'assignedTo', select: 'name email phone' }
            ]
        });
        
        if (!lead) {
            throw new NotFoundError('Lead');
        }
        
        return lead;
    }

    /**
     * Create a new lead
     * @param {Object} leadData - Lead data
     * @param {Object} createdBy - User creating the lead
     * @returns {Promise<Object>} Created lead
     */
    async createLead(leadData, createdBy = null) {
        // Check for duplicate phone
        if (leadData.phone) {
            const existingLead = await leadRepository.findByPhone(leadData.phone);
            if (existingLead) {
                throw new ConflictError('Lead with this phone number already exists');
            }
        }

        // Check for duplicate email
        if (leadData.email) {
            const existingLead = await leadRepository.findByEmail(leadData.email);
            if (existingLead) {
                throw new ConflictError('Lead with this email already exists');
            }
        }

        // Set defaults
        const lead = {
            ...leadData,
            status: leadData.status || LEAD_STATUSES.NEW,
            source: leadData.source || 'manual',
            createdBy: createdBy?._id || createdBy
        };

        const createdLead = await leadRepository.create(lead);
        
        logger.info('Lead created', { 
            leadId: createdLead._id, 
            phone: lead.phone,
            source: lead.source 
        });
        
        return createdLead;
    }

    /**
     * Update lead
     * @param {string} id - Lead ID
     * @param {Object} updates - Fields to update
     * @param {Object} updatedBy - User making the update
     * @returns {Promise<Object>} Updated lead
     */
    async updateLead(id, updates, updatedBy = null) {
        const existingLead = await this.getLeadById(id);
        
        // Check for duplicate phone if updating
        if (updates.phone && updates.phone !== existingLead.phone) {
            const duplicateLead = await leadRepository.findByPhone(updates.phone);
            if (duplicateLead && duplicateLead._id.toString() !== id) {
                throw new ConflictError('Lead with this phone number already exists');
            }
        }

        // Check for duplicate email if updating
        if (updates.email && updates.email !== existingLead.email) {
            const duplicateLead = await leadRepository.findByEmail(updates.email);
            if (duplicateLead && duplicateLead._id.toString() !== id) {
                throw new ConflictError('Lead with this email already exists');
            }
        }

        const updatedLead = await leadRepository.update(id, {
            ...updates,
            updatedBy: updatedBy?._id || updatedBy
        });

        logger.info('Lead updated', { leadId: id, updates: Object.keys(updates) });
        
        return updatedLead;
    }

    /**
     * Update lead status with validation
     * @param {string} id - Lead ID
     * @param {string} newStatus - New status
     * @param {Object} updatedBy - User making the update
     * @returns {Promise<Object>} Updated lead
     */
    async updateLeadStatus(id, newStatus, updatedBy = null) {
        const lead = await this.getLeadById(id);
        
        // Validate status transition
        const allowedTransitions = LEAD_STATUS_TRANSITIONS[lead.status] || [];
        if (!allowedTransitions.includes(newStatus) && lead.status !== newStatus) {
            throw new ValidationError(
                `Cannot transition from ${lead.status} to ${newStatus}. Allowed: ${allowedTransitions.join(', ')}`
            );
        }

        const previousStatus = lead.status;
        const updatedLead = await leadRepository.update(id, {
            status: newStatus,
            statusChangedAt: new Date(),
            updatedBy: updatedBy?._id || updatedBy
        });

        logger.info('Lead status updated', { 
            leadId: id, 
            previousStatus, 
            newStatus 
        });

        return updatedLead;
    }

    /**
     * Assign lead to agent
     * @param {string} leadId - Lead ID
     * @param {string} agentId - Agent ID
     * @param {Object} assignedBy - User making assignment
     * @returns {Promise<Object>} Updated lead
     */
    async assignLead(leadId, agentId, assignedBy = null) {
        const lead = await this.getLeadById(leadId);
        
        const previousAgent = lead.assignedTo;
        const updatedLead = await leadRepository.update(leadId, {
            assignedTo: agentId,
            assignedAt: new Date(),
            assignedBy: assignedBy?._id || assignedBy
        });

        logger.info('Lead assigned', {
            leadId,
            previousAgent: previousAgent?._id,
            newAgent: agentId,
            assignedBy: assignedBy?._id
        });

        return updatedLead;
    }

    /**
     * Delete lead (soft delete)
     * @param {string} id - Lead ID
     * @param {Object} deletedBy - User deleting
     * @returns {Promise<boolean>} Success
     */
    async deleteLead(id, deletedBy = null) {
        await this.getLeadById(id); // Verify exists
        
        await leadRepository.softDelete(id);
        
        logger.info('Lead deleted (soft)', { leadId: id, deletedBy: deletedBy?._id });
        
        return true;
    }

    /**
     * Get lead statistics
     * @param {Object} filter - Optional filter
     * @returns {Promise<Object>} Statistics
     */
    async getStats(filter = {}) {
        return await leadRepository.getStats({
            ...filter,
            isDeleted: { $ne: true }
        });
    }

    /**
     * Get leads by agent
     * @param {string} agentId - Agent ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Leads
     */
    async getLeadsByAgent(agentId, options = {}) {
        return await leadRepository.findByAgentId(agentId, {
            ...options,
            sort: { createdAt: -1 }
        });
    }

    /**
     * Bulk assign leads
     * @param {Array} leadIds - Lead IDs
     * @param {string} agentId - Agent ID
     * @param {Object} assignedBy - User making assignment
     * @returns {Promise<Object>} Result
     */
    async bulkAssignLeads(leadIds, agentId, assignedBy = null) {
        const result = await leadRepository.bulkUpdate(leadIds, {
            assignedTo: agentId,
            assignedAt: new Date(),
            assignedBy: assignedBy?._id || assignedBy
        });

        logger.info('Leads bulk assigned', {
            count: leadIds.length,
            agentId,
            assignedBy: assignedBy?._id
        });

        return {
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount
        };
    }

    /**
     * Search leads
     * @param {string} query - Search query
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Matching leads
     */
    async searchLeads(query, options = {}) {
        return await leadRepository.search(query, options);
    }

    /**
     * Get daily lead counts for date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Array>} Daily counts
     */
    async getDailyCounts(startDate, endDate) {
        return await leadRepository.getDailyCounts(startDate, endDate);
    }

    /**
     * Find lead by phone
     * @param {string} phone - Phone number
     * @returns {Promise<Object|null>} Lead or null
     */
    async findByPhone(phone) {
        return await leadRepository.findByPhone(phone);
    }

    /**
     * Get or create lead by phone (for ingestion)
     * @param {string} phone - Phone number
     * @param {Object} leadData - Lead data if creating
     * @returns {Promise<Object>} { lead, isNew }
     */
    async getOrCreateByPhone(phone, leadData) {
        let lead = await leadRepository.findByPhone(phone);
        
        if (lead) {
            return { lead, isNew: false };
        }

        lead = await this.createLead({
            ...leadData,
            phone
        });

        return { lead, isNew: true };
    }
}

module.exports = new LeadService();
