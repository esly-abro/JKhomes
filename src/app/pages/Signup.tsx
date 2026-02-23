import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Building2, Check, AlertCircle, CheckCircle, Building, Package, Heart, GraduationCap, Shield, DollarSign, Car, Grid3x3, ArrowRight, ArrowLeft } from 'lucide-react';
import { register } from '../../services/auth';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/parseApiError';

interface SignupProps {
  onSignup?: (user: any) => void;
}

type Industry = 'real_estate' | 'saas' | 'healthcare' | 'education' | 'insurance' | 'finance' | 'automotive' | 'generic';

const industries = [
  { 
    key: 'real_estate' as Industry, 
    label: 'Real Estate', 
    icon: Building,
    description: 'Property sales and management'
  },
  { 
    key: 'saas' as Industry, 
    label: 'SaaS / Software', 
    icon: Package,
    description: 'Software products and services'
  },
  { 
    key: 'healthcare' as Industry, 
    label: 'Healthcare', 
    icon: Heart,
    description: 'Medical services and clinics'
  },
  { 
    key: 'education' as Industry, 
    label: 'Education', 
    icon: GraduationCap,
    description: 'Schools and training centers'
  },
  { 
    key: 'insurance' as Industry, 
    label: 'Insurance', 
    icon: Shield,
    description: 'Insurance products and policies'
  },
  { 
    key: 'finance' as Industry, 
    label: 'Finance / Banking', 
    icon: DollarSign,
    description: 'Financial services and banking'
  },
  { 
    key: 'automotive' as Industry, 
    label: 'Automotive', 
    icon: Car,
    description: 'Vehicle sales and services'
  },
  { 
    key: 'generic' as Industry, 
    label: 'Other', 
    icon: Grid3x3,
    description: 'General purpose CRM'
  }
];

export default function Signup({ onSignup }: SignupProps) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    industry: '' as Industry | '',
    catalogModuleLabel: '',
    categoryFieldLabel: '',
    appointmentFieldLabel: '',
    organizationName: '',
    fullName: '',
    email: '',
    password: '',
    phone: ''
  });

  // Industry-specific default labels (now includes catalog module label)
  const industryDefaults: Record<Industry, { catalog: string; category: string; appointment: string }> = {
    real_estate: { catalog: 'Properties', category: 'Property Type', appointment: 'Site Visit' },
    saas: { catalog: 'Products', category: 'Product Plan', appointment: 'Demo' },
    healthcare: { catalog: 'Services', category: 'Service Type', appointment: 'Appointment' },
    education: { catalog: 'Programs', category: 'Program Type', appointment: 'Campus Visit' },
    insurance: { catalog: 'Products', category: 'Policy Type', appointment: 'Consultation' },
    finance: { catalog: 'Products', category: 'Product Type', appointment: 'Consultation' },
    automotive: { catalog: 'Vehicles', category: 'Vehicle Type', appointment: 'Test Drive' },
    generic: { catalog: 'Catalog', category: 'Category', appointment: 'Appointment' }
  };

  const currentDefaults = formData.industry ? industryDefaults[formData.industry] : industryDefaults.generic;

  const handleNext = () => {
    // Validation for each step
    if (currentStep === 1 && !formData.industry) {
      setError('Please select an industry');
      return;
    }
    setError('');
    setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    setError('');
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const response = await register(
        formData.organizationName,
        formData.industry || 'generic',
        formData.catalogModuleLabel || currentDefaults.catalog,
        formData.categoryFieldLabel || currentDefaults.category,
        formData.appointmentFieldLabel || currentDefaults.appointment,
        formData.fullName,
        formData.email,
        formData.password,
        formData.phone
      );
      
      setSuccess(true);
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        navigate('/login');
      }, 3000);
      
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  // Show success message
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-blue-600 to-purple-700">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Registration Successful!</h2>
          <p className="text-gray-600 mb-4">
            Your organization has been created successfully! You can now log in to your account.
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to login page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8 text-white">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Building2 className="h-10 w-10" />
            <span className="text-3xl font-bold">Pulsar</span>
          </div>
          <h1 className="text-2xl font-semibold mb-2">Create Your Organization</h1>
          <p className="text-blue-100">Get started in 3 easy steps</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-4">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${currentStep >= 1 ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'} font-semibold`}>
              1
            </div>
            <div className={`h-1 w-16 ${currentStep > 1 ? 'bg-white' : 'bg-blue-400'}`}></div>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${currentStep >= 2 ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'} font-semibold`}>
              2
            </div>
            <div className={`h-1 w-16 ${currentStep > 2 ? 'bg-white' : 'bg-blue-400'}`}></div>
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${currentStep >= 3 ? 'bg-white text-blue-600' : 'bg-blue-500 text-white'} font-semibold`}>
              3
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-2xl p-8 max-h-[calc(100vh-280px)] overflow-y-auto">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Step 1: Select Industry */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Select Your Industry</h2>
              <p className="text-gray-600 mb-8 text-center">
                Choose your industry to get pre-configured labels and options
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {industries.map((industry) => {
                  const Icon = industry.icon;
                  const isSelected = formData.industry === industry.key;
                  
                  return (
                    <button
                      key={industry.key}
                      type="button"
                      onClick={() => setFormData({ ...formData, industry: industry.key, catalogModuleLabel: '', categoryFieldLabel: '', appointmentFieldLabel: '' })}
                      className={`relative p-6 border-2 rounded-lg transition-all hover:shadow-lg ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-md'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div className={`mb-3 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                          <Icon className="h-12 w-12" />
                        </div>
                        <h3 className={`font-semibold mb-1 ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                          {industry.label}
                        </h3>
                        <p className="text-xs text-gray-500">{industry.description}</p>
                      </div>
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <Button 
                  onClick={handleNext}
                  disabled={!formData.industry}
                  size="lg"
                >
                  Continue <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Customize Labels */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Customize Field Labels</h2>
              <p className="text-gray-600 mb-6 text-center">
                Personalize how fields appear in your CRM (optional)
              </p>

              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 mb-2">
                  <strong>Selected Industry:</strong> {industries.find(i => i.key === formData.industry)?.label}
                </p>
                <p className="text-xs text-blue-700">
                  Default labels have been set based on your industry. You can customize them below or skip to use the defaults.
                </p>
              </div>

              <div className="space-y-6 mb-8">
                <div className="space-y-2">
                  <Label htmlFor="catalogModuleLabel">Catalog Module Name</Label>
                  <Input
                    id="catalogModuleLabel"
                    placeholder={currentDefaults.catalog}
                    value={formData.catalogModuleLabel}
                    onChange={(e) => setFormData({ ...formData, catalogModuleLabel: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    Default: &quot;{currentDefaults.catalog}&quot; - How your main inventory/catalog is called (e.g., Properties, Services, Products)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoryFieldLabel">Category Field Name</Label>
                  <Input
                    id="categoryFieldLabel"
                    placeholder={currentDefaults.category}
                    value={formData.categoryFieldLabel}
                    onChange={(e) => setFormData({ ...formData, categoryFieldLabel: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    Default: &quot;{currentDefaults.category}&quot; - Main classification field for your leads
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="appointmentFieldLabel">Appointment Field Name</Label>
                  <Input
                    id="appointmentFieldLabel"
                    placeholder={currentDefaults.appointment}
                    value={formData.appointmentFieldLabel}
                    onChange={(e) => setFormData({ ...formData, appointmentFieldLabel: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    Default: &quot;{currentDefaults.appointment}&quot; - Meeting/visit scheduling field
                  </p>
                </div>
              </div>

              <div className="flex justify-between">
                <Button 
                  type="button"
                  onClick={handleBack}
                  variant="outline"
                  size="lg"
                >
                  <ArrowLeft className="mr-2 h-5 w-5" /> Back
                </Button>
                <Button 
                  onClick={handleNext}
                  size="lg"
                >
                  Continue <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Organization & Admin Details */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Organization & Admin Details</h2>
              <p className="text-gray-600 mb-6 text-center">
                Final step - create your organization and admin account
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="border-b pb-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Organization Information</h3>
                  <div className="space-y-2">
                    <Label htmlFor="organizationName">Organization Name *</Label>
                    <Input
                      id="organizationName"
                      placeholder="Your company name"
                      value={formData.organizationName}
                      onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-4">Admin Account</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="fullName">Full Name *</Label>
                      <Input
                        id="fullName"
                        placeholder="Your full name"
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="john@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password *</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Create a strong password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={8}
                      />
                      <p className="text-xs text-gray-500">Must be at least 8 characters</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="9876543210"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <Button 
                    type="button"
                    onClick={handleBack}
                    variant="outline"
                    size="lg"
                    disabled={loading}
                  >
                    <ArrowLeft className="mr-2 h-5 w-5" /> Back
                  </Button>
                  <Button 
                    type="submit" 
                    size="lg"
                    disabled={loading}
                  >
                    {loading ? 'Creating Organization...' : 'Create Organization'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-white">
          <p className="text-sm">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold underline hover:text-blue-200">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
