const InventoryItem = require('../models/inventoryItem.model');

class InventoryItemService {
  /**
   * Get all inventory items for an organization
   */
  async getAll(organizationId, filters = {}) {
    const query = { organizationId };

    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.itemType) query.itemType = filters.itemType;
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
        { category: { $regex: filters.search, $options: 'i' } }
      ];
    }

    const items = await InventoryItem.find(query)
      .populate('assignedAgent', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    return items;
  }

  /**
   * Get a single inventory item by ID
   */
  async getById(id, organizationId) {
    const item = await InventoryItem.findOne({ _id: id, organizationId })
      .populate('assignedAgent', 'name email phone')
      .lean();

    if (!item) {
      throw new Error('Item not found');
    }
    return item;
  }

  /**
   * Create a new inventory item
   */
  async create(data, organizationId, userId) {
    const itemData = {
      ...data,
      organizationId,
      createdBy: userId
    };

    const item = new InventoryItem(itemData);
    await item.save();
    return item.toObject();
  }

  /**
   * Update an inventory item
   */
  async update(id, data, organizationId) {
    const item = await InventoryItem.findOneAndUpdate(
      { _id: id, organizationId },
      { $set: data },
      { new: true, runValidators: true }
    ).populate('assignedAgent', 'name email phone');

    if (!item) {
      throw new Error('Item not found');
    }
    return item.toObject();
  }

  /**
   * Delete an inventory item
   */
  async delete(id, organizationId) {
    const item = await InventoryItem.findOneAndDelete({ _id: id, organizationId });
    if (!item) {
      throw new Error('Item not found');
    }
    return { success: true, message: 'Item deleted successfully' };
  }

  /**
   * Update custom fields for an inventory item
   */
  async updateCustomFields(id, organizationId, customFields) {
    const item = await InventoryItem.findOne({ _id: id, organizationId });
    if (!item) {
      throw new Error('Item not found');
    }

    for (const field of customFields) {
      item.setCustomField(field.key, field.value, field.label, field.type);
    }

    await item.save();
    return item.toObject();
  }
}

module.exports = new InventoryItemService();
