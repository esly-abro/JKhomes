import { AlertCircle, CheckCircle2, ExternalLink, Eye, EyeOff, GripVertical, Key, Loader2, Mail, MessageSquare, Plus, RefreshCw, Save, Send, Settings2, Trash2, UserCheck, X } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getUsers } from '../../services/leads';
import { AppointmentType, CategoryItem, updateAppointmentTypes, updateCategories, updateIndustry, updateLocationLabel } from '../../services/tenantConfig';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useTenantConfig } from '../context/TenantConfigContext';
import { updateCategories, updateAppointmentTypes, updateIndustry, updateLocationLabel, updateLeadStatuses, getStatusUsage, CategoryItem, AppointmentType, LeadStatus } from '../../services/tenantConfig';
import { getUsers } from '../../services/leads';
import TemplateBuilder from '../components/settings/TemplateBuilder';

interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  timezone: string;
  avatar: string;
  [key: string]: string;
}

interface TeamMember {
  id?: number;
  _id?: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  createdAt?: string;
}

interface CrmSettings {
  leadScoring: boolean;
  duplicateDetection: boolean;
}

interface SourceMapping {
  id: number;
  source: string;
  mapTo: string;
  status: string;
}

interface AutomationRule {
  id: number;
  name: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

interface Integration {
  name: string;
  description: string;
  icon: string;
  connected: boolean;
}

interface Invoice {
  date: string;
  amount: string;
  status: string;
}

export default function Settings() {
  const { categoryFieldLabel, appointmentFieldLabel, locationFieldLabel, categories, appointmentTypes, leadStatuses, tenantConfig, refreshConfig } = useTenantConfig();
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Customization tab state
  const [editCategories, setEditCategories] = useState<CategoryItem[]>([]);
  const [editCategoryLabel, setEditCategoryLabel] = useState('');
  const [editAppointmentTypes, setEditAppointmentTypes] = useState<AppointmentType[]>([]);
  const [editAppointmentLabel, setEditAppointmentLabel] = useState('');
  const [editLeadStatuses, setEditLeadStatuses] = useState<LeadStatus[]>([]);
  const [statusUsage, setStatusUsage] = useState<Record<string, number>>({});
  const [statusUsageLoaded, setStatusUsageLoaded] = useState(false);
  const [editLocationLabel, setEditLocationLabel] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [customSaving, setCustomSaving] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [customizationInitialized, setCustomizationInitialized] = useState(false);

  // Sync customization state when tenant config loads
  useEffect(() => {
    if (tenantConfig && !customizationInitialized) {
      setEditCategories(tenantConfig.categories?.map((c, i) => ({ ...c, order: c.order ?? i })) || []);
      setEditCategoryLabel(tenantConfig.categoryFieldLabel || 'Category');
      setEditAppointmentTypes(tenantConfig.appointmentTypes?.map((a, i) => ({ ...a, order: a.order ?? i })) || []);
      setEditAppointmentLabel(tenantConfig.appointmentFieldLabel || 'Appointment');
      setEditLeadStatuses(tenantConfig.leadStatuses?.map((s, i) => ({ ...s, order: s.order ?? i })) || []);
      setEditLocationLabel(tenantConfig.locationFieldLabel || 'Location');
      setSelectedIndustry(tenantConfig.industry || 'real_estate');
      setCustomizationInitialized(true);
    }
  }, [tenantConfig, customizationInitialized]);

  const INDUSTRIES = [
    { value: 'real_estate', label: 'Real Estate' },
    { value: 'healthcare', label: 'Healthcare' },
    { value: 'education', label: 'Education' },
    { value: 'automotive', label: 'Automotive' },
    { value: 'finance', label: 'Finance / Insurance' },
    { value: 'saas', label: 'SaaS / Technology' },
    { value: 'generic', label: 'Generic / Other' }
  ];

  const handleIndustryChange = async (industry: string) => {
    setSelectedIndustry(industry);
    try {
      setCustomSaving(true);
      await updateIndustry(industry, true);
      await refreshConfig();
      setCustomizationInitialized(false); // force re-sync
      setCustomMessage(`Industry changed to ${INDUSTRIES.find(i => i.value === industry)?.label}. Labels & categories reset to defaults.`);
    } catch (err) {
      setCustomMessage('Failed to update industry');
    } finally {
      setCustomSaving(false);
      setTimeout(() => setCustomMessage(null), 4000);
    }
  };

  const handleSaveCategories = async () => {
    try {
      setCustomSaving(true);
      await updateCategories(editCategories, editCategoryLabel);
      await refreshConfig();
      setCustomMessage('Categories saved successfully!');
    } catch (err) {
      setCustomMessage('Failed to save categories');
    } finally {
      setCustomSaving(false);
      setTimeout(() => setCustomMessage(null), 4000);
    }
  };

  const handleSaveAppointmentTypes = async () => {
    try {
      setCustomSaving(true);
      await updateAppointmentTypes(editAppointmentTypes, editAppointmentLabel);
      await refreshConfig();
      setCustomMessage('Appointment types saved successfully!');
    } catch (err) {
      setCustomMessage('Failed to save appointment types');
    } finally {
      setCustomSaving(false);
      setTimeout(() => setCustomMessage(null), 4000);
    }
  };

  const handleSaveLocationLabel = async () => {
    try {
      setCustomSaving(true);
      await updateLocationLabel(editLocationLabel);
      await refreshConfig();
      setCustomMessage('Location label saved successfully!');
    } catch (err) {
      setCustomMessage('Failed to save location label');
    } finally {
      setCustomSaving(false);
      setTimeout(() => setCustomMessage(null), 4000);
    }
  };

  const addCategory = () => {
    const newOrder = editCategories.length;
    setEditCategories([...editCategories, { key: '', label: '', isActive: true, order: newOrder }]);
  };

  const removeCategory = (index: number) => {
    setEditCategories(editCategories.filter((_, i) => i !== index));
  };

  const updateCategoryItem = (index: number, field: keyof CategoryItem, value: string | boolean | number) => {
    const updated = [...editCategories];
    (updated[index] as any)[field] = value;
    if (field === 'label' && typeof value === 'string') {
      updated[index].key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }
    setEditCategories(updated);
  };

  const addAppointmentType = () => {
    const newOrder = editAppointmentTypes.length;
    setEditAppointmentTypes([...editAppointmentTypes, { key: '', label: '', isActive: true, order: newOrder }]);
  };

  const removeAppointmentType = (index: number) => {
    setEditAppointmentTypes(editAppointmentTypes.filter((_, i) => i !== index));
  };

  const updateAppointmentItem = (index: number, field: keyof AppointmentType, value: string | boolean | number) => {
    const updated = [...editAppointmentTypes];
    (updated[index] as any)[field] = value;
    if (field === 'label' && typeof value === 'string') {
      updated[index].key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }
    setEditAppointmentTypes(updated);
  };

  // Lead Status Pipeline handlers
  const addLeadStatus = () => {
    const newOrder = editLeadStatuses.length;
    setEditLeadStatuses([...editLeadStatuses, { key: '', label: '', color: '#6b7280', isActive: true, isClosed: false, order: newOrder }]);
  };

  const removeLeadStatus = (index: number) => {
    setEditLeadStatuses(editLeadStatuses.filter((_, i) => i !== index));
  };

  const updateLeadStatusItem = (index: number, field: keyof LeadStatus, value: string | boolean | number) => {
    const updated = [...editLeadStatuses];
    (updated[index] as any)[field] = value;
    if (field === 'label' && typeof value === 'string') {
      // For status keys, use Title Case (to match existing key conventions like "Call Attended")
      updated[index].key = value.trim();
    }
    setEditLeadStatuses(updated);
  };

  const handleSaveLeadStatuses = async () => {
    try {
      setCustomSaving(true);
      await updateLeadStatuses(editLeadStatuses);
      await refreshConfig();
      setCustomMessage('Lead status pipeline saved successfully!');
    } catch (err: any) {
      setCustomMessage(err?.response?.data?.error || 'Failed to save lead statuses');
    } finally {
      setCustomSaving(false);
      setTimeout(() => setCustomMessage(null), 4000);
    }
  };

  const loadStatusUsage = async () => {
    if (!statusUsageLoaded) {
      try {
        const usage = await getStatusUsage();
        setStatusUsage(usage);
        setStatusUsageLoaded(true);
      } catch (err) {
        console.error('Failed to load status usage', err);
      }
    }
  };

  const [profile, setProfile] = useState<Profile>({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1 (555) 123-4567',
    timezone: 'Eastern Time (ET)',
    avatar: ''
  });
  const [organization, setOrganization] = useState<any>({
    name: 'Your Organization',
    logoUrl: '',
    logoDataUrl: ''
  });
  const [orgLoading, setOrgLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Email SMTP settings state
  const [emailSettings, setEmailSettings] = useState({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    fromName: ''
  });
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  // Lead Assignment Settings
  const [assignmentSettings, setAssignmentSettings] = useState({
    autoAssignEnabled: true,
    roundRobinEnabled: true,
    propertyMatchingEnabled: true,
    locationMatchingEnabled: true,
    workloadBalancingEnabled: true,
    highValueThreshold: 5000000 // ₹50L default
  });

  // Load email settings on mount
  useEffect(() => {
    const loadEmailSettings = async () => {
      try {
        setEmailLoading(true);
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/organization/email-settings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.emailSettings) {
            setEmailSettings({
              host: data.emailSettings.host || 'smtp.gmail.com',
              port: data.emailSettings.port || 587,
              secure: data.emailSettings.secure || false,
              user: data.emailSettings.user || '',
              pass: data.emailSettings.pass || '',
              fromName: data.emailSettings.fromName || ''
            });
            setEmailConfigured(data.emailSettings.isConfigured || false);
          }
        }
      } catch (err) {
        console.error('Failed to load email settings:', err);
      } finally {
        setEmailLoading(false);
      }
    };
    loadEmailSettings();
  }, []);

  const handleSaveEmailSettings = async () => {
    if (!emailSettings.host || !emailSettings.user || !emailSettings.pass) {
      setEmailMessage({ type: 'error', text: 'SMTP host, email, and password are required.' });
      return;
    }
    try {
      setEmailSaving(true);
      setEmailMessage(null);
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/organization/email-settings', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailSettings)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailConfigured(true);
        setEmailMessage({ type: 'success', text: 'Email settings saved successfully!' });
        if (data.emailSettings) {
          setEmailSettings(prev => ({ ...prev, pass: data.emailSettings.pass }));
        }
      } else {
        setEmailMessage({ type: 'error', text: data.error || 'Failed to save email settings.' });
      }
    } catch (err) {
      setEmailMessage({ type: 'error', text: 'Failed to save email settings.' });
    } finally {
      setEmailSaving(false);
      setTimeout(() => setEmailMessage(null), 5000);
    }
  };

  const handleTestEmailSettings = async () => {
    if (!emailSettings.host || !emailSettings.user || !emailSettings.pass) {
      setEmailMessage({ type: 'error', text: 'Please fill in all SMTP fields before testing.' });
      return;
    }
    try {
      setEmailTesting(true);
      setEmailMessage(null);
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/organization/email-settings/test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailSettings)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailMessage({ type: 'success', text: 'Test email sent! Check your inbox.' });
      } else {
        setEmailMessage({ type: 'error', text: data.error || 'Test failed. Check your SMTP settings.' });
      }
    } catch (err) {
      setEmailMessage({ type: 'error', text: 'Test failed. Check your SMTP settings.' });
    } finally {
      setEmailTesting(false);
      setTimeout(() => setEmailMessage(null), 8000);
    }
  };

  useEffect(() => {
    fetchTeamMembers();
    loadData();
  }, []);

  // Load organization and user profile on mount
  const loadData = async () => {
    try {
      // Load organization
      const response = await fetch('/api/organization/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (response.ok) {
        const data = await response.json();
        setOrganization(data.organization || organization);
      }

      // Load user profile from /auth/me
      const userResponse = await fetch('/auth/me', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (userResponse.ok) {
        const userData = await userResponse.json();
        if (userData.user) {
          setProfile({
            firstName: userData.user.name?.split(' ')[0] || 'User',
            lastName: userData.user.name?.split(' ').slice(1).join(' ') || '',
            email: userData.user.email || '',
            phone: userData.user.phone || '',
            timezone: userData.organization?.settings?.timezone || 'Eastern Time (ET)',
            avatar: userData.organization?.logoDataUrl || ''
          });
        }
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    } finally {
      setOrgLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      setLoadingTeam(true);
      const users = await getUsers();
      setTeamMembers(users);
    } catch (error) {
      console.error('Failed to fetch team members:', error);
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleInviteMember = () => {
    const email = prompt('Enter email address of the new member:');
    if (email) {
      const newMember = {
        id: Date.now(),
        name: 'New Member',
        email,
        role: 'Member',
        status: 'Pending'
      };
      setTeamMembers([...teamMembers, newMember]);
    }
  };

  const handleDeleteMember = (id: number) => {
    if (confirm('Are you sure you want to remove this team member?')) {
      setTeamMembers(teamMembers.filter(m => m.id !== id));
    }
  };

  const handleRoleChange = (id: number, newRole: string) => {
    setTeamMembers(teamMembers.map(m =>
      m.id === id ? { ...m, role: newRole } : m
    ));
  };

  const [crmSettings, setCrmSettings] = useState({
    leadScoring: true,
    duplicateDetection: true
  });

  const [sourceMappings, setSourceMappings] = useState<SourceMapping[]>([
    { id: 1, source: 'meta_ads', mapTo: 'Facebook', status: 'Active' },
    { id: 2, source: 'google_ads', mapTo: 'Google AdWords', status: 'Active' },
    { id: 3, source: 'website', mapTo: 'Website', status: 'Active' },
    { id: 4, source: 'tiktok', mapTo: 'TikTok', status: 'Inactive' },
  ]);

  const handleAddSource = () => {
    const source = prompt('Enter lead source code (e.g., linkedin_ads):');
    if (!source) return;

    const mapTo = prompt('Enter Zoho CRM field value (e.g., LinkedIn):');
    if (!mapTo) return;

    const newMapping = {
      id: Date.now(),
      source,
      mapTo,
      status: 'Active'
    };
    setSourceMappings([...sourceMappings, newMapping]);
  };

  const handleToggleSourceStatus = (id: number) => {
    setSourceMappings(sourceMappings.map(m =>
      m.id === id ? { ...m, status: m.status === 'Active' ? 'Inactive' : 'Active' } : m
    ));
  };

  const handleSaveCrmSettings = () => {
    console.log('Saving CRM settings:', { crmSettings, sourceMappings });
    alert('CRM settings saved successfully!');
  };

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([
    { id: 1, name: 'Lead Assignment', trigger: 'New Lead Created', action: 'Assign to Round Robin', enabled: true },
    { id: 2, name: 'High Value Alert', trigger: 'Deal Value > $10k', action: 'Notify Manager', enabled: true },
    { id: 3, name: 'Stagnant Lead', trigger: 'No Activity for 3 Days', action: 'Send Email Reminder', enabled: false }
  ]);

  const toggleAutomationRule = (id: number) => {
    setAutomationRules(prev => prev.map(rule =>
      rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
    ));
  };

  const handleDeleteRule = (id: number) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      setAutomationRules(prev => prev.filter(rule => rule.id !== id));
    }
  };

  const handleCreateRule = () => {
    const name = prompt('Enter rule name:');
    if (!name) return;

    // Simplification for demo: just adding a generic rule with the provided name
    const newRule = {
      id: Date.now(),
      name,
      trigger: 'Manual Trigger',
      action: 'Log Action',
      enabled: true
    };
    setAutomationRules(prev => [...prev, newRule]);
  };

  const handleConfigureZoho = () => {
    setShowZohoModal(true);
  };

  // Zoho CRM Configuration State
  const [showZohoModal, setShowZohoModal] = useState(false);
  const [zohoConfig, setZohoConfig] = useState({
    clientId: '',
    clientSecret: '',
    refreshToken: '',
    dataCenter: 'in',
    isConnected: false,
    lastSyncAt: null as string | null,
    lastError: null as string | null
  });
  const [zohoDataCenters, setZohoDataCenters] = useState([
    { code: 'in', name: 'India' },
    { code: 'com', name: 'United States' },
    { code: 'eu', name: 'Europe' },
    { code: 'au', name: 'Australia' },
    { code: 'jp', name: 'Japan' }
  ]);
  const [loadingZohoConfig, setLoadingZohoConfig] = useState(false);
  const [savingZohoConfig, setSavingZohoConfig] = useState(false);
  const [testingZohoConnection, setTestingZohoConnection] = useState(false);
  const [zohoTestResult, setZohoTestResult] = useState<any>(null);
  const [showZohoSecrets, setShowZohoSecrets] = useState({
    clientSecret: false,
    refreshToken: false
  });
  const [zohoOAuthStatus, setZohoOAuthStatus] = useState<any>(null);
  const [checkingOAuthStatus, setCheckingOAuthStatus] = useState(false);

  // ElevenLabs Configuration State
  const [showElevenLabsModal, setShowElevenLabsModal] = useState(false);
  const [elevenLabsConfig, setElevenLabsConfig] = useState({
    apiKey: '',
    agentId: '',
    phoneNumberId: '',
    isConnected: false,
    lastTestedAt: null as string | null,
    lastError: null as string | null
  });
  const [loadingElevenLabsConfig, setLoadingElevenLabsConfig] = useState(false);
  const [savingElevenLabsConfig, setSavingElevenLabsConfig] = useState(false);
  const [testingElevenLabsConnection, setTestingElevenLabsConnection] = useState(false);
  const [elevenLabsTestResult, setElevenLabsTestResult] = useState<any>(null);
  const [showElevenLabsApiKey, setShowElevenLabsApiKey] = useState(false);

  // Load Zoho config on mount
  useEffect(() => {
    loadZohoConfig();
    checkZohoOAuthStatus();
    loadElevenLabsConfig();
    handleLoadWhatsappSettings();
  }, []);

  // Check for OAuth callback success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('zoho_connected') === 'true') {
      alert('🎉 Zoho CRM connected successfully via OAuth!');
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
      checkZohoOAuthStatus();
      loadZohoConfig();
    } else if (params.get('zoho_error')) {
      alert('❌ Failed to connect Zoho: ' + params.get('zoho_error'));
      window.history.replaceState({}, '', window.location.pathname + '?tab=integrations');
    }
  }, []);

  const checkZohoOAuthStatus = async () => {
    try {
      setCheckingOAuthStatus(true);
      const api = await import('../../services/api');
      const response = await api.default.get('/auth/zoho/status');
      setZohoOAuthStatus(response.data);
    } catch (error) {
      console.error('Error checking Zoho OAuth status:', error);
    } finally {
      setCheckingOAuthStatus(false);
    }
  };

  const handleConnectZohoOAuth = () => {
    // Get current user ID from JWT token
    const token = localStorage.getItem('accessToken');
    let userId = 'demo';
    
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        userId = payload.userId;
      } catch {
        console.error('Failed to decode JWT token');
      }
    }
    
    // Simple redirect - no credentials needed from customer!
    const backendUrl = import.meta.env.VITE_API_URL || '';
    window.location.href = `${backendUrl}/auth/zoho/connect?dc=${zohoConfig.dataCenter}&userId=${userId}`;
  };

  const handleDisconnectZohoOAuth = async () => {
    if (!confirm('Are you sure you want to disconnect Zoho CRM?')) return;
    
    try {
      const api = await import('../../services/api');
      await api.default.delete('/auth/zoho/disconnect');
      setZohoOAuthStatus(null);
      alert('Zoho CRM disconnected successfully');
    } catch (error: any) {
      alert('Failed to disconnect: ' + (error.response?.data?.error || error.message));
    }
  };

  const loadZohoConfig = async () => {
    try {
      setLoadingZohoConfig(true);
      const api = await import('../../services/api');
      const response = await api.default.get('/api/integrations/zoho/config');
      if (response.data.success) {
        setZohoConfig(prev => ({
          ...prev,
          ...response.data.data,
          // Don't override form fields if masked
          clientId: response.data.data.clientId?.includes('•') ? prev.clientId : (response.data.data.clientId || ''),
        }));
        if (response.data.dataCenters) {
          setZohoDataCenters(response.data.dataCenters);
        }
      }
    } catch (error) {
      console.error('Error loading Zoho config:', error);
    } finally {
      setLoadingZohoConfig(false);
    }
  };

  const handleSaveZohoConfig = async () => {
    if (!zohoConfig.clientId || !zohoConfig.clientSecret || !zohoConfig.refreshToken) {
      alert('Please fill in all required fields: Client ID, Client Secret, and Refresh Token');
      return;
    }

    try {
      setSavingZohoConfig(true);
      const api = await import('../../services/api');
      const response = await api.default.post('/api/integrations/zoho/config', {
        clientId: zohoConfig.clientId,
        clientSecret: zohoConfig.clientSecret,
        refreshToken: zohoConfig.refreshToken,
        dataCenter: zohoConfig.dataCenter
      });
      
      if (response.data.success) {
        alert('Zoho credentials saved! Click "Test Connection" to verify.');
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save Zoho configuration');
    } finally {
      setSavingZohoConfig(false);
    }
  };

  const handleTestZohoConnection = async () => {
    try {
      setTestingZohoConnection(true);
      setZohoTestResult(null);
      const api = await import('../../services/api');
      const response = await api.default.post('/api/integrations/zoho/test', {
        clientId: zohoConfig.clientId,
        clientSecret: zohoConfig.clientSecret,
        refreshToken: zohoConfig.refreshToken,
        dataCenter: zohoConfig.dataCenter
      });
      
      setZohoTestResult(response.data);
      if (response.data.success) {
        setZohoConfig(prev => ({ ...prev, isConnected: true, lastError: null }));
        loadZohoConfig(); // Reload to get updated status
      }
    } catch (error: any) {
      setZohoTestResult({ 
        success: false, 
        error: error.response?.data?.error || 'Connection test failed' 
      });
    } finally {
      setTestingZohoConnection(false);
    }
  };

  const handleDisconnectZoho = async () => {
    if (!confirm('Are you sure you want to disconnect Zoho CRM? This will remove your saved credentials.')) {
      return;
    }
    try {
      const api = await import('../../services/api');
      await api.default.delete('/api/integrations/zoho/disconnect');
      setZohoConfig({
        clientId: '',
        clientSecret: '',
        refreshToken: '',
        dataCenter: 'in',
        isConnected: false,
        lastSyncAt: null,
        lastError: null
      });
      setZohoTestResult(null);
      setShowZohoModal(false);
      alert('Zoho CRM disconnected successfully');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to disconnect');
    }
  };

  // ElevenLabs Functions
  const loadElevenLabsConfig = async () => {
    try {
      setLoadingElevenLabsConfig(true);
      const api = await import('../../services/api');
      const response = await api.default.get('/api/integrations/elevenlabs/config');
      if (response.data.success) {
        setElevenLabsConfig(prev => ({
          ...prev,
          ...response.data.data,
          apiKey: response.data.data.apiKey?.includes('•') ? prev.apiKey : (response.data.data.apiKey || ''),
        }));
      }
    } catch (error) {
      console.error('Error loading ElevenLabs config:', error);
    } finally {
      setLoadingElevenLabsConfig(false);
    }
  };

  const handleSaveElevenLabsConfig = async () => {
    if (!elevenLabsConfig.apiKey || !elevenLabsConfig.agentId) {
      alert('Please fill in API Key and Agent ID');
      return;
    }

    try {
      setSavingElevenLabsConfig(true);
      const api = await import('../../services/api');
      const response = await api.default.post('/api/integrations/elevenlabs/config', {
        apiKey: elevenLabsConfig.apiKey,
        agentId: elevenLabsConfig.agentId,
        phoneNumberId: elevenLabsConfig.phoneNumberId
      });
      
      if (response.data.success) {
        alert('ElevenLabs configuration saved! Click "Test Connection" to verify.');
        loadElevenLabsConfig();
      } else {
        throw new Error(response.data.error);
      }
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save ElevenLabs configuration');
    } finally {
      setSavingElevenLabsConfig(false);
    }
  };

  const handleTestElevenLabsConnection = async () => {
    try {
      setTestingElevenLabsConnection(true);
      setElevenLabsTestResult(null);
      const api = await import('../../services/api');
      const response = await api.default.post('/api/integrations/elevenlabs/test');
      
      setElevenLabsTestResult({
        success: response.data.success,
        message: response.data.message,
        data: response.data.data
      });
      
      if (response.data.success) {
        loadElevenLabsConfig();
      }
    } catch (error: any) {
      setElevenLabsTestResult({
        success: false,
        message: error.response?.data?.error || 'Connection test failed'
      });
    } finally {
      setTestingElevenLabsConnection(false);
    }
  };

  const handleDisconnectElevenLabs = async () => {
    if (!confirm('Are you sure you want to disconnect ElevenLabs? This will remove your saved credentials.')) {
      return;
    }
    try {
      const api = await import('../../services/api');
      await api.default.delete('/api/integrations/elevenlabs/disconnect');
      setElevenLabsConfig({
        apiKey: '',
        agentId: '',
        phoneNumberId: '',
        isConnected: false,
        lastTestedAt: null,
        lastError: null
      });
      setElevenLabsTestResult(null);
      setShowElevenLabsModal(false);
      alert('ElevenLabs disconnected successfully');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to disconnect');
    }
  };

  const handleConfigureElevenLabs = () => {
    setShowElevenLabsModal(true);
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    return searchParams.get('tab') || 'profile';
  });

  // Sync activeTab with URL changes
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const [integrations, setIntegrations] = useState<Integration[]>([
    { name: 'Slack', description: 'Send lead notifications to Slack channels', icon: '💬', connected: false },
    { name: 'Gmail', description: 'Sync emails and calendar', icon: '📧', connected: false },
    { name: 'Zapier', description: 'Connect with 3000+ apps', icon: '⚡', connected: false },
  ]);

  const handleConnectIntegration = (name: string) => {
    setIntegrations(prev => prev.map(int =>
      int.name === name ? { ...int, connected: !int.connected } : int
    ));
    const integration = integrations.find(i => i.name === name);
    if (integration && !integration.connected) {
      alert(`${name} connected successfully!`);
    } else {
      alert(`${name} disconnected.`);
    }
  };

  const [slackWebhook, setSlackWebhook] = useState('');

  // WhatsApp/Meta Business API Settings
  const [whatsappSettings, setWhatsappSettings] = useState({
    provider: 'meta' as 'meta' | 'twilio',
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookUrl: '',
    verifyToken: '',
    appId: '',
    appSecret: '',
    // Twilio fields
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioWhatsappNumber: '',
    enabled: false,
    testingEnabled: false,
    isConnected: false,
    lastTestedAt: null as string | null,
    lastError: null as string | null
  });

  const [loadingWhatsappSettings, setLoadingWhatsappSettings] = useState(false);
  const [savingWhatsappSettings, setSavingWhatsappSettings] = useState(false);
  const [testingWhatsappConnection, setTestingWhatsappConnection] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState<any>(null);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showWhatsAppAccessToken, setShowWhatsAppAccessToken] = useState(false);
  const [showWhatsAppAppSecret, setShowWhatsAppAppSecret] = useState(false);
  const [showTwilioAuthToken, setShowTwilioAuthToken] = useState(false);

  const handleSaveSlackWebhook = () => {
    if (!slackWebhook) {
      alert('Please enter a valid Slack Webhook URL');
      return;
    }
    console.log('Saving Slack Webhook:', slackWebhook);
    alert('Slack Webhook URL saved successfully!');
  };

  const handleChangePlan = () => {
    alert('Subscription usage: 45/Unlimited leads.\n\nTo change your plan, please contact support or visit the billing portal.');
  };

  const handleUpdatePaymentMethod = () => {
    alert('Redirecting to secure payment provider...');
  };

  const handleDownloadInvoice = (invoice: Invoice) => {
    alert(`Downloading invoice for ${invoice.date} (${invoice.amount})...`);
  };

  // WhatsApp Settings Handlers
  const handleWhatsappSettingChange = (field: string, value: string | boolean) => {
    setWhatsappSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveWhatsappSettings = async () => {
    if (whatsappSettings.provider === 'meta' && !whatsappSettings.accessToken) {
      alert('Please enter your Meta Access Token');
      return;
    }
    if (whatsappSettings.provider === 'twilio' && (!whatsappSettings.twilioAccountSid || !whatsappSettings.twilioAuthToken)) {
      alert('Please enter your Twilio Account SID and Auth Token');
      return;
    }
    setSavingWhatsappSettings(true);
    try {
      const api = await import('../../services/api');
      const payload: any = { provider: whatsappSettings.provider };
      if (whatsappSettings.provider === 'meta') {
        payload.accessToken = whatsappSettings.accessToken;
        payload.phoneNumberId = whatsappSettings.phoneNumberId;
        payload.businessAccountId = whatsappSettings.businessAccountId;
        payload.appId = whatsappSettings.appId;
        payload.appSecret = whatsappSettings.appSecret;
        payload.verifyToken = whatsappSettings.verifyToken;
        payload.webhookUrl = whatsappSettings.webhookUrl;
      } else {
        payload.twilioAccountSid = whatsappSettings.twilioAccountSid;
        payload.twilioAuthToken = whatsappSettings.twilioAuthToken;
        payload.twilioWhatsappNumber = whatsappSettings.twilioWhatsappNumber;
      }
      const response = await api.default.post('/api/settings/api/whatsapp', payload);
      
      if (response.data.success) {
        const disc = response.data.discovered;
        if (disc && whatsappSettings.provider === 'meta') {
          setWhatsappSettings(prev => ({
            ...prev,
            phoneNumberId: disc.phoneNumberId || prev.phoneNumberId,
            businessAccountId: disc.businessAccountId || prev.businessAccountId
          }));
        }
        alert(whatsappSettings.provider === 'twilio'
          ? 'Twilio WhatsApp connected successfully!'
          : disc?.phoneDisplay
            ? `WhatsApp connected! Phone: ${disc.phoneDisplay}${disc.businessName ? ` (${disc.businessName})` : ''}`
            : 'WhatsApp configuration saved! Click "Test Connection" to verify.'
        );
        handleLoadWhatsappSettings();
      } else {
        throw new Error(response.data.error || 'Failed to save settings');
      }
    } catch (error: any) {
      console.error('Error saving WhatsApp settings:', error);
      alert(error.response?.data?.error || 'Failed to save WhatsApp settings. Please try again.');
    } finally {
      setSavingWhatsappSettings(false);
    }
  };

  const handleTestWhatsappConnection = async () => {
    setTestingWhatsappConnection(true);
    setWhatsappTestResult(null);
    try {
      const api = await import('../../services/api');
      const response = await api.default.post('/api/settings/api/whatsapp/test');
      
      setWhatsappTestResult({
        success: response.data.success,
        message: response.data.message,
        data: response.data.phoneInfo
      });
      
      if (response.data.success) {
        handleLoadWhatsappSettings();
      }
    } catch (error: any) {
      console.error('Error testing WhatsApp connection:', error);
      setWhatsappTestResult({ 
        success: false, 
        message: error.response?.data?.error || 'Connection test failed' 
      });
    } finally {
      setTestingWhatsappConnection(false);
    }
  };

  const handleLoadWhatsappSettings = async () => {
    try {
      setLoadingWhatsappSettings(true);
      const api = await import('../../services/api');
      const response = await api.default.get('/api/settings/api/credentials/whatsapp');
      if (response.data.success && response.data.credentials) {
        const creds = response.data.credentials;
        setWhatsappSettings(prev => ({
          ...prev,
          provider: creds.provider || 'meta',
          accessToken: creds.accessToken?.includes('•') ? prev.accessToken : (creds.accessToken || ''),
          phoneNumberId: creds.phoneNumberId || '',
          businessAccountId: creds.businessAccountId || '',
          appId: creds.appId || '',
          twilioAccountSid: creds.twilioAccountSid?.includes('•') ? prev.twilioAccountSid : (creds.twilioAccountSid || ''),
          twilioAuthToken: creds.twilioAuthToken?.includes('•') ? prev.twilioAuthToken : (creds.twilioAuthToken || ''),
          twilioWhatsappNumber: creds.twilioWhatsappNumber || '',
          isConnected: creds.isConnected || false,
          enabled: creds.enabled || false,
          lastTestedAt: creds.lastTestedAt || null,
        }));
      }
    } catch (error) {
      console.error('Error loading WhatsApp settings:', error);
    } finally {
      setLoadingWhatsappSettings(false);
    }
  };

  const handleDisconnectWhatsapp = async () => {
    if (!confirm('Are you sure you want to disconnect WhatsApp? This will remove your saved credentials.')) {
      return;
    }
    try {
      const api = await import('../../services/api');
      await api.default.delete('/api/settings/api/credentials/whatsapp');
      setWhatsappSettings({
        provider: 'meta',
        accessToken: '',
        phoneNumberId: '',
        businessAccountId: '',
        webhookUrl: '',
        verifyToken: '',
        appId: '',
        appSecret: '',
        twilioAccountSid: '',
        twilioAuthToken: '',
        twilioWhatsappNumber: '',
        enabled: false,
        testingEnabled: false,
        isConnected: false,
        lastTestedAt: null,
        lastError: null
      });
      setWhatsappTestResult(null);
      alert('WhatsApp disconnected successfully');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to disconnect');
    }
  };

  // Load WhatsApp settings on component mount - handled in main useEffect

  const fileInputRef = useRef<HTMLInputElement>(null);
  const orgFileInputRef = useRef<HTMLInputElement>(null);

  const handleProfileChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setProfile(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handlePhotoClick = () => {
    orgFileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/organization/update-profile', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.organization?.logoDataUrl) {
          setOrganization(prev => ({
            ...prev,
            logoDataUrl: data.organization.logoDataUrl
          }));
          setProfile(prev => ({
            ...prev,
            avatar: data.organization.logoDataUrl
          }));
          alert('Logo updated successfully!');
        }
      } else {
        const error = await response.json();
        alert('Failed to upload logo: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveProfile = () => {
    // In a real app, this would make an API call
    console.log('Saving profile:', profile);
    alert('Profile changes saved successfully!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your account and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="approvals">User Approvals</TabsTrigger>
          <TabsTrigger value="customization">Customization</TabsTrigger>
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarFallback>{organization.name?.charAt(0) || 'O'}</AvatarFallback>
                  {(organization.logoDataUrl || profile.avatar) && <img src={organization.logoDataUrl || profile.avatar} alt="Organization" className="h-full w-full object-cover" />}
                </Avatar>
                <div>
                  <input
                    type="file"
                    ref={orgFileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif, image/webp"
                    onChange={handleFileChange}
                  />
                  <Button variant="outline" onClick={handlePhotoClick} disabled={uploadingLogo}>
                    {uploadingLogo ? 'Uploading...' : 'Change Organization Logo'}
                  </Button>
                  <p className="text-sm text-gray-500 mt-2">Organization Logo - JPG, PNG, GIF or WebP. Max size 2MB</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input id="orgName" value={organization.name} disabled />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">ℹ️ To update your profile details, please contact your organization administrator.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name (Read-only)</Label>
                  <Input id="firstName" value={profile.firstName} onChange={handleProfileChange} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name (Read-only)</Label>
                  <Input id="lastName" value={profile.lastName} onChange={handleProfileChange} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (Read-only)</Label>
                  <Input id="email" type="email" value={profile.email} onChange={handleProfileChange} disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone (Read-only)</Label>
                  <Input id="phone" type="tel" value={profile.phone} onChange={handleProfileChange} disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone (Read-only)</Label>
                <select
                  id="timezone"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={profile.timezone}
                  onChange={handleProfileChange}
                  disabled
                >
                  <option>Asia/Kolkata</option>
                  <option>Eastern Time (ET)</option>
                  <option>Central Time (CT)</option>
                  <option>Mountain Time (MT)</option>
                  <option>Pacific Time (PT)</option>
                  <option>UTC</option>
                </select>
              </div>

              <Button onClick={handleSaveProfile}>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team Members</CardTitle>
              <Button onClick={handleInviteMember}>
                <Plus className="h-4 w-4 mr-2" />
                Invite Member
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingTeam ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-600">Loading team members...</span>
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No team members found
                  </div>
                ) : (
                  teamMembers.map((member) => (
                    <div key={member._id || member.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Avatar>
                          <AvatarFallback>
                            {member.name ? member.name.split(' ').map(n => n[0]).join('').toUpperCase() : member.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-semibold">{member.name || member.email.split('@')[0]}</div>
                          <div className="text-sm text-gray-600">{member.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm capitalize">
                          {member.role}
                        </span>
                        <span className="text-sm text-gray-600 w-16 text-center capitalize">{member.status || 'Active'}</span>
                        <div className="text-xs text-gray-500">
                          {member.createdAt && `Joined ${new Date(member.createdAt).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Pending User Approvals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                Review and approve new agent registrations. Agents need approval before they can access the system.
              </p>
              <Link to="/settings/users">
                <Button className="w-full">
                  <UserCheck className="h-4 w-4 mr-2" />
                  Go to User Management
                </Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customization">
          <div className="space-y-6">
            {/* Status Message */}
            {customMessage && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                customMessage.includes('Failed') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                {customMessage.includes('Failed') ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {customMessage}
              </div>
            )}

            {/* Industry Selector */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5" />
                  Industry
                </CardTitle>
                <p className="text-sm text-gray-500">Choose your industry to get pre-configured labels and options. Changing this resets categories and appointment types to industry defaults.</p>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedIndustry}
                  onChange={(e) => handleIndustryChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={customSaving}
                >
                  {INDUSTRIES.map(ind => (
                    <option key={ind.value} value={ind.value}>{ind.label}</option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Category Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Categories</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Configure the category dropdown shown on leads. Rename the field label to match your business (e.g. "Property Type", "Product", "Service Plan").</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addCategory}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Field Label */}
                <div>
                  <Label htmlFor="categoryLabel" className="text-sm font-medium">Field Label</Label>
                  <Input
                    id="categoryLabel"
                    value={editCategoryLabel}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditCategoryLabel(e.target.value)}
                    placeholder="e.g. Property Type, Product, Plan"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-1">This label appears across the entire CRM wherever categories are shown.</p>
                </div>

                {/* Category Items */}
                <div className="space-y-2">
                  {editCategories.map((cat, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                      <Input
                        value={cat.label}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateCategoryItem(index, 'label', e.target.value)}
                        placeholder="Category name"
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 font-mono min-w-[80px]">{cat.key || '...'}</span>
                      <Switch
                        checked={cat.isActive}
                        onCheckedChange={(checked) => updateCategoryItem(index, 'isActive', checked)}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeCategory(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {editCategories.length === 0 && (
                    <div className="text-center py-6 text-gray-400">No categories configured. Click "Add" to create one.</div>
                  )}
                </div>

                <Button onClick={handleSaveCategories} disabled={customSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {customSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Categories
                </Button>
              </CardContent>
            </Card>

            {/* Appointment Types Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Appointment Types</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Configure the types of appointments/meetings your team schedules. Rename the field label (e.g. "Site Visit", "Meeting", "Consultation").</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={addAppointmentType}>
                    <Plus className="h-4 w-4 mr-1" /> Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Field Label */}
                <div>
                  <Label htmlFor="appointmentLabel" className="text-sm font-medium">Field Label</Label>
                  <Input
                    id="appointmentLabel"
                    value={editAppointmentLabel}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditAppointmentLabel(e.target.value)}
                    placeholder="e.g. Site Visit, Meeting, Appointment"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-1">This label appears across Dashboard, Calendar, Lead details, etc.</p>
                </div>

                {/* Appointment Type Items */}
                <div className="space-y-2">
                  {editAppointmentTypes.map((apt, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                      <Input
                        value={apt.label}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateAppointmentItem(index, 'label', e.target.value)}
                        placeholder="Appointment type name"
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 font-mono min-w-[80px]">{apt.key || '...'}</span>
                      <Switch
                        checked={apt.isActive}
                        onCheckedChange={(checked) => updateAppointmentItem(index, 'isActive', checked)}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeAppointmentType(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {editAppointmentTypes.length === 0 && (
                    <div className="text-center py-6 text-gray-400">No appointment types configured. Click "Add" to create one.</div>
                  )}
                </div>

                <Button onClick={handleSaveAppointmentTypes} disabled={customSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {customSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Appointment Types
                </Button>
              </CardContent>
            </Card>

            {/* Lead Status Pipeline Configuration */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lead Status Pipeline</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Define the stages leads move through in your sales funnel. Customize labels, colors, and order to match your workflow.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={loadStatusUsage}>
                      <Eye className="h-4 w-4 mr-1" /> Usage
                    </Button>
                    <Button variant="outline" size="sm" onClick={addLeadStatus}>
                      <Plus className="h-4 w-4 mr-1" /> Add Stage
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Status Items */}
                <div className="space-y-2">
                  {editLeadStatuses.map((status, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <GripVertical className="h-4 w-4 text-gray-400 cursor-grab" />
                      {/* Color Picker */}
                      <input
                        type="color"
                        value={status.color || '#6b7280'}
                        onChange={(e) => updateLeadStatusItem(index, 'color', e.target.value)}
                        className="w-8 h-8 rounded border border-gray-300 cursor-pointer p-0"
                        title="Status color"
                      />
                      {/* Label */}
                      <Input
                        value={status.label}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateLeadStatusItem(index, 'label', e.target.value)}
                        placeholder="Status name (e.g. Qualified, Demo Booked)"
                        className="flex-1"
                      />
                      {/* Key */}
                      <span className="text-xs text-gray-400 font-mono min-w-[100px] truncate" title={status.key}>{status.key || '...'}</span>
                      {/* Usage count */}
                      {statusUsageLoaded && (
                        <span className="text-xs text-gray-500 min-w-[40px] text-right" title="Leads with this status">
                          {statusUsage[status.key] || 0} leads
                        </span>
                      )}
                      {/* Is Closed toggle */}
                      <div className="flex items-center gap-1" title="Mark as closed/won/lost stage">
                        <span className="text-xs text-gray-400">Closed</span>
                        <Switch
                          checked={status.isClosed}
                          onCheckedChange={(checked) => updateLeadStatusItem(index, 'isClosed', checked)}
                        />
                      </div>
                      {/* Active toggle */}
                      <Switch
                        checked={status.isActive}
                        onCheckedChange={(checked) => updateLeadStatusItem(index, 'isActive', checked)}
                      />
                      {/* Delete */}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeLeadStatus(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {editLeadStatuses.length === 0 && (
                    <div className="text-center py-6 text-gray-400">No lead statuses configured. Click "Add Stage" to create one.</div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Stages marked as "Closed" represent won/lost outcomes (e.g. Deal Closed, Lost). At least 2 stages required.</p>
                  <Button onClick={handleSaveLeadStatuses} disabled={customSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                    {customSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                    Save Pipeline
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Location Field Label */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{locationFieldLabel} Field Label</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Rename the location field to match your business (e.g. "Location", "Service Area", "Region", "Campus").</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="locationLabel" className="text-sm font-medium">Field Label</Label>
                  <Input
                    id="locationLabel"
                    value={editLocationLabel}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEditLocationLabel(e.target.value)}
                    placeholder="e.g. Location, Service Area, Region"
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-1">This label appears across the entire CRM wherever the location field is shown.</p>
                </div>

                <Button onClick={handleSaveLocationLabel} disabled={customSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {customSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save {locationFieldLabel} Label
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="crm">
          <Card>
            <CardHeader>
              <CardTitle>CRM Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Lead Scoring</div>
                    <div className="text-sm text-gray-600">Automatically score leads based on engagement</div>
                  </div>
                  <Switch
                    checked={crmSettings.leadScoring}
                    onCheckedChange={(checked) => setCrmSettings(prev => ({ ...prev, leadScoring: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">Duplicate Detection</div>
                    <div className="text-sm text-gray-600">Prevent duplicate leads from being created</div>
                  </div>
                  <Switch
                    checked={crmSettings.duplicateDetection}
                    onCheckedChange={(checked) => setCrmSettings(prev => ({ ...prev, duplicateDetection: checked }))}
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-medium">Lead Source Mapping</h3>
                    <p className="text-sm text-gray-500">Map incoming lead sources to CRM fields</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleAddSource}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Source
                  </Button>
                </div>
                <div className="space-y-3">
                  {sourceMappings.map((mapping) => (
                    <div key={mapping.id} className="flex items-center gap-4 p-3 border rounded-md bg-gray-50">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500">Source</Label>
                        <div className="font-medium">{mapping.source}</div>
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500">Maps to Zoho Field</Label>
                        <div className="font-medium">{mapping.mapTo}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full ${mapping.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                          {mapping.status}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleSourceStatus(mapping.id)}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-6">
                <Label>Default Lead Owner</Label>
                <select className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md">
                  <option>Round Robin</option>
                  {loadingTeam ? (
                    <option disabled>Loading users...</option>
                  ) : (
                    teamMembers.map(member => (
                      <option key={member._id || member.email} value={member._id || member.email}>
                        {member.name || member.email.split('@')[0]}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <Button onClick={handleSaveCrmSettings}>Save Settings</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation">
          {/* Lead Assignment Configuration */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Lead Assignment Configuration</CardTitle>
              <p className="text-sm text-gray-600">Configure how leads are automatically assigned to agents</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Master Toggle */}
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Enable Auto-Assignment</div>
                  <div className="text-sm text-gray-600">Automatically assign new leads to agents based on rules below</div>
                </div>
                <Switch
                  checked={assignmentSettings.autoAssignEnabled}
                  onCheckedChange={(checked) => setAssignmentSettings({ ...assignmentSettings, autoAssignEnabled: checked })}
                />
              </div>

              {/* Assignment Rules */}
              {assignmentSettings.autoAssignEnabled && (
                <div className="space-y-4 pl-4 border-l-2 border-blue-200">
                  {/* Round Robin */}
                  <div className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Round-Robin Distribution</div>
                      <div className="text-sm text-gray-600">Distribute leads evenly among available agents</div>
                    </div>
                    <Switch
                      checked={assignmentSettings.roundRobinEnabled}
                      onCheckedChange={(checked) => setAssignmentSettings({ ...assignmentSettings, roundRobinEnabled: checked })}
                    />
                  </div>

                  {/* Category Matching */}
                  <div className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{categoryFieldLabel} Matching</div>
                      <div className="text-sm text-gray-600">Assign leads to agents with experience in the {categoryFieldLabel.toLowerCase()}</div>
                    </div>
                    <Switch
                      checked={assignmentSettings.propertyMatchingEnabled}
                      onCheckedChange={(checked) => setAssignmentSettings({ ...assignmentSettings, propertyMatchingEnabled: checked })}
                    />
                  </div>

                  {/* Location Matching */}
                  <div className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{locationFieldLabel} Matching</div>
                      <div className="text-sm text-gray-600">Assign leads to agents familiar with the {locationFieldLabel.toLowerCase()}</div>
                    </div>
                    <Switch
                      checked={assignmentSettings.locationMatchingEnabled}
                      onCheckedChange={(checked) => setAssignmentSettings({ ...assignmentSettings, locationMatchingEnabled: checked })}
                    />
                  </div>

                  {/* Workload Balancing */}
                  <div className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Workload Balancing</div>
                      <div className="text-sm text-gray-600">Prioritize agents with fewer active leads</div>
                    </div>
                    <Switch
                      checked={assignmentSettings.workloadBalancingEnabled}
                      onCheckedChange={(checked) => setAssignmentSettings({ ...assignmentSettings, workloadBalancingEnabled: checked })}
                    />
                  </div>

                  {/* High Value Threshold */}
                  <div className="p-3 border rounded-lg">
                    <Label htmlFor="highValueThreshold" className="font-medium text-gray-900">High-Value Lead Threshold</Label>
                    <div className="text-sm text-gray-600 mb-3">Leads above this value get priority assignment to least busy agents</div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-700">₹</span>
                      <Input
                        id="highValueThreshold"
                        type="number"
                        min="0"
                        value={assignmentSettings.highValueThreshold || ''}
                        onChange={(e) => setAssignmentSettings({ ...assignmentSettings, highValueThreshold: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) })}
                        className="max-w-xs"
                        step="100000"
                      />
                      <span className="text-sm text-gray-500">
                        (₹{(assignmentSettings.highValueThreshold / 100000).toFixed(1)}L / ₹{(assignmentSettings.highValueThreshold / 10000000).toFixed(2)}Cr)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => alert('Assignment settings saved! These rules will apply to future lead assignments.')}>
                  Save Assignment Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Existing Automation Rules */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Automation Rules</CardTitle>
              <Button onClick={() => handleCreateRule()}>
                <Plus className="h-4 w-4 mr-2" />
                Create Rule
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {automationRules.map((rule) => (
                  <div key={rule.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-semibold">{rule.name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          When: {rule.trigger}
                        </div>
                        <div className="text-sm text-gray-600">
                          Then: {rule.action}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.enabled}
                          onCheckedChange={() => toggleAutomationRule(rule.id)}
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteRule(rule.id)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-green-600" />
                WhatsApp Business API Configuration
              </CardTitle>
              <p className="text-gray-600">
                Configure your WhatsApp messaging provider — choose Meta (direct) or Twilio (easier setup)
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider Selector */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <Label className="text-sm font-semibold text-gray-900 mb-3 block">WhatsApp Provider</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleWhatsappSettingChange('provider', 'meta')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      whatsappSettings.provider === 'meta'
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">Meta Cloud API</div>
                    <p className="text-xs text-gray-500 mt-1">Direct Meta integration. Requires Meta Business verification. Best for high volume.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWhatsappSettingChange('provider', 'twilio')}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      whatsappSettings.provider === 'twilio'
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">Twilio</div>
                    <p className="text-xs text-gray-500 mt-1">Quick setup via Twilio. Sandbox available for testing. Great for getting started.</p>
                  </button>
                </div>
              </div>

              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">Enable WhatsApp Integration</div>
                  <div className="text-sm text-gray-600">Allow the system to send WhatsApp messages to leads</div>
                </div>
                <Switch
                  checked={whatsappSettings.enabled}
                  onCheckedChange={(checked) => handleWhatsappSettingChange('enabled', checked)}
                />
              </div>

              {/* ===== META FIELDS ===== */}
              {whatsappSettings.provider === 'meta' && (
                <>
                  {/* Main Key — Access Token */}
                  <div className="space-y-3 p-5 bg-white rounded-xl border-2 border-green-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Key className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold text-gray-900">Meta Access Token</h3>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Required</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Paste your permanent access token from the <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-green-600 underline hover:text-green-800">Meta Business Suite → System Users</a>. Phone Number ID and Business Account ID will be auto-discovered.
                    </p>
                    <Input
                      id="accessToken"
                      type="password"
                      placeholder="EAASNRLjB2uE..."
                      className="font-mono text-sm h-11"
                      value={whatsappSettings.accessToken}
                      onChange={(e) => handleWhatsappSettingChange('accessToken', e.target.value)}
                    />
                  </div>

                  {/* Auto-discovered IDs (read-only display when populated) */}
                  {(whatsappSettings.phoneNumberId || whatsappSettings.businessAccountId) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border">
                      <div>
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Phone Number ID</Label>
                        <div className="text-sm font-mono text-gray-800 mt-1">{whatsappSettings.phoneNumberId || '—'}</div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-500 uppercase tracking-wide">Business Account ID</Label>
                        <div className="text-sm font-mono text-gray-800 mt-1">{whatsappSettings.businessAccountId || '—'}</div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ===== TWILIO FIELDS ===== */}
              {whatsappSettings.provider === 'twilio' && (
                <>
                  <div className="space-y-4 p-5 bg-white rounded-xl border-2 border-green-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Key className="h-5 w-5 text-green-600" />
                      <h3 className="font-semibold text-gray-900">Twilio Credentials</h3>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Required</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      Find these in your <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-green-600 underline hover:text-green-800">Twilio Console</a> dashboard.
                    </p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="twilioAccountSid" className="text-sm font-medium text-gray-700">Account SID</Label>
                        <Input
                          id="twilioAccountSid"
                          placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="font-mono text-sm h-11"
                          value={whatsappSettings.twilioAccountSid}
                          onChange={(e) => handleWhatsappSettingChange('twilioAccountSid', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twilioAuthToken" className="text-sm font-medium text-gray-700">Auth Token</Label>
                        <div className="relative">
                          <Input
                            id="twilioAuthToken"
                            type={showTwilioAuthToken ? 'text' : 'password'}
                            placeholder="Your Twilio Auth Token"
                            className="font-mono text-sm h-11 pr-10"
                            value={whatsappSettings.twilioAuthToken}
                            onChange={(e) => handleWhatsappSettingChange('twilioAuthToken', e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => setShowTwilioAuthToken(!showTwilioAuthToken)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showTwilioAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twilioWhatsappNumber" className="text-sm font-medium text-gray-700">WhatsApp Phone Number</Label>
                        <Input
                          id="twilioWhatsappNumber"
                          placeholder="whatsapp:+14155238886 (sandbox) or your number"
                          className="font-mono text-sm h-11"
                          value={whatsappSettings.twilioWhatsappNumber}
                          onChange={(e) => handleWhatsappSettingChange('twilioWhatsappNumber', e.target.value)}
                        />
                        <p className="text-xs text-gray-400">Include the whatsapp: prefix, e.g. whatsapp:+14155238886</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Connection Status */}
              {whatsappSettings.isConnected && (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <div className="font-medium text-green-700">Connected ({whatsappSettings.provider === 'twilio' ? 'Twilio' : 'Meta'})</div>
                      {whatsappSettings.lastTestedAt && (
                        <div className="text-sm text-green-600">
                          Last tested: {new Date(whatsappSettings.lastTestedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleDisconnectWhatsapp}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    Disconnect
                  </Button>
                </div>
              )}

              {whatsappSettings.lastError && !whatsappSettings.isConnected && (
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Connection Error</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">{whatsappSettings.lastError}</p>
                </div>
              )}

              {/* Save Button — only show when NOT connected */}
              {!whatsappSettings.isConnected && (
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSaveWhatsappSettings}
                    disabled={savingWhatsappSettings || (
                      whatsappSettings.provider === 'meta' ? !whatsappSettings.accessToken
                      : (!whatsappSettings.twilioAccountSid || !whatsappSettings.twilioAuthToken)
                    )}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {savingWhatsappSettings ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save &amp; Connect WhatsApp
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Advanced / Optional Settings (collapsible) — Meta only */}
              {whatsappSettings.provider === 'meta' && (
                <details className="border rounded-lg">
                  <summary className="cursor-pointer p-4 text-sm font-medium text-gray-600 hover:text-gray-900 select-none">
                    Advanced Settings (optional)
                  </summary>
                  <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phoneNumberId" className="text-sm text-gray-600">Phone Number ID</Label>
                      <Input
                        id="phoneNumberId"
                        placeholder="Auto-discovered from token"
                        value={whatsappSettings.phoneNumberId}
                        onChange={(e) => handleWhatsappSettingChange('phoneNumberId', e.target.value)}
                      />
                      <p className="text-xs text-gray-400">Leave blank to auto-discover</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="businessAccountId" className="text-sm text-gray-600">Business Account ID</Label>
                      <Input
                        id="businessAccountId"
                        placeholder="Auto-discovered from token"
                        value={whatsappSettings.businessAccountId}
                        onChange={(e) => handleWhatsappSettingChange('businessAccountId', e.target.value)}
                      />
                      <p className="text-xs text-gray-400">Leave blank to auto-discover</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="webhookUrl" className="text-sm text-gray-600">Webhook URL</Label>
                      <Input
                        id="webhookUrl"
                        placeholder="https://your-domain.com/webhook/whatsapp"
                        value={whatsappSettings.webhookUrl}
                        onChange={(e) => handleWhatsappSettingChange('webhookUrl', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="verifyToken" className="text-sm text-gray-600">Verify Token</Label>
                      <Input
                        id="verifyToken"
                        placeholder="your-webhook-verify-token"
                        value={whatsappSettings.verifyToken}
                        onChange={(e) => handleWhatsappSettingChange('verifyToken', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="appId" className="text-sm text-gray-600">App ID</Label>
                      <Input
                        id="appId"
                        placeholder="Meta App ID"
                        value={whatsappSettings.appId}
                        onChange={(e) => handleWhatsappSettingChange('appId', e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="appSecret" className="text-sm text-gray-600">App Secret</Label>
                      <Input
                        id="appSecret"
                        type="password"
                        placeholder="Meta App Secret"
                        value={whatsappSettings.appSecret}
                        onChange={(e) => handleWhatsappSettingChange('appSecret', e.target.value)}
                      />
                    </div>
                  </div>
                </details>
              )}

              {/* Testing Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Connection Testing</h3>
                    <p className="text-sm text-gray-500">Test your WhatsApp {whatsappSettings.provider === 'twilio' ? 'Twilio' : 'Business API'} configuration</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={whatsappSettings.testingEnabled}
                      onCheckedChange={(checked) => handleWhatsappSettingChange('testingEnabled', checked)}
                    />
                    <span className="text-sm text-gray-600">Enable Testing</span>
                  </div>
                </div>

                {whatsappSettings.testingEnabled && (
                  <div className="space-y-4">
                    <Button 
                      variant="outline" 
                      onClick={handleTestWhatsappConnection}
                      disabled={whatsappSettings.provider === 'meta'
                        ? (!whatsappSettings.accessToken || !whatsappSettings.phoneNumberId)
                        : (!whatsappSettings.twilioAccountSid || !whatsappSettings.twilioAuthToken)
                      }
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Test Connection
                    </Button>

                    {whatsappTestResult && (
                      <div className={`p-4 rounded-lg border ${whatsappTestResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                        <div className={`flex items-center gap-2 mb-2 ${whatsappTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                          {whatsappTestResult.success ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <AlertCircle className="h-4 w-4" />
                          )}
                          <span className="font-medium">
                            {whatsappTestResult.success ? 'Connection Successful' : 'Connection Failed'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          {whatsappTestResult.message || whatsappTestResult.error}
                        </p>
                        {whatsappTestResult.details && (
                          <pre className="text-xs text-gray-500 mt-2 bg-white p-2 rounded border">
                            {JSON.stringify(whatsappTestResult.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Setup Instructions — Provider-specific */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-3">Setup Instructions</h3>
                {whatsappSettings.provider === 'meta' ? (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>
                        <strong>Create a Meta Developer Account:</strong> Go to{' '}
                        <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          developers.facebook.com
                        </a>{' '}
                        and create an account
                      </li>
                      <li>
                        <strong>Create a WhatsApp Business App:</strong> In the Meta Developer Console, create a new app and add WhatsApp Business product
                      </li>
                      <li>
                        <strong>Get Phone Number:</strong> Add and verify a phone number for your WhatsApp Business account
                      </li>
                      <li>
                        <strong>Generate Access Token:</strong> Create a permanent access token with whatsapp_business_messaging and whatsapp_business_management permissions
                      </li>
                      <li>
                        <strong>Configure Webhook:</strong> Set up webhook URL in Meta Console pointing to your server's /webhook/whatsapp endpoint
                      </li>
                      <li>
                        <strong>Test Configuration:</strong> Use the test connection button above to verify everything is working
                      </li>
                    </ol>
                  </div>
                ) : (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                      <li>
                        <strong>Create a Twilio Account:</strong> Sign up at{' '}
                        <a href="https://www.twilio.com/try-twilio" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          twilio.com
                        </a>{' '}
                        (free trial available)
                      </li>
                      <li>
                        <strong>Copy Account SID &amp; Auth Token:</strong> Find these on your{' '}
                        <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Twilio Console
                        </a>{' '}
                        dashboard
                      </li>
                      <li>
                        <strong>Activate WhatsApp Sandbox:</strong> Go to Messaging → Try it out → Send a WhatsApp message → Follow the join instructions
                      </li>
                      <li>
                        <strong>Enter Sandbox Number:</strong> Use <code className="bg-white px-1.5 py-0.5 rounded text-xs border">whatsapp:+14155238886</code> as the phone number for sandbox testing
                      </li>
                      <li>
                        <strong>Configure Webhook:</strong> In Twilio Console → Messaging → Settings → WhatsApp Sandbox, set the webhook URL to <code className="bg-white px-1.5 py-0.5 rounded text-xs border">https://your-domain.com/webhook/whatsapp/twilio</code>
                      </li>
                      <li>
                        <strong>Test Configuration:</strong> Use the test connection button above to verify everything is working
                      </li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Bottom Save Button */}
              <div className="flex justify-between items-center pt-6 border-t">
                <p className="text-sm text-gray-500">
                  * Required fields. Changes will be applied immediately after saving.
                </p>
                <Button 
                  onClick={handleSaveWhatsappSettings} 
                  disabled={loadingWhatsappSettings}
                  className="min-w-[120px]"
                >
                  {loadingWhatsappSettings ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Template Builder — Create, submit, and manage WhatsApp templates */}
          <TemplateBuilder />
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Connected Integrations with Details */}
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">Z</div>
                      <div>
                        <h3 className="font-bold">Zoho CRM</h3>
                        {zohoConfig.isConnected ? (
                          <p className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Connected & Syncing
                          </p>
                        ) : zohoConfig.lastError ? (
                          <p className="text-sm text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Connection Error
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            Not Connected
                          </p>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleConfigureZoho}>Configure</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded">
                    <div>
                      <span className="text-gray-500">Client ID:</span>
                      <div className="font-mono">{zohoConfig.clientId ? (zohoConfig.clientId.includes('•') ? zohoConfig.clientId : zohoConfig.clientId.substring(0, 12) + '...') : 'Not configured'}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Last Sync:</span>
                      <div>{zohoConfig.lastSyncAt ? new Date(zohoConfig.lastSyncAt).toLocaleString() : 'Never'}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Data Center:</span>
                      <div>{zohoDataCenters.find(dc => dc.code === zohoConfig.dataCenter)?.name || 'India'} (.{zohoConfig.dataCenter})</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <div className={zohoConfig.isConnected ? 'text-green-600' : zohoConfig.lastError ? 'text-red-600' : 'text-gray-500'}>
                        {zohoConfig.isConnected ? 'Healthy' : zohoConfig.lastError ? 'Error' : 'Not Connected'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ElevenLabs AI Calling Card */}
                <div className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">🎙️</div>
                      <div>
                        <h3 className="font-bold">ElevenLabs AI Calling</h3>
                        {elevenLabsConfig.isConnected ? (
                          <p className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Connected
                          </p>
                        ) : elevenLabsConfig.lastError ? (
                          <p className="text-sm text-red-600 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Connection Error
                          </p>
                        ) : (
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            Not Connected
                          </p>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleConfigureElevenLabs}>Configure</Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-3 rounded">
                    <div>
                      <span className="text-gray-500">API Key:</span>
                      <div className="font-mono">{elevenLabsConfig.apiKey ? (elevenLabsConfig.apiKey.includes('•') ? elevenLabsConfig.apiKey : elevenLabsConfig.apiKey.substring(0, 8) + '...') : 'Not configured'}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Agent ID:</span>
                      <div className="font-mono">{elevenLabsConfig.agentId || 'Not configured'}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone Number ID:</span>
                      <div className="font-mono">{elevenLabsConfig.phoneNumberId || 'Not configured'}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">Status:</span>
                      <div className={elevenLabsConfig.isConnected ? 'text-green-600' : elevenLabsConfig.lastError ? 'text-red-600' : 'text-gray-500'}>
                        {elevenLabsConfig.isConnected ? 'Healthy' : elevenLabsConfig.lastError ? 'Error' : 'Not Connected'}
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <div className="border-t pt-6">
                <h3 className="font-medium mb-4">Available Integrations</h3>
                <div className="grid grid-cols-1 gap-4">
                  {integrations.map((integration) => (
                    <div key={integration.name} className="p-4 border rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{integration.icon}</span>
                        <div>
                          <div className="font-semibold">{integration.name}</div>
                          <div className="text-sm text-gray-600">{integration.description}</div>
                        </div>
                      </div>
                      <Button
                        variant={integration.connected ? 'outline' : 'default'}
                        size="sm"
                        onClick={() => handleConnectIntegration(integration.name)}
                      >
                        {integration.connected ? 'Disconnect' : 'Connect'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Slack Configuration Modal (Mock) */}
              <div className="border rounded-lg p-4 border-dashed border-gray-300">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-gray-500" />
                  <span className="font-medium text-gray-700">Slack Webhook URL</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="https://hooks.slack.com/services/..."
                    className="font-mono text-sm"
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                  />
                  <Button variant="secondary" onClick={handleSaveSlackWebhook}>Save</Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Paste your Incoming Webhook URL to receive lead alerts.
                </p>
              </div>

            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Status banner */}
              {emailConfigured ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <span className="font-medium text-green-800">SMTP Configured</span>
                    <span className="text-green-700 ml-2">— Agent credentials will be sent from: <strong>{emailSettings.user}</strong></span>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <span className="text-amber-800">SMTP not configured. Agent credential emails won't be sent until you set this up.</span>
                </div>
              )}

              {emailMessage && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  emailMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
                }`}>
                  {emailMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                  {emailMessage.text}
                </div>
              )}

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">SMTP Server Settings</h3>
                <p className="text-sm text-gray-600">
                  Configure your email server so agent credentials are sent from your business email.
                  For Gmail, use <code className="bg-gray-100 px-1 rounded">smtp.gmail.com</code> and an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-600 underline">App Password</a>.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      placeholder="smtp.gmail.com"
                      value={emailSettings.host}
                      onChange={(e) => setEmailSettings({ ...emailSettings, host: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtp-port">Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      placeholder="587"
                      value={emailSettings.port}
                      onChange={(e) => setEmailSettings({ ...emailSettings, port: parseInt(e.target.value) || 587 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="smtp-user">Email Address</Label>
                    <Input
                      id="smtp-user"
                      type="email"
                      placeholder="you@company.com"
                      value={emailSettings.user}
                      onChange={(e) => setEmailSettings({ ...emailSettings, user: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="smtp-pass">Password / App Password</Label>
                    <div className="relative">
                      <Input
                        id="smtp-pass"
                        type={showSmtpPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={emailSettings.pass}
                        onChange={(e) => setEmailSettings({ ...emailSettings, pass: e.target.value })}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowSmtpPassword(!showSmtpPassword)}
                      >
                        {showSmtpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="smtp-from-name">Sender Display Name</Label>
                    <Input
                      id="smtp-from-name"
                      placeholder="JK Homes"
                      value={emailSettings.fromName}
                      onChange={(e) => setEmailSettings({ ...emailSettings, fromName: e.target.value })}
                    />
                    <p className="text-xs text-gray-500 mt-1">The name shown in the 'From' field (e.g. "JK Homes")</p>
                  </div>
                  <div className="flex items-end">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={emailSettings.secure}
                        onCheckedChange={(checked) => setEmailSettings({ ...emailSettings, secure: checked, port: checked ? 465 : 587 })}
                      />
                      <Label>Use SSL/TLS (port 465)</Label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={handleTestEmailSettings}
                  variant="outline"
                  disabled={emailTesting}
                >
                  {emailTesting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  {emailTesting ? 'Sending Test...' : 'Send Test Email'}
                </Button>
                <Button
                  onClick={handleSaveEmailSettings}
                  disabled={emailSaving}
                >
                  {emailSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {emailSaving ? 'Saving...' : 'Save Settings'}
                </Button>
              </div>

              <div className="p-4 bg-gray-50 border rounded-lg mt-4">
                <h4 className="font-medium text-sm text-gray-700 mb-2">How it works</h4>
                <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4">
                  <li>When you create a new agent, their login credentials (email & password) are automatically sent from the email configured above.</li>
                  <li>If SMTP is not configured, credential emails won't be sent (agents will need to be told their credentials manually).</li>
                  <li>Use the "Send Test Email" button to verify your settings before saving.</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>Billing & Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold">Professional Plan</h3>
                    <p className="text-gray-600">Unlimited leads and team members</p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold">$49</div>
                    <div className="text-sm text-gray-600">per month</div>
                  </div>
                </div>
                <Button variant="outline" onClick={handleChangePlan}>Change Plan</Button>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Payment Method</h4>
                <div className="p-4 border rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-8 bg-gray-200 rounded flex items-center justify-center">
                      💳
                    </div>
                    <div>
                      <div className="font-semibold">Visa ending in 4242</div>
                      <div className="text-sm text-gray-600">Expires 12/2025</div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleUpdatePaymentMethod}>Update</Button>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Billing History</h4>
                <div className="space-y-2">
                  {[
                    { date: 'Dec 1, 2024', amount: '$49.00', status: 'Paid' },
                    { date: 'Nov 1, 2024', amount: '$49.00', status: 'Paid' },
                    { date: 'Oct 1, 2024', amount: '$49.00', status: 'Paid' },
                  ].map((invoice, index) => (
                    <div key={index} className="p-4 border rounded-lg flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{invoice.date}</div>
                        <div className="text-sm text-gray-600">{invoice.amount}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-green-600">{invoice.status}</span>
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadInvoice(invoice)}>Download</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Zoho CRM Configuration Modal */}
      {showZohoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">Configure Zoho CRM</h2>
                <p className="text-sm text-gray-600">Connect your Zoho CRM account to sync leads</p>
              </div>
              <button 
                onClick={() => setShowZohoModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Connection Status */}
              {(zohoOAuthStatus?.connected || zohoConfig.isConnected) && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-800">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-semibold">Connected to Zoho CRM</span>
                    </div>
                    <Button variant="destructive" size="sm" onClick={zohoOAuthStatus?.connected ? handleDisconnectZohoOAuth : handleDisconnectZoho}>
                      Disconnect
                    </Button>
                  </div>
                  {zohoOAuthStatus?.organizationName && (
                    <p className="text-sm text-green-700 mt-2">
                      <strong>Organization:</strong> {zohoOAuthStatus.organizationName}
                    </p>
                  )}
                  {(zohoOAuthStatus?.connectedAt || zohoConfig.lastSyncAt) && (
                    <p className="text-sm text-green-700">
                      <strong>Last sync:</strong> {new Date(zohoOAuthStatus?.connectedAt || zohoConfig.lastSyncAt!).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Test Result */}
              {zohoTestResult && (
                <div className={`p-4 rounded-lg ${zohoTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className={`flex items-center gap-2 font-medium ${zohoTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                    {zohoTestResult.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    {zohoTestResult.message || zohoTestResult.error}
                  </div>
                  {zohoTestResult.warning && (
                    <p className="text-sm text-amber-700 mt-1">⚠️ {zohoTestResult.warning}</p>
                  )}
                  {zohoTestResult.data?.organizationName && (
                    <p className="text-sm text-green-600 mt-1">Org: {zohoTestResult.data.organizationName}</p>
                  )}
                  {zohoTestResult.data?.leadsAvailable !== undefined && (
                    <p className="text-sm text-green-600 mt-1">Leads accessible: Yes</p>
                  )}
                  {zohoTestResult.data?.grantedScopes && (
                    <p className="text-xs text-gray-500 mt-1">Scopes: {zohoTestResult.data.grantedScopes}</p>
                  )}
                </div>
              )}

              {/* Simple One-Click Connect Section */}
              {!zohoOAuthStatus?.connected && !zohoConfig.isConnected && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5">
                  <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    🔗 Option 1: One-Click Connect
                  </h3>
                  <p className="text-sm text-blue-800 mb-4">
                    Fastest way — just click and login to your Zoho account.
                  </p>
                  
                  <div className="mb-4">
                    <Label htmlFor="oauth-datacenter" className="text-sm text-blue-800">Select your Zoho region:</Label>
                    <select
                      id="oauth-datacenter"
                      value={zohoConfig.dataCenter}
                      onChange={(e) => setZohoConfig(prev => ({ ...prev, dataCenter: e.target.value }))}
                      className="mt-1 w-full border border-blue-300 rounded-md px-3 py-2 bg-white text-sm"
                    >
                      {zohoDataCenters.map(dc => (
                        <option key={dc.code} value={dc.code}>{dc.name} (.zoho.{dc.code})</option>
                      ))}
                    </select>
                  </div>

                  <Button 
                    onClick={handleConnectZohoOAuth}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    size="lg"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Connect with Zoho
                  </Button>
                </div>
              )}

              {/* Manual Credential Entry */}
              <div className="border rounded-lg p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  🔑 {zohoConfig.isConnected ? 'Manage Credentials' : 'Option 2: Manual Setup'}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Enter your Zoho API credentials from{' '}
                  <a href="https://api-console.zoho.in/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    Zoho API Console
                  </a>
                </p>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="zoho-datacenter">Data Center</Label>
                    <select
                      id="zoho-datacenter"
                      value={zohoConfig.dataCenter}
                      onChange={(e) => setZohoConfig(prev => ({ ...prev, dataCenter: e.target.value }))}
                      className="mt-1 w-full border rounded-md px-3 py-2 bg-white text-sm"
                    >
                      {zohoDataCenters.map(dc => (
                        <option key={dc.code} value={dc.code}>{dc.name} (.zoho.{dc.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="zoho-client-id" className="flex items-center gap-1">
                      Client ID <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="zoho-client-id"
                      value={zohoConfig.clientId}
                      onChange={(e) => setZohoConfig(prev => ({ ...prev, clientId: e.target.value }))}
                      placeholder="1000.XXXX..."
                      className="font-mono"
                    />
                  </div>

                  <div>
                    <Label htmlFor="zoho-client-secret" className="flex items-center gap-1">
                      Client Secret <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="zoho-client-secret"
                        type={showZohoSecrets.clientSecret ? 'text' : 'password'}
                        value={zohoConfig.clientSecret}
                        onChange={(e) => setZohoConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                        placeholder="Enter client secret"
                        className="pr-10 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowZohoSecrets(prev => ({ ...prev, clientSecret: !prev.clientSecret }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showZohoSecrets.clientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="zoho-refresh-token" className="flex items-center gap-1">
                      Refresh Token <span className="text-red-500">*</span>
                    </Label>
                    <div className="relative">
                      <Input
                        id="zoho-refresh-token"
                        type={showZohoSecrets.refreshToken ? 'text' : 'password'}
                        value={zohoConfig.refreshToken}
                        onChange={(e) => setZohoConfig(prev => ({ ...prev, refreshToken: e.target.value }))}
                        placeholder="1000.xxxx..."
                        className="pr-10 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowZohoSecrets(prev => ({ ...prev, refreshToken: !prev.refreshToken }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        {showZohoSecrets.refreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Generate from Zoho API Console → Self Client → scope: <code className="bg-gray-100 px-1 rounded">ZohoCRM.modules.ALL,ZohoCRM.org.ALL,ZohoCRM.settings.ALL,ZohoCRM.users.ALL</code>
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 mt-5 pt-4 border-t">
                  <Button
                    onClick={handleSaveZohoConfig}
                    disabled={savingZohoConfig || !zohoConfig.clientId || !zohoConfig.clientSecret || !zohoConfig.refreshToken}
                    className="flex-1"
                  >
                    {savingZohoConfig ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                    ) : 'Save Credentials'}
                  </Button>
                  <Button
                    onClick={handleTestZohoConnection}
                    disabled={testingZohoConnection}
                    variant="outline"
                    className="flex-1"
                  >
                    {testingZohoConnection ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                    ) : 'Test Connection'}
                  </Button>
                </div>

                {zohoConfig.isConnected && (
                  <Button
                    onClick={handleDisconnectZoho}
                    variant="outline"
                    className="w-full mt-3 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Disconnect Zoho CRM
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ElevenLabs Configuration Modal */}
      {showElevenLabsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  🎙️ ElevenLabs AI Calling Configuration
                </h2>
                <button onClick={() => setShowElevenLabsModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Connection Status */}
              {elevenLabsConfig.isConnected && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <CheckCircle2 className="h-5 w-5" />
                    ElevenLabs Connected
                  </div>
                  {elevenLabsConfig.lastTestedAt && (
                    <p className="text-sm text-green-600 mt-1">
                      Last tested: {new Date(elevenLabsConfig.lastTestedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Test Result */}
              {elevenLabsTestResult && (
                <div className={`mb-4 p-4 rounded-lg ${elevenLabsTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className={`flex items-center gap-2 font-medium ${elevenLabsTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                    {elevenLabsTestResult.success ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                    {elevenLabsTestResult.message}
                  </div>
                  {elevenLabsTestResult.data && (
                    <p className="text-sm mt-1 text-green-600">
                      User: {elevenLabsTestResult.data.userName} | Plan: {elevenLabsTestResult.data.subscription}
                    </p>
                  )}
                </div>
              )}

              {/* Configuration Form */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="elevenlabs-api-key" className="flex items-center gap-1">
                    API Key <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="elevenlabs-api-key"
                      type={showElevenLabsApiKey ? 'text' : 'password'}
                      value={elevenLabsConfig.apiKey}
                      onChange={(e) => setElevenLabsConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                      placeholder="sk_..."
                      className="pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowElevenLabsApiKey(!showElevenLabsApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showElevenLabsApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Get from <a href="https://elevenlabs.io/api" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">ElevenLabs API Settings</a>
                  </p>
                </div>

                <div>
                  <Label htmlFor="elevenlabs-agent-id" className="flex items-center gap-1">
                    Agent ID <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="elevenlabs-agent-id"
                    value={elevenLabsConfig.agentId}
                    onChange={(e) => setElevenLabsConfig(prev => ({ ...prev, agentId: e.target.value }))}
                    placeholder="agent_..."
                    className="font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your Conversational AI Agent ID
                  </p>
                </div>

                <div>
                  <Label htmlFor="elevenlabs-phone-id">
                    Phone Number ID (Optional)
                  </Label>
                  <Input
                    id="elevenlabs-phone-id"
                    value={elevenLabsConfig.phoneNumberId}
                    onChange={(e) => setElevenLabsConfig(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                    placeholder="phnum_..."
                    className="font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for outbound calls
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-6 pt-4 border-t">
                <Button
                  onClick={handleSaveElevenLabsConfig}
                  disabled={savingElevenLabsConfig}
                  className="flex-1"
                >
                  {savingElevenLabsConfig ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                  ) : 'Save Configuration'}
                </Button>
                <Button
                  onClick={handleTestElevenLabsConnection}
                  disabled={testingElevenLabsConnection || !elevenLabsConfig.apiKey}
                  variant="outline"
                  className="flex-1"
                >
                  {testingElevenLabsConnection ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing...</>
                  ) : 'Test Connection'}
                </Button>
              </div>

              {elevenLabsConfig.isConnected && (
                <Button
                  onClick={handleDisconnectElevenLabs}
                  variant="outline"
                  className="w-full mt-3 text-red-600 border-red-200 hover:bg-red-50"
                >
                  Disconnect ElevenLabs
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
