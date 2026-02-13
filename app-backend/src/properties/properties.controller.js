const propertiesService = require('./properties.service');

class PropertiesController {
  async getProperties(req, reply) {
    try {
      const filters = req.query;
      const organizationId = req.user?.organizationId;
      const properties = await propertiesService.getAllProperties(organizationId, filters);
      return reply.code(200).send(properties);
    } catch (error) {
      console.error('Get properties controller error:', error);
      return reply.code(500).send({ error: 'Failed to fetch properties' });
    }
  }

  async getPropertyById(req, reply) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organizationId;
      const property = await propertiesService.getPropertyById(id, organizationId);
      return reply.code(200).send(property);
    } catch (error) {
      console.error('Get property by ID controller error:', error);
      return reply.code(404).send({ error: error.message });
    }
  }

  async createProperty(req, reply) {
    try {
      const userId = req.user?.id;
      const organizationId = req.user?.organizationId;
      
      // Log the incoming request body for debugging
      console.log('Create property request body:', JSON.stringify(req.body, null, 2));
      
      // Validate required fields
      if (!req.body.name || !req.body.location) {
        return reply.code(400).send({ 
          error: 'Missing required fields',
          details: {
            name: !req.body.name ? 'Property name is required' : undefined,
            location: !req.body.location ? 'Location is required' : undefined
          }
        });
      }
      
      const property = await propertiesService.createProperty(req.body, userId, organizationId);
      return reply.code(201).send(property);
    } catch (error) {
      console.error('Create property controller error:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        return reply.code(400).send({ 
          error: 'Validation failed',
          details: error.errors
        });
      }
      
      return reply.code(500).send({ error: 'Failed to create property' });
    }
  }

  async updateProperty(req, reply) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organizationId;
      const property = await propertiesService.updateProperty(id, req.body, organizationId);
      return reply.code(200).send(property);
    } catch (error) {
      console.error('Update property controller error:', error);
      return reply.code(500).send({ error: 'Failed to update property' });
    }
  }

  async deleteProperty(req, reply) {
    try {
      const { id } = req.params;
      const organizationId = req.user?.organizationId;
      const result = await propertiesService.deleteProperty(id, organizationId);
      return reply.code(200).send(result);
    } catch (error) {
      console.error('Delete property controller error:', error);
      return reply.code(500).send({ error: 'Failed to delete property' });
    }
  }

  /**
   * Sync all properties to Google Sheets
   */
  async syncToGoogleSheets(req, reply) {
    try {
      const result = await propertiesService.syncAllToGoogleSheets();
      return reply.code(200).send(result);
    } catch (error) {
      console.error('Sync to Google Sheets controller error:', error);
      return reply.code(500).send({ error: 'Failed to sync to Google Sheets', details: error.message });
    }
  }

  /**
   * Get Google Sheets sync status
   */
  async getGoogleSheetsSyncStatus(req, reply) {
    try {
      const status = await propertiesService.getGoogleSheetsSyncStatus();
      return reply.code(200).send(status);
    } catch (error) {
      console.error('Get sync status controller error:', error);
      return reply.code(500).send({ error: 'Failed to get sync status' });
    }
  }
}

module.exports = new PropertiesController();
