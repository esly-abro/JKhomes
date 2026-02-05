/**
 * Property Repository
 * Database access layer for Property operations
 */

const Property = require('../models/Property');
const { DatabaseError } = require('../errors/AppError');
const logger = require('../utils/logger');

class PropertyRepository {
    /**
     * Create a new property
     * @param {Object} propertyData - Property data
     * @returns {Promise<Object>} Created property
     */
    async create(propertyData) {
        try {
            const property = new Property(propertyData);
            await property.save();
            return property.toObject();
        } catch (error) {
            logger.error('Repository: Failed to create property', { error: error.message });
            throw new DatabaseError('create property', error);
        }
    }

    /**
     * Find property by ID
     * @param {string} id - Property ID
     * @param {Object} options - Query options
     * @returns {Promise<Object|null>} Property or null
     */
    async findById(id, options = {}) {
        try {
            let query = Property.findById(id);
            
            if (options.populate) {
                query = query.populate(options.populate);
            }
            
            if (options.select) {
                query = query.select(options.select);
            }
            
            const property = await query.lean();
            return property;
        } catch (error) {
            if (error.name === 'CastError') {
                return null;
            }
            throw new DatabaseError('find property', error);
        }
    }

    /**
     * Find properties with filters and pagination
     * @param {Object} filter - Query filters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Array of properties
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

            let query = Property.find(filter);
            
            if (populate) {
                query = query.populate(populate);
            }
            
            if (select) {
                query = query.select(select);
            }
            
            const properties = await query
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean();
            
            return properties;
        } catch (error) {
            throw new DatabaseError('find properties', error);
        }
    }

    /**
     * Count properties with filters
     * @param {Object} filter - Query filters
     * @returns {Promise<number>} Count
     */
    async count(filter = {}) {
        try {
            return await Property.countDocuments(filter);
        } catch (error) {
            throw new DatabaseError('count properties', error);
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
     * Update property by ID
     * @param {string} id - Property ID
     * @param {Object} updates - Fields to update
     * @param {Object} options - Update options
     * @returns {Promise<Object|null>} Updated property
     */
    async update(id, updates, options = {}) {
        try {
            const property = await Property.findByIdAndUpdate(
                id,
                { $set: updates, updatedAt: new Date() },
                { new: true, runValidators: true, ...options }
            ).lean();
            
            return property;
        } catch (error) {
            throw new DatabaseError('update property', error);
        }
    }

    /**
     * Delete property by ID
     * @param {string} id - Property ID
     * @returns {Promise<boolean>} Success
     */
    async delete(id) {
        try {
            const result = await Property.findByIdAndDelete(id);
            return !!result;
        } catch (error) {
            throw new DatabaseError('delete property', error);
        }
    }

    /**
     * Find available properties
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Available properties
     */
    async findAvailable(options = {}) {
        try {
            return await this.findMany({ status: 'available' }, options);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find properties by location
     * @param {string} city - City name
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Properties
     */
    async findByCity(city, options = {}) {
        try {
            return await this.findMany(
                { 'location.city': new RegExp(city, 'i') },
                options
            );
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find properties by price range
     * @param {number} minPrice - Minimum price
     * @param {number} maxPrice - Maximum price
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Properties
     */
    async findByPriceRange(minPrice, maxPrice, options = {}) {
        try {
            const filter = {};
            if (minPrice !== undefined) filter.price = { $gte: minPrice };
            if (maxPrice !== undefined) {
                filter.price = { ...filter.price, $lte: maxPrice };
            }
            return await this.findMany(filter, options);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Find properties by type
     * @param {string} propertyType - Property type
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Properties
     */
    async findByType(propertyType, options = {}) {
        try {
            return await this.findMany({ propertyType }, options);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get property statistics
     * @param {Object} filter - Optional filter
     * @returns {Promise<Object>} Statistics
     */
    async getStats(filter = {}) {
        try {
            const pipeline = [
                { $match: filter },
                {
                    $group: {
                        _id: { status: '$status', type: '$propertyType' },
                        count: { $sum: 1 },
                        avgPrice: { $avg: '$price' },
                        minPrice: { $min: '$price' },
                        maxPrice: { $max: '$price' }
                    }
                }
            ];

            const results = await Property.aggregate(pipeline);
            
            const stats = {
                total: 0,
                byStatus: {},
                byType: {},
                pricing: {
                    average: 0,
                    min: Infinity,
                    max: 0
                }
            };
            
            let priceSum = 0;
            let priceCount = 0;
            
            results.forEach(item => {
                const { status, type } = item._id;
                
                if (!stats.byStatus[status]) stats.byStatus[status] = 0;
                stats.byStatus[status] += item.count;
                
                if (!stats.byType[type]) stats.byType[type] = 0;
                stats.byType[type] += item.count;
                
                stats.total += item.count;
                
                priceSum += item.avgPrice * item.count;
                priceCount += item.count;
                
                if (item.minPrice < stats.pricing.min) stats.pricing.min = item.minPrice;
                if (item.maxPrice > stats.pricing.max) stats.pricing.max = item.maxPrice;
            });
            
            stats.pricing.average = priceCount > 0 ? Math.round(priceSum / priceCount) : 0;
            if (stats.pricing.min === Infinity) stats.pricing.min = 0;
            
            return stats;
        } catch (error) {
            throw new DatabaseError('get property stats', error);
        }
    }

    /**
     * Search properties
     * @param {string} query - Search query
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Matching properties
     */
    async search(query, options = {}) {
        try {
            const searchRegex = new RegExp(query, 'i');
            const filter = {
                $or: [
                    { title: searchRegex },
                    { description: searchRegex },
                    { 'location.address': searchRegex },
                    { 'location.city': searchRegex }
                ]
            };
            
            return await this.findMany(filter, options);
        } catch (error) {
            throw new DatabaseError('search properties', error);
        }
    }

    /**
     * Find nearby properties (if using geospatial)
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @param {number} maxDistance - Max distance in meters
     * @param {Object} options - Query options
     * @returns {Promise<Array>} Nearby properties
     */
    async findNearby(lat, lng, maxDistance = 5000, options = {}) {
        try {
            const filter = {
                'location.coordinates': {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [lng, lat]
                        },
                        $maxDistance: maxDistance
                    }
                }
            };
            return await this.findMany(filter, options);
        } catch (error) {
            // If no geo index, fall back to non-geo query
            logger.warn('Geospatial query not available', { error: error.message });
            return [];
        }
    }

    /**
     * Update property status
     * @param {string} id - Property ID
     * @param {string} status - New status
     * @returns {Promise<Object|null>} Updated property
     */
    async updateStatus(id, status) {
        try {
            return await this.update(id, { status });
        } catch (error) {
            throw error;
        }
    }

    /**
     * Bulk update properties
     * @param {Array} ids - Array of property IDs
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Update result
     */
    async bulkUpdate(ids, updates) {
        try {
            const result = await Property.updateMany(
                { _id: { $in: ids } },
                { $set: updates, updatedAt: new Date() }
            );
            return result;
        } catch (error) {
            throw new DatabaseError('bulk update properties', error);
        }
    }
}

module.exports = new PropertyRepository();
