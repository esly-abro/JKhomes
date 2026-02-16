import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Search, Filter, Edit2, Trash2, MapPin, DollarSign, Home, Users, Upload, X, Clock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { getProperties, createProperty, updateProperty, deleteProperty, uploadPropertyImage, Property } from '../../services/properties';
import { getAgents, Agent } from '../../services/agents';
import { useTenantConfig } from '../context/TenantConfigContext';
import { useOrganization } from '../hooks/useOrganization';
import AvailabilitySettingsDialog from '../components/AvailabilitySettingsDialog';

export default function Properties() {
  const { categories, categoryFieldLabel, locationFieldLabel, isModuleEnabled } = useTenantConfig();
  const { catalogModuleLabel, industry } = useOrganization();
  const navigate = useNavigate();
  const isRealEstate = industry === 'real_estate';
  const isAutomotive = industry === 'automotive';
  const showPriceRange = isRealEstate || isAutomotive;
  const showSize = isRealEstate || isAutomotive;

  // Industry-specific field labels
  const getFieldLabels = () => {
    switch (industry) {
      case 'real_estate':
        return { priceLabel: 'Price', sizeLabel: 'Size (sq ft)', statusOptions: ['Available', 'Sold', 'Reserved', 'Under Construction'], currency: '₹' };
      case 'automotive':
        return { priceLabel: 'Price', sizeLabel: 'Engine (cc)', statusOptions: ['Available', 'Sold', 'Reserved', 'In Transit'], currency: '₹' };
      case 'insurance':
        return { priceLabel: 'Premium', sizeLabel: '', statusOptions: ['Available', 'Active', 'Discontinued', 'Coming Soon'], currency: '₹' };
      case 'healthcare':
        return { priceLabel: 'Fee', sizeLabel: '', statusOptions: ['Available', 'Fully Booked', 'Discontinued', 'Coming Soon'], currency: '₹' };
      case 'education':
        return { priceLabel: 'Fee', sizeLabel: '', statusOptions: ['Available', 'Closed', 'Waitlisted', 'Coming Soon'], currency: '₹' };
      case 'saas':
        return { priceLabel: 'Price', sizeLabel: '', statusOptions: ['Available', 'Deprecated', 'Coming Soon', 'Beta'], currency: '$' };
      case 'finance':
        return { priceLabel: 'Value', sizeLabel: '', statusOptions: ['Available', 'Closed', 'Suspended', 'Coming Soon'], currency: '₹' };
      default:
        return { priceLabel: 'Price', sizeLabel: '', statusOptions: ['Available', 'Sold', 'Reserved', 'Inactive'], currency: '₹' };
    }
  };
  const fieldLabels = getFieldLabels();

  // Redirect if module is disabled
  useEffect(() => {
    if (!isModuleEnabled('catalog')) {
      navigate('/dashboard');
    }
  }, [isModuleEnabled, navigate]);

  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [agents, setAgents] = useState<Agent[]>([]);

  // Availability settings dialog state
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [availabilityPropertyId, setAvailabilityPropertyId] = useState<string>('');
  const [availabilityPropertyName, setAvailabilityPropertyName] = useState<string>('');

  const [formData, setFormData] = useState<Partial<Property>>({
    name: '',
    category: categories[0]?.label || '',
    location: '',
    price: { min: 0, max: 0, currency: 'INR' },
    size: { value: 0, unit: 'sqft' },
    bedrooms: 0,
    bathrooms: 0,
    status: 'Available',
    description: '',
    amenities: [],
    images: [],
    assignedAgent: undefined
  });


  useEffect(() => {
    fetchProperties();
    fetchAgents();
  }, []);

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const data = await getProperties();
      setProperties(data);
    } catch (error) {
      console.error('Failed to fetch properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await getAgents();
      setAgents(data);
    } catch (error) {
      console.error('Failed to fetch agents:', error);
    }
  };

  const handleCreateOrUpdate = async () => {
    try {
      // Debug: Log current form state
      console.log('=== FORM DATA DEBUG ===');
      console.log('Full formData:', JSON.stringify(formData, null, 2));
      console.log('Location value:', formData.location);
      console.log('Location type:', typeof formData.location);
      console.log('Location length:', formData.location?.length);

      // Validate required fields
      if (!formData.name || !formData.name.trim()) {
        alert(`❌ ${catalogModuleLabel} name is required`);
        return;
      }
      if (!formData.location || !formData.location.trim()) {
        alert(`❌ ${locationFieldLabel} is required\n\nCurrent value: "` + (formData.location || 'empty') + '"');
        return;
      }
      if (showPriceRange) {
        if (!formData.price?.min || !formData.price?.max) {
          alert(`❌ Min and Max ${fieldLabels.priceLabel.toLowerCase()} are required`);
          return;
        }
      } else {
        if (!formData.price?.min) {
          alert(`❌ ${fieldLabels.priceLabel} is required`);
          return;
        }
      }
      if (showSize && !formData.size?.value) {
        alert(`❌ ${fieldLabels.sizeLabel} is required`);
        return;
      }

      console.log('✅ Validation passed, submitting...');

      // Prepare data for API - convert assignedAgent object to just ID
      const apiData: any = {
        ...formData,
        assignedAgent: formData.assignedAgent?._id || null
      };

      if (editingProperty) {
        await updateProperty(editingProperty._id!, apiData);
      } else {
        await createProperty(apiData);
      }

      await fetchProperties();
      setShowDialog(false);
      resetForm();
      alert(`✅ ${catalogModuleLabel} saved successfully!`);
    } catch (error: any) {
      console.error('❌ Failed to save property:', error);
      console.error('Error response:', error.response);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message || `Failed to save ${catalogModuleLabel.toLowerCase()}`;
      const errorDetails = error.response?.data?.details ? '\n\nDetails: ' + JSON.stringify(error.response.data.details, null, 2) : '';
      alert('❌ ' + errorMsg + errorDetails);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Are you sure you want to delete this ${catalogModuleLabel.toLowerCase()}?`)) return;

    try {
      await deleteProperty(id);
      await fetchProperties();
    } catch (error) {
      console.error('Failed to delete property:', error);
    }
  };

  const handleEdit = (property: Property) => {
    setEditingProperty(property);
    setFormData(property);
    setShowDialog(true);
  };

  const handleOpenAvailability = (property: Property) => {
    setAvailabilityPropertyId(property._id!);
    setAvailabilityPropertyName(property.name);
    setShowAvailabilityDialog(true);
  };

  const resetForm = () => {
    setEditingProperty(null);
    setFormData({
      name: '',
      category: categories[0]?.label || '',
      location: '',
      price: { min: 0, max: 0, currency: 'INR' },
      size: { value: 0, unit: 'sqft' },
      bedrooms: 0,
      bathrooms: 0,
      status: 'Available',
      description: '',
      amenities: [],
      images: [],
      assignedAgent: undefined
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // TODO: Add loading state for uploads

    for (const file of files) {
      try {
        const result = await uploadPropertyImage(file);

        // Use the returned server URL (assuming backend is on port 4000)
        // In production, this should be a full URL or properly proxied
        const serverUrl = result.url;

        setFormData(prev => ({
          ...prev,
          images: [...(prev.images || []), {
            url: serverUrl,
            caption: file.name,
            uploadedAt: new Date().toISOString()
          }]
        }));
      } catch (error) {
        console.error('Failed to upload image:', error);
        alert(`Failed to upload ${file.name}`);
      }
    }

    // Reset input
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images?.filter((_, i) => i !== index) || []
    }));
  };

  const filteredProperties = properties.filter(property => {
    const matchesSearch = property.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.location.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || property.status === statusFilter;
    const matchesType = typeFilter === 'all' || (property.category || property.propertyType) === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const formatPrice = (price: { min: number; max: number; currency: string }) => {
    const formatNum = (num: number) => {
      if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
      if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
      return `₹${num.toLocaleString()}`;
    };
    return `${formatNum(price.min)} - ${formatNum(price.max)}`;
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{catalogModuleLabel} Management</h1>
        <p className="text-gray-600">Manage your {catalogModuleLabel.toLowerCase()}</p>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder={`Search ${catalogModuleLabel.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {fieldLabels.statusOptions.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={categoryFieldLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {categoryFieldLabel}s</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat.key} value={cat.label}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add {catalogModuleLabel}
          </Button>
        </div>
      </div>

      {/* Properties Grid */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading {catalogModuleLabel.toLowerCase()}...</p>
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No {catalogModuleLabel.toLowerCase()} found</p>
          <Button onClick={() => { resetForm(); setShowDialog(true); }} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Add Your First {catalogModuleLabel}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProperties.map((property) => (
            <div key={property._id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
              {/* Property Image */}
              {property.images && property.images.length > 0 ? (
                <div className="h-48 relative">
                  <img
                    src={property.images[0].url}
                    alt={property.name}
                    className="w-full h-full object-cover"
                  />
                  {property.images.length > 1 && (
                    <div className="absolute bottom-2 right-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                      +{property.images.length - 1} more
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                  <Building2 className="h-16 w-16 text-white opacity-50" />
                </div>
              )}

              {/* Property Details */}
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900 mb-1">{property.name}</h3>
                    <div className="flex items-center text-sm text-gray-600 mb-2">
                      <MapPin className="h-3 w-3 mr-1" />
                      {property.location}
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${property.status === 'Available' ? 'bg-green-100 text-green-700' :
                    property.status === 'Sold' ? 'bg-gray-100 text-gray-700' :
                      property.status === 'Reserved' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-blue-100 text-blue-700'
                    }`}>
                    {property.status}
                  </span>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{categoryFieldLabel}</span>
                    <span className="font-medium text-gray-900">{property.category || property.propertyType}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{fieldLabels.priceLabel}</span>
                    <span className="font-medium text-gray-900">
                      {showPriceRange ? formatPrice(property.price) : `${fieldLabels.currency}${(property.price?.min || 0).toLocaleString()}`}
                      {industry === 'insurance' && '/mo'}
                    </span>
                  </div>
                  {showSize && property.size?.value > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{fieldLabels.sizeLabel}</span>
                    <span className="font-medium text-gray-900">{property.size.value} {property.size.unit}</span>
                  </div>
                  )}
                  {isRealEstate && property.bedrooms && property.bathrooms && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Config</span>
                      <span className="font-medium text-gray-900">{property.bedrooms}BHK, {property.bathrooms} Bath</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 flex items-center">
                      <Users className="h-3 w-3 mr-1" />
                      Interested Leads
                    </span>
                    <span className="font-medium text-blue-600">{property.interestedLeadsCount || 0}</span>
                  </div>
                  {property.assignedAgent && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Assigned Agent</span>
                      <span className="font-medium text-green-600">{property.assignedAgent.name}</span>
                    </div>
                  )}
                </div>

                {property.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{property.description}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(property)}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenAvailability(property)}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    title="Availability Settings"
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(property._id!)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) { setShowDialog(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProperty ? `Edit ${catalogModuleLabel}` : `Add New ${catalogModuleLabel}`}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="name">{catalogModuleLabel} Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Luxury Villa in Whitefield"
                  required
                />
              </div>

              <div>
                <Label htmlFor="category">{categoryFieldLabel} *</Label>
                <Select
                  value={formData.category || formData.propertyType || ''}
                  onValueChange={(value: any) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.key} value={cat.label}>{cat.label}</SelectItem>
                    ))}
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fieldLabels.statusOptions.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2">
                <Label htmlFor="assignedAgent">Assigned Agent</Label>
                <Select
                  value={formData.assignedAgent?._id || 'none'}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      setFormData({ ...formData, assignedAgent: undefined });
                    } else {
                      const agent = agents.find(a => a._id === value);
                      setFormData({ ...formData, assignedAgent: agent });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select agent (optional)..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No agent assigned</SelectItem>
                    {agents.map(agent => (
                      <SelectItem key={agent._id} value={agent._id}>
                        {agent.name} ({agent.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Leads interested in this {catalogModuleLabel.toLowerCase()} will be auto-assigned to this agent
                </p>
              </div>

              <div className="col-span-2">
                <Label htmlFor="location">{locationFieldLabel} *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => {
                    const newLocation = e.target.value;
                    console.log('Location input changed:', newLocation);
                    setFormData({ ...formData, location: newLocation });
                  }}
                  onBlur={() => console.log('Location onBlur, current value:', formData.location)}
                  placeholder={locationFieldLabel === 'Location' ? 'Whitefield, Bangalore' : `Enter ${locationFieldLabel.toLowerCase()}`}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">Current: {formData.location || '(empty)'}</p>
              </div>

              {showPriceRange ? (
              <>
              <div>
                <Label htmlFor="minPrice">Min {fieldLabels.priceLabel} ({fieldLabels.currency}) *</Label>
                <Input
                  id="minPrice"
                  type="number"
                  min="0"
                  value={formData.price?.min || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    price: { ...formData.price!, min: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) }
                  })}
                  placeholder="5000000"
                />
              </div>

              <div>
                <Label htmlFor="maxPrice">Max {fieldLabels.priceLabel} ({fieldLabels.currency}) *</Label>
                <Input
                  id="maxPrice"
                  type="number"
                  min="0"
                  value={formData.price?.max || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    price: { ...formData.price!, max: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) }
                  })}
                  placeholder="8000000"
                />
              </div>
              </>
              ) : (
              <div className="col-span-2">
                <Label htmlFor="price">{fieldLabels.priceLabel} ({fieldLabels.currency}) *</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  value={formData.price?.min || ''}
                  onChange={(e) => {
                    const val = Math.max(0, e.target.value === '' ? 0 : Number(e.target.value));
                    setFormData({
                      ...formData,
                      price: { ...formData.price!, min: val, max: val }
                    });
                  }}
                  placeholder={industry === 'insurance' ? '500' : '10000'}
                />
                {industry === 'insurance' && (
                  <p className="text-xs text-gray-500 mt-1">Monthly premium amount</p>
                )}
              </div>
              )}

              {showSize && (
              <div>
                <Label htmlFor="size">{fieldLabels.sizeLabel} *</Label>
                <Input
                  id="size"
                  type="number"
                  min="0"
                  value={formData.size?.value || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    size: { ...formData.size!, value: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) }
                  })}
                  placeholder={isRealEstate ? '2000' : '1500'}
                />
              </div>
              )}

              {isRealEstate && (
              <>
              <div>
                <Label htmlFor="bedrooms">Bedrooms</Label>
                <Input
                  id="bedrooms"
                  type="number"
                  min="0"
                  value={formData.bedrooms || ''}
                  onChange={(e) => setFormData({ ...formData, bedrooms: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) })}
                  placeholder="3"
                />
              </div>

              <div className="col-span-2">
                <Label htmlFor="bathrooms">Bathrooms</Label>
                <Input
                  id="bathrooms"
                  type="number"
                  min="0"
                  value={formData.bathrooms || ''}
                  onChange={(e) => setFormData({ ...formData, bathrooms: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) })}
                  placeholder="2"
                />
              </div>
              </>
              )}

              <div className="col-span-2">
                <Label htmlFor="images">{catalogModuleLabel} Images</Label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      id="images"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('images')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                  </div>

                  {formData.images && formData.images.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {formData.images.map((image, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={image.url}
                            alt={image.caption || `${catalogModuleLabel} image ${index + 1}`}
                            className="w-full h-24 object-cover rounded border border-gray-200"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    Upload {catalogModuleLabel.toLowerCase()} images (JPG, PNG). Multiple images supported.
                  </p>
                </div>
              </div>

              <div className="col-span-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={`Describe the ${catalogModuleLabel.toLowerCase()} features, amenities, and highlights...`}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrUpdate}>
              {editingProperty ? `Update ${catalogModuleLabel}` : `Create ${catalogModuleLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Availability Settings Dialog */}
      <AvailabilitySettingsDialog
        open={showAvailabilityDialog}
        onOpenChange={setShowAvailabilityDialog}
        propertyId={availabilityPropertyId}
        propertyName={availabilityPropertyName}
      />
    </div>
  );
}
