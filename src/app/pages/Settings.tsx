import { useState, useRef, ChangeEvent, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Switch } from '../components/ui/switch';
import { Plus, Trash2, MessageSquare, RefreshCw, CheckCircle2, AlertCircle, Loader2, UserCheck, X, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { getUsers } from '../../services/leads';

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
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
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
  const [loadingTeam, setLoadingTeam] = useState(true);

  const [profile, setProfile] = useState<Profile>({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1 (555) 123-4567',
    timezone: 'Eastern Time (ET)',
    avatar: ''
  });

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

  // Load Zoho config on mount
  useEffect(() => {
    loadZohoConfig();
  }, []);

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
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookUrl: '',
    verifyToken: '',
    appId: '',
    appSecret: '',
    enabled: false,
    testingEnabled: false
  });

  const [loadingWhatsappSettings, setLoadingWhatsappSettings] = useState(false);
  const [whatsappTestResult, setWhatsappTestResult] = useState(null);

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
    setLoadingWhatsappSettings(true);
    try {
      // API call to save WhatsApp settings
      const api = await import('../../services/api');
      const response = await api.default.post('/api/settings/whatsapp', whatsappSettings);
      
      if (response.data.success) {
        alert('WhatsApp settings saved successfully!');
      } else {
        throw new Error(response.data.error || 'Failed to save settings');
      }
    } catch (error: any) {
      console.error('Error saving WhatsApp settings:', error);
      alert(error.response?.data?.error || 'Failed to save WhatsApp settings. Please try again.');
    } finally {
      setLoadingWhatsappSettings(false);
    }
  };

  const handleTestWhatsappConnection = async () => {
    setWhatsappTestResult(null);
    try {
      const api = await import('../../services/api');
      const response = await api.default.post('/api/settings/whatsapp/test', {
        accessToken: whatsappSettings.accessToken,
        phoneNumberId: whatsappSettings.phoneNumberId
      });
      
      setWhatsappTestResult(response.data);
    } catch (error: any) {
      console.error('Error testing WhatsApp connection:', error);
      setWhatsappTestResult({ 
        success: false, 
        error: error.response?.data?.error || 'Connection test failed' 
      });
    }
  };

  const handleLoadWhatsappSettings = async () => {
    try {
      const api = await import('../../services/api');
      const response = await api.default.get('/api/settings/whatsapp');
      if (response.data.success) {
        setWhatsappSettings(response.data.data);
      }
    } catch (error) {
      console.error('Error loading WhatsApp settings:', error);
    }
  };

  // Load WhatsApp settings on component mount
  useEffect(() => {
    handleLoadWhatsappSettings();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleProfileChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    setProfile(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB');
        return;
      }
      const imageUrl = URL.createObjectURL(file);
      setProfile(prev => ({ ...prev, avatar: imageUrl }));
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
          <TabsTrigger value="crm">CRM</TabsTrigger>
          <TabsTrigger value="automation">Automation</TabsTrigger>
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
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
                  <AvatarFallback>{profile.firstName[0]}{profile.lastName[0]}</AvatarFallback>
                  {profile.avatar && <img src={profile.avatar} alt="Profile" className="h-full w-full object-cover" />}
                </Avatar>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif"
                    onChange={handleFileChange}
                  />
                  <Button variant="outline" onClick={handlePhotoClick}>Change Photo</Button>
                  <p className="text-sm text-gray-500 mt-2">JPG, PNG or GIF. Max size 2MB</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" value={profile.firstName} onChange={handleProfileChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" value={profile.lastName} onChange={handleProfileChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={profile.email} onChange={handleProfileChange} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" value={profile.phone} onChange={handleProfileChange} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <select
                  id="timezone"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={profile.timezone}
                  onChange={handleProfileChange}
                >
                  <option>Eastern Time (ET)</option>
                  <option>Central Time (CT)</option>
                  <option>Mountain Time (MT)</option>
                  <option>Pacific Time (PT)</option>
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

                  {/* Property Type Matching */}
                  <div className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Property Type Matching</div>
                      <div className="text-sm text-gray-600">Assign leads to agents with experience in the property type</div>
                    </div>
                    <Switch
                      checked={assignmentSettings.propertyMatchingEnabled}
                      onCheckedChange={(checked) => setAssignmentSettings({ ...assignmentSettings, propertyMatchingEnabled: checked })}
                    />
                  </div>

                  {/* Location Matching */}
                  <div className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Location Matching</div>
                      <div className="text-sm text-gray-600">Assign leads to agents familiar with the location</div>
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
                Configure your Meta (Facebook) Business API credentials to enable WhatsApp messaging automation
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
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

              {/* Meta Business API Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Meta Business API Credentials</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="accessToken">Access Token *</Label>
                    <Input
                      id="accessToken"
                      type="password"
                      placeholder="Enter your WhatsApp Business API access token"
                      value={whatsappSettings.accessToken}
                      onChange={(e) => handleWhatsappSettingChange('accessToken', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      Permanent access token from Meta Developer Console
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phoneNumberId">Phone Number ID *</Label>
                    <Input
                      id="phoneNumberId"
                      placeholder="123456789012345"
                      value={whatsappSettings.phoneNumberId}
                      onChange={(e) => handleWhatsappSettingChange('phoneNumberId', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      WhatsApp Business phone number ID from Meta
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessAccountId">Business Account ID *</Label>
                    <Input
                      id="businessAccountId"
                      placeholder="123456789012345"
                      value={whatsappSettings.businessAccountId}
                      onChange={(e) => handleWhatsappSettingChange('businessAccountId', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      WhatsApp Business Account ID from Meta
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 border-b pb-2">Webhook Configuration</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <Input
                      id="webhookUrl"
                      placeholder="https://your-domain.com/webhook/whatsapp"
                      value={whatsappSettings.webhookUrl}
                      onChange={(e) => handleWhatsappSettingChange('webhookUrl', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      URL where Meta will send webhook events
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="verifyToken">Verify Token</Label>
                    <Input
                      id="verifyToken"
                      placeholder="your-webhook-verify-token"
                      value={whatsappSettings.verifyToken}
                      onChange={(e) => handleWhatsappSettingChange('verifyToken', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      Token for webhook verification
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="appId">App ID</Label>
                    <Input
                      id="appId"
                      placeholder="123456789012345"
                      value={whatsappSettings.appId}
                      onChange={(e) => handleWhatsappSettingChange('appId', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      Meta App ID (optional)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="appSecret">App Secret</Label>
                    <Input
                      id="appSecret"
                      type="password"
                      placeholder="Enter your app secret"
                      value={whatsappSettings.appSecret}
                      onChange={(e) => handleWhatsappSettingChange('appSecret', e.target.value)}
                    />
                    <p className="text-xs text-gray-500">
                      Meta App Secret (optional)
                    </p>
                  </div>
                </div>
              </div>

              {/* Testing Section */}
              <div className="border-t pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900">Connection Testing</h3>
                    <p className="text-sm text-gray-500">Test your WhatsApp Business API configuration</p>
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
                      disabled={!whatsappSettings.accessToken || !whatsappSettings.phoneNumberId}
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

              {/* Setup Instructions */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-3">Setup Instructions</h3>
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
              </div>

              {/* Save Button */}
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
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">How to get your Zoho credentials:</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Go to <a href="https://api-console.zoho.in/" target="_blank" rel="noopener noreferrer" className="underline font-medium inline-flex items-center gap-1">Zoho API Console <ExternalLink className="h-3 w-3" /></a></li>
                  <li>Create a "Self Client" application</li>
                  <li>Copy your Client ID and Client Secret</li>
                  <li>Generate a Refresh Token with scope: <code className="bg-blue-100 px-1 rounded">ZohoCRM.modules.ALL</code></li>
                </ol>
              </div>

              {/* Data Center Selection */}
              <div className="space-y-2">
                <Label htmlFor="zoho-datacenter">Data Center</Label>
                <select
                  id="zoho-datacenter"
                  value={zohoConfig.dataCenter}
                  onChange={(e) => setZohoConfig(prev => ({ ...prev, dataCenter: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 bg-white"
                >
                  {zohoDataCenters.map(dc => (
                    <option key={dc.code} value={dc.code}>{dc.name} (.{dc.code})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">Select the data center where your Zoho account is hosted</p>
              </div>

              {/* Client ID */}
              <div className="space-y-2">
                <Label htmlFor="zoho-client-id">Client ID *</Label>
                <Input
                  id="zoho-client-id"
                  placeholder="1000.XXXXXXXXXXXXXXXXXX"
                  value={zohoConfig.clientId}
                  onChange={(e) => setZohoConfig(prev => ({ ...prev, clientId: e.target.value }))}
                  className="font-mono"
                />
              </div>

              {/* Client Secret */}
              <div className="space-y-2">
                <Label htmlFor="zoho-client-secret">Client Secret *</Label>
                <div className="relative">
                  <Input
                    id="zoho-client-secret"
                    type={showZohoSecrets.clientSecret ? 'text' : 'password'}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={zohoConfig.clientSecret}
                    onChange={(e) => setZohoConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                    className="font-mono pr-10"
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

              {/* Refresh Token */}
              <div className="space-y-2">
                <Label htmlFor="zoho-refresh-token">Refresh Token *</Label>
                <div className="relative">
                  <Input
                    id="zoho-refresh-token"
                    type={showZohoSecrets.refreshToken ? 'text' : 'password'}
                    placeholder="1000.xxxxxxxx.xxxxxxxx"
                    value={zohoConfig.refreshToken}
                    onChange={(e) => setZohoConfig(prev => ({ ...prev, refreshToken: e.target.value }))}
                    className="font-mono pr-10"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowZohoSecrets(prev => ({ ...prev, refreshToken: !prev.refreshToken }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showZohoSecrets.refreshToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Generate this in Zoho API Console → Self Client → Generate Code → then exchange for refresh token
                </p>
              </div>

              {/* Test Result */}
              {zohoTestResult && (
                <div className={`p-4 rounded-lg ${zohoTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {zohoTestResult.success ? (
                    <div>
                      <div className="flex items-center gap-2 text-green-800 font-semibold mb-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Connected Successfully!
                      </div>
                      {zohoTestResult.data && (
                        <div className="text-sm text-green-700 space-y-1">
                          <p><strong>Organization:</strong> {zohoTestResult.data.organizationName}</p>
                          <p><strong>Country:</strong> {zohoTestResult.data.country}</p>
                          <p><strong>License:</strong> {zohoTestResult.data.licenseType}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-800">
                      <AlertCircle className="h-5 w-5" />
                      <span>{zohoTestResult.error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={handleTestZohoConnection}
                  disabled={testingZohoConnection || !zohoConfig.clientId || !zohoConfig.clientSecret || !zohoConfig.refreshToken}
                >
                  {testingZohoConnection ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Test Connection
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleSaveZohoConfig}
                  disabled={savingZohoConfig || !zohoConfig.clientId || !zohoConfig.clientSecret || !zohoConfig.refreshToken}
                >
                  {savingZohoConfig ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save & Connect'
                  )}
                </Button>
                {zohoConfig.isConnected && (
                  <Button variant="destructive" onClick={handleDisconnectZoho}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
