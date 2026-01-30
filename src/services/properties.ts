import api from './api';

export interface Property {
  _id?: string;
  name: string;
  propertyType: 'Villa' | 'Apartment' | 'Plot' | 'Commercial' | 'Penthouse' | 'Studio' | 'Duplex' | 'Other';
  location: string;
  price: {
    min: number;
    max: number;
    currency: string;
  };
  size: {
    value: number;
    unit: string;
  };
  bedrooms?: number;
  bathrooms?: number;
  status: 'Available' | 'Sold' | 'Reserved' | 'Under Construction';
  images?: Array<{
    url: string;
    caption?: string;
  }>;
  description?: string;
  interestedLeadsCount?: number;
  amenities?: string[];
  assignedAgent?: {
    _id: string;
    name: string;
    email: string;
    phone?: string;
  };
  createdBy?: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface PropertyFilters {
  propertyType?: string;
  status?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
}

export const getProperties = async (filters?: PropertyFilters): Promise<Property[]> => {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value.toString());
    });
  }
  const response = await api.get(`/api/properties?${params.toString()}`);
  return response.data;
};

export const getPropertyById = async (id: string): Promise<Property> => {
  const response = await api.get(`/api/properties/${id}`);
  return response.data;
};

export const createProperty = async (property: Partial<Property>): Promise<Property> => {
  const response = await api.post('/api/properties', property);
  return response.data;
};

export const updateProperty = async (id: string, updates: Partial<Property>): Promise<Property> => {
  const response = await api.patch(`/api/properties/${id}`, updates);
  return response.data;
};

export const deleteProperty = async (id: string): Promise<void> => {
  await api.delete(`/api/properties/${id}`);
};

export const uploadPropertyImage = async (file: File): Promise<{ url: string; filename: string }> => {
  const formData = new FormData();
  formData.append('image', file);
  const response = await api.post('/api/upload/property-image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};
