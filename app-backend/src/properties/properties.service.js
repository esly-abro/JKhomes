const Property = require('./properties.model');
const googleSheetsService = require('../services/googleSheets.service');

class PropertiesService {
  /**
   * Sync property to Google Sheets (non-blocking)
   */
  async syncToGoogleSheets(property, action = 'upsert') {
    try {
      if (action === 'delete') {
        await googleSheetsService.deleteProperty(property._id || property);
      } else {
        // Populate the property if needed for full data
        const populatedProperty = property.assignedAgent?.name 
          ? property 
          : await Property.findById(property._id)
              .populate('assignedAgent', 'name email phone');
        await googleSheetsService.syncProperty(populatedProperty || property);
      }
    } catch (error) {
      // Log but don't fail the main operation
      console.error('[PropertiesService] Google Sheets sync error:', error.message);
    }
  }

  async getAllProperties(filters = {}) {
    try {
      const query = {};

      // Apply filters — support both 'category' and legacy 'propertyType'
      if (filters.category || filters.propertyType) {
        query.category = filters.category || filters.propertyType;
      }
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.location) {
        query.location = { $regex: filters.location, $options: 'i' };
      }
      if (filters.minPrice) {
        query['price.min'] = { $gte: parseInt(filters.minPrice) };
      }
      if (filters.maxPrice) {
        query['price.max'] = { $lte: parseInt(filters.maxPrice) };
      }

      const properties = await Property.find(query)
        .populate('createdBy', 'name email')
        .populate('assignedAgent', 'name email phone')
        .sort({ createdAt: -1 });

      return properties;
    } catch (error) {
      console.error('Get properties error:', error);
      throw error;
    }
  }

  async getPropertyById(id) {
    try {
      const property = await Property.findById(id)
        .populate('createdBy', 'name email')
        .populate('assignedAgent', 'name email phone');

      if (!property) {
        throw new Error('Property not found');
      }

      return property;
    } catch (error) {
      console.error('Get property by ID error:', error);
      throw error;
    }
  }

  async createProperty(propertyData, userId) {
    try {
      // Normalize: if client sends 'propertyType', map it to 'category'
      if (propertyData.propertyType && !propertyData.category) {
        propertyData.category = propertyData.propertyType;
      }

      const property = new Property({
        ...propertyData,
        createdBy: userId
      });

      await property.save();
      
      // Sync to Google Sheets (non-blocking)
      this.syncToGoogleSheets(property);
      
      return property;
    } catch (error) {
      console.error('Create property error:', error);
      throw error;
    }
  }

  async updateProperty(id, updates) {
    try {
      const property = await Property.findByIdAndUpdate(
        id,
        { ...updates, updatedAt: Date.now() },
        { new: true, runValidators: true }
      )
        .populate('createdBy', 'name email')
        .populate('assignedAgent', 'name email phone');

      if (!property) {
        throw new Error('Property not found');
      }

      // Sync to Google Sheets (non-blocking)
      this.syncToGoogleSheets(property);

      return property;
    } catch (error) {
      console.error('Update property error:', error);
      throw error;
    }
  }

  async deleteProperty(id) {
    try {
      const property = await Property.findByIdAndDelete(id);

      if (!property) {
        throw new Error('Property not found');
      }

      // Sync to Google Sheets (non-blocking)
      this.syncToGoogleSheets(id, 'delete');

      return { message: 'Property deleted successfully' };
    } catch (error) {
      console.error('Delete property error:', error);
      throw error;
    }
  }

  async incrementInterestedCount(propertyId) {
    try {
      const property = await Property.findByIdAndUpdate(
        propertyId,
        { $inc: { interestedLeadsCount: 1 } },
        { new: true }
      ).populate('assignedAgent', 'name email phone');
      
      // Sync to Google Sheets (non-blocking)
      if (property) {
        this.syncToGoogleSheets(property);
      }
      
      return property;
    } catch (error) {
      console.error('Increment interested count error:', error);
      throw error;
    }
  }

  async decrementInterestedCount(propertyId) {
    try {
      const property = await Property.findByIdAndUpdate(
        propertyId,
        { $inc: { interestedLeadsCount: -1 } },
        { new: true }
      ).populate('assignedAgent', 'name email phone');
      
      // Sync to Google Sheets (non-blocking)
      if (property) {
        this.syncToGoogleSheets(property);
      }
      
      return property;
    } catch (error) {
      console.error('Decrement interested count error:', error);
      throw error;
    }
  }

  /**
   * Sync all properties to Google Sheets (full refresh)
   */
  async syncAllToGoogleSheets() {
    try {
      const properties = await Property.find({})
        .populate('createdBy', 'name email')
        .populate('assignedAgent', 'name email phone');
      
      const result = await googleSheetsService.syncAllProperties(properties);
      return { 
        success: true, 
        message: `Synced ${properties.length} properties to Google Sheets`,
        result 
      };
    } catch (error) {
      console.error('Sync all to Google Sheets error:', error);
      throw error;
    }
  }

  /**
   * Get Google Sheets sync status
   */
  async getGoogleSheetsSyncStatus() {
    return await googleSheetsService.getSyncStatus();
  }
}

module.exports = new PropertiesService();
