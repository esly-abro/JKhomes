/**
 * Inventory Items API Service
 * Generic catalog/inventory CRUD operations (SaaS multi-tenant)
 */

import api from './api';

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiSelect' | 'boolean' | 'currency' | 'url' | 'email' | 'phone';
  value: any;
  options?: string[];
}

export interface InventoryItem {
  _id?: string;
  organizationId: string;
  name: string;
  itemType?: string;
  category?: string;
  description?: string;
  location?: string;
  status?: 'Available' | 'Sold' | 'Reserved' | 'Inactive' | 'Coming Soon';
  pricing?: {
    basePrice?: number;
    minPrice?: number;
    maxPrice?: number;
    currency?: string;
    billingCycle?: string;
  };
  customFields?: CustomField[];
  images?: string[];
  assignedAgent?: any;
  tags?: string[];
  // Legacy real estate fields
  legacyFields?: {
    bedrooms?: number;
    bathrooms?: number;
    sqft?: number;
    propertyType?: string;
    amenities?: string[];
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Get all inventory items for the current organization
 */
export async function getInventoryItems(filters?: Record<string, string>): Promise<InventoryItem[]> {
  const params = new URLSearchParams(filters);
  const response = await api.get(`/api/inventory-items?${params.toString()}`);
  return response.data;
}

/**
 * Get a single inventory item by ID
 */
export async function getInventoryItemById(id: string): Promise<InventoryItem> {
  const response = await api.get(`/api/inventory-items/${id}`);
  return response.data;
}

/**
 * Create a new inventory item
 */
export async function createInventoryItem(data: Partial<InventoryItem>): Promise<InventoryItem> {
  const response = await api.post('/api/inventory-items', data);
  return response.data;
}

/**
 * Update an inventory item
 */
export async function updateInventoryItem(id: string, data: Partial<InventoryItem>): Promise<InventoryItem> {
  const response = await api.patch(`/api/inventory-items/${id}`, data);
  return response.data;
}

/**
 * Delete an inventory item
 */
export async function deleteInventoryItem(id: string): Promise<{ success: boolean; message: string }> {
  const response = await api.delete(`/api/inventory-items/${id}`);
  return response.data;
}

/**
 * Update custom fields on an inventory item
 */
export async function updateInventoryItemCustomFields(id: string, customFields: CustomField[]): Promise<InventoryItem> {
  const response = await api.patch(`/api/inventory-items/${id}/custom-fields`, { customFields });
  return response.data;
}
