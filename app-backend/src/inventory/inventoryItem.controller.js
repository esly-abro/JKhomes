const inventoryItemService = require('./inventoryItem.service');

class InventoryItemController {
  async getItems(req, reply) {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return reply.code(400).send({ error: 'Organization ID required' });
      }
      const filters = req.query;
      const items = await inventoryItemService.getAll(organizationId, filters);
      return reply.code(200).send(items);
    } catch (error) {
      console.error('Get inventory items error:', error);
      return reply.code(500).send({ error: 'Failed to fetch items' });
    }
  }

  async getItemById(req, reply) {
    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;
      const item = await inventoryItemService.getById(id, organizationId);
      return reply.code(200).send(item);
    } catch (error) {
      console.error('Get inventory item by ID error:', error);
      return reply.code(404).send({ error: error.message });
    }
  }

  async createItem(req, reply) {
    try {
      const organizationId = req.user?.organizationId;
      const userId = req.user?.id;
      if (!organizationId) {
        return reply.code(400).send({ error: 'Organization ID required' });
      }

      if (!req.body.name) {
        return reply.code(400).send({
          error: 'Missing required fields',
          details: { name: 'Item name is required' }
        });
      }

      const item = await inventoryItemService.create(req.body, organizationId, userId);
      return reply.code(201).send(item);
    } catch (error) {
      console.error('Create inventory item error:', error);
      if (error.name === 'ValidationError') {
        return reply.code(400).send({ error: 'Validation failed', details: error.errors });
      }
      return reply.code(500).send({ error: 'Failed to create item' });
    }
  }

  async updateItem(req, reply) {
    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;
      const item = await inventoryItemService.update(id, req.body, organizationId);
      return reply.code(200).send(item);
    } catch (error) {
      console.error('Update inventory item error:', error);
      return reply.code(error.message === 'Item not found' ? 404 : 500).send({ error: error.message });
    }
  }

  async deleteItem(req, reply) {
    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;
      const result = await inventoryItemService.delete(id, organizationId);
      return reply.code(200).send(result);
    } catch (error) {
      console.error('Delete inventory item error:', error);
      return reply.code(error.message === 'Item not found' ? 404 : 500).send({ error: error.message });
    }
  }

  async updateCustomFields(req, reply) {
    try {
      const organizationId = req.user?.organizationId;
      const { id } = req.params;
      const { customFields } = req.body;

      if (!Array.isArray(customFields)) {
        return reply.code(400).send({ error: 'customFields must be an array' });
      }

      const item = await inventoryItemService.updateCustomFields(id, organizationId, customFields);
      return reply.code(200).send(item);
    } catch (error) {
      console.error('Update custom fields error:', error);
      return reply.code(error.message === 'Item not found' ? 404 : 500).send({ error: error.message });
    }
  }
}

module.exports = new InventoryItemController();
