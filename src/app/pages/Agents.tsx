import { useState, useEffect, useCallback } from 'react';
import { Shield, User, Clock, Phone, Mail, CheckCircle, XCircle, Loader2, RefreshCw, ChevronDown, ChevronUp, Users, UserPlus, Trash2, Activity, CheckSquare, Wifi, WifiOff, CalendarDays } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import AgentActivityDialog from '../components/AgentActivityDialog';
import { createTaskForAgent } from '../../services/leads';
import { useTenantConfig } from '../context/TenantConfigContext';
import { getAgentsStatus, getAttendanceLog, formatDuration, type AgentPresence, type AgentStatusSummary, type AttendanceRecord } from '../../services/attendance';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../lib/parseApiError';

interface Agent {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  approvalStatus: string;
  lastLogin?: string;
  createdAt: string;
  isOnline?: boolean;
  lastHeartbeat?: string;
}

interface Lead {
  _id: string;
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  source?: string;
  assignedTo?: string;
  createdAt?: string;
}

export default function Agents() {
  const { getStatusColor, getStatusLabel } = useTenantConfig();
  const { addToast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentLeads, setAgentLeads] = useState<{ [key: string]: Lead[] }>({});
  const [loadingLeads, setLoadingLeads] = useState<string | null>(null);
  
  // Add Agent Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingAgent, setAddingAgent] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState(false);
  
  // Delete Agent State
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);
  
  // Activity Dialog State
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  
  // Create Task Modal State
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskModalAgent, setTaskModalAgent] = useState<Agent | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [taskSuccess, setTaskSuccess] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    dueDate: ''
  });
  
  const [newAgent, setNewAgent] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });

  // Presence & Attendance State
  const [activeTab, setActiveTab] = useState<'agents' | 'attendance'>('agents');
  const [presenceData, setPresenceData] = useState<AgentPresence[]>([]);
  const [presenceSummary, setPresenceSummary] = useState<AgentStatusSummary | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [attendanceDateRange, setAttendanceDateRange] = useState({
    start: (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; })(),
    end: new Date().toISOString().split('T')[0]
  });
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  // Fetch live presence data
  const fetchPresence = useCallback(async () => {
    try {
      const result = await getAgentsStatus();
      setPresenceData(result.data || []);
      setPresenceSummary(result.summary || null);
    } catch (err) {
      addToast(parseApiError(err).message, 'error');
    }
  }, []);

  // Fetch attendance log
  const fetchAttendance = useCallback(async () => {
    setLoadingAttendance(true);
    try {
      const result = await getAttendanceLog(attendanceDateRange.start, attendanceDateRange.end);
      setAttendanceRecords(result.data || []);
    } catch (err) {
      addToast(parseApiError(err).message, 'error');
    } finally {
      setLoadingAttendance(false);
    }
  }, [attendanceDateRange]);

  const handleAddAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingAgent(true);
    setAddError('');
    setAddSuccess(false);

    try {
      // Register the agent with createdByOwner flag - auto-approves them
      const token = localStorage.getItem('accessToken');
      const registerResponse = await fetch(`/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newAgent.name,
          email: newAgent.email,
          phone: newAgent.phone,
          password: newAgent.password,
          role: 'agent',
          createdByOwner: true  // This auto-approves the agent
        })
      });

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json();
        throw new Error(errorData.message || 'Failed to create agent');
      }

      setAddSuccess(true);
      setNewAgent({ name: '', email: '', phone: '', password: '' });
      
      // Refresh agents list
      await fetchAgents();
      
      // Close modal after short delay to show success
      setTimeout(() => {
        setShowAddModal(false);
        setAddSuccess(false);
      }, 1500);

    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setAddError(err.message || 'Failed to add agent');
    } finally {
      setAddingAgent(false);
    }
  };

  const resetAddModal = () => {
    setNewAgent({ name: '', email: '', phone: '', password: '' });
    setAddError('');
    setAddSuccess(false);
  };

  const handleDeleteAgent = async (agentId: string, agentName: string) => {
    if (!confirm(`Are you sure you want to delete agent "${agentName}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingAgent(agentId);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete agent');
      }

      // Refresh agents list
      await fetchAgents();
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.message || 'Failed to delete agent');
    } finally {
      setDeletingAgent(null);
    }
  };

  const fetchAgents = async () => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }

      const data = await response.json();
      // Handle different response formats
      const users = data.data || data.users || data || [];
      // Filter only agents (not admins/owners)
      const agentUsers = Array.isArray(users) ? users.filter((user: Agent) => user.role === 'agent') : [];
      setAgents(agentUsers);
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
    fetchPresence();

    // Auto-refresh agents & presence every 30 seconds
    const agentInterval = setInterval(fetchAgents, 30000);
    const presenceInterval = setInterval(fetchPresence, 30000);
    return () => {
      clearInterval(agentInterval);
      clearInterval(presenceInterval);
    };
  }, []);

  // Fetch attendance when tab switches or date range changes
  useEffect(() => {
    if (activeTab === 'attendance') {
      fetchAttendance();
    }
  }, [activeTab, fetchAttendance]);

  const fetchAgentLeads = async (agentId: string) => {
    setLoadingLeads(agentId);
    try {
      const token = localStorage.getItem('accessToken');
      // Fetch all leads and filter by assignedTo on the frontend
      const response = await fetch(`/api/leads?limit=200`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch leads');
      }

      const data = await response.json();
      const allLeads = data.data || data.leads || data || [];
      // Filter leads assigned to this specific agent
      const agentAssignedLeads = Array.isArray(allLeads) 
        ? allLeads.filter((lead: Lead) => lead.assignedTo === agentId)
        : [];
      setAgentLeads(prev => ({ ...prev, [agentId]: agentAssignedLeads }));
    } catch (err: any) {
      addToast(parseApiError(err).message, 'error');
      setAgentLeads(prev => ({ ...prev, [agentId]: [] }));
    } finally {
      setLoadingLeads(null);
    }
  };

  const toggleAgentExpand = (agentId: string) => {
    if (expandedAgent === agentId) {
      setExpandedAgent(null);
    } else {
      setExpandedAgent(agentId);
      if (!agentLeads[agentId]) {
        fetchAgentLeads(agentId);
      }
    }
  };

  const openAgentActivity = (agent: Agent) => {
    setSelectedAgent(agent);
    setActivityDialogOpen(true);
  };

  const openCreateTaskModal = (agent: Agent) => {
    setTaskModalAgent(agent);
    setShowTaskModal(true);
    setTaskFormData({ title: '', description: '', priority: 'medium', dueDate: '' });
    setTaskError('');
    setTaskSuccess(false);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!taskModalAgent) return;
    if (!taskFormData.title.trim()) {
      setTaskError('Task title is required');
      return;
    }

    setCreatingTask(true);
    setTaskError('');

    try {
      const result = await createTaskForAgent(taskModalAgent._id, {
        title: taskFormData.title,
        description: taskFormData.description,
        priority: taskFormData.priority as 'high' | 'medium' | 'low',
        dueDate: taskFormData.dueDate || undefined,
        type: 'manual_action'
      });

      if (result.success) {
        setTaskSuccess(true);
        setTaskFormData({ title: '', description: '', priority: 'medium', dueDate: '' });
        
        // Close modal after short delay to show success
        setTimeout(() => {
          setShowTaskModal(false);
          setTaskSuccess(false);
        }, 1500);
      } else {
        setTaskError(result.error || 'Failed to create task');
      }
    } catch (error: any) {
      setTaskError(error.message || 'Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  };

  const getLeadStatusBadge = (status: string) => {
    const color = getStatusColor(status);
    const label = getStatusLabel(status);
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: `${color}20`, color: color }}
      >
        {label}
      </span>
    );
  };

  // Find presence info for a given agent
  const getAgentPresence = (agentId: string) => {
    return presenceData.find(p => p._id === agentId);
  };

  const getStatusBadge = (agent: Agent) => {
    if (agent.approvalStatus === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="h-3 w-3" />
          Pending Approval
        </span>
      );
    }
    if (agent.approvalStatus === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
    }
    // Check presence data for real-time online status
    const presence = getAgentPresence(agent._id);
    const isOnline = presence?.isOnline ?? agent.isOnline ?? false;
    if (isOnline) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <Wifi className="h-3 w-3" />
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Online
        </span>
      );
    }
    if (agent.isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <WifiOff className="h-3 w-3" />
          Offline
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <XCircle className="h-3 w-3" />
        Inactive
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Agents</h1>
          </div>
          <p className="text-gray-600">Monitor and manage all registered agents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => { resetAddModal(); setShowAddModal(true); }} 
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <UserPlus className="h-4 w-4" />
            Add Agent
          </Button>
          <Button onClick={fetchAgents} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Add Agent Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Add New Agent
            </DialogTitle>
            <DialogDescription>
              Create a new agent account. The agent will be automatically approved and can log in immediately.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleAddAgent} className="space-y-4">
            {addError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{addError}</p>
              </div>
            )}
            
            {addSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">Agent created successfully!</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="agentName">Full Name *</Label>
              <Input
                id="agentName"
                placeholder="Agent's full name"
                value={newAgent.name}
                onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                required
                disabled={addingAgent || addSuccess}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentEmail">Email *</Label>
              <Input
                id="agentEmail"
                type="email"
                placeholder="agent@example.com"
                value={newAgent.email}
                onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })}
                required
                disabled={addingAgent || addSuccess}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentPhone">Phone Number</Label>
              <Input
                id="agentPhone"
                type="tel"
                placeholder="(555) 123-4567"
                value={newAgent.phone}
                onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })}
                disabled={addingAgent || addSuccess}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="agentPassword">Password *</Label>
              <Input
                id="agentPassword"
                type="password"
                placeholder="Create a password"
                value={newAgent.password}
                onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })}
                required
                minLength={6}
                disabled={addingAgent || addSuccess}
              />
              <p className="text-xs text-gray-500">Minimum 6 characters</p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={addingAgent}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={addingAgent || addSuccess}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {addingAgent ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Agent
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-2 text-red-800">
          <XCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500 mb-1">Total Agents</div>
          <div className="text-2xl font-bold text-gray-900">{agents.length}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Wifi className="h-3.5 w-3.5 text-green-500" />
            Online Now
          </div>
          <div className="text-2xl font-bold text-green-600">
            {presenceSummary?.online ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <WifiOff className="h-3.5 w-3.5 text-gray-400" />
            Offline
          </div>
          <div className="text-2xl font-bold text-gray-600">
            {presenceSummary?.offline ?? 0}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
            Checked In Today
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {presenceSummary?.checkedInToday ?? 0}
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('agents')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'agents'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Agents
          </div>
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'attendance'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Attendance
          </div>
        </button>
      </div>

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Attendance Log</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="startDate" className="text-sm text-gray-500 whitespace-nowrap">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={attendanceDateRange.start}
                  onChange={(e) => setAttendanceDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="endDate" className="text-sm text-gray-500 whitespace-nowrap">To</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={attendanceDateRange.end}
                  onChange={(e) => setAttendanceDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="w-40"
                />
              </div>
              <Button onClick={fetchAttendance} variant="outline" size="sm" disabled={loadingAttendance}>
                {loadingAttendance ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {loadingAttendance ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-gray-500">Loading attendance records...</p>
            </div>
          ) : attendanceRecords.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarDays className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No attendance records</h3>
              <p className="text-gray-500">No check-in records found for the selected date range</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check In</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check Out</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Hours</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sessions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {attendanceRecords.map((record) => (
                    <tr key={record._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {new Date(record.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {record.userId?.name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {record.checkIn ? new Date(record.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {record.checkOut ? new Date(record.checkOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {record.totalMinutes ? formatDuration(record.totalMinutes) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {record.sessions?.length || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          record.status === 'checked-in'
                            ? 'bg-green-100 text-green-800'
                            : record.status === 'auto-logout'
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {record.status === 'checked-in' ? 'Active' : record.status === 'auto-logout' ? 'Auto Logged Out' : 'Checked Out'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Agents Table */}
      {activeTab === 'agents' && (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">All Agents</h2>
        </div>

        {agents.length === 0 ? (
          <div className="p-12 text-center">
            <User className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No agents yet</h3>
            <p className="text-gray-500">Agents will appear here once they register</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Agent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Registered
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {agents.map((agent) => (
                  <>
                    <tr 
                      key={agent._id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => toggleAgentExpand(agent._id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{agent.name}</div>
                            <div className="text-sm text-gray-500 capitalize">{agent.role}</div>
                          </div>
                          {expandedAgent === agent._id ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="h-4 w-4" />
                            {agent.email}
                          </div>
                          {agent.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Phone className="h-4 w-4" />
                              {agent.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(agent)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(agent.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openAgentActivity(agent);
                            }}
                            title="View Activity"
                          >
                            <Activity className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreateTaskModal(agent);
                            }}
                            title="Create Task"
                          >
                            <CheckSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteAgent(agent._id, agent.name);
                            }}
                            disabled={deletingAgent === agent._id}
                            title="Delete Agent"
                          >
                            {deletingAgent === agent._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded section showing agent's clients/leads */}
                    {expandedAgent === agent._id && (
                      <tr key={`${agent._id}-leads`}>
                        <td colSpan={5} className="px-6 py-4 bg-gray-50">
                          <div className="ml-8">
                            <div className="flex items-center gap-2 mb-3">
                              <Users className="h-5 w-5 text-blue-600" />
                              <h4 className="font-medium text-gray-900">Assigned Clients/Leads</h4>
                            </div>
                            
                            {loadingLeads === agent._id ? (
                              <div className="flex items-center gap-2 text-gray-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading leads...
                              </div>
                            ) : agentLeads[agent._id]?.length === 0 ? (
                              <p className="text-gray-500 text-sm">No clients assigned to this agent yet.</p>
                            ) : (
                              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                                <table className="w-full">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Client Name</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {agentLeads[agent._id]?.map((lead) => (
                                      <tr key={lead._id || lead.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                          {lead.name}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                          <div>{lead.email || '-'}</div>
                                          <div>{lead.phone || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                          {getLeadStatusBadge(lead.status)}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">
                                          {lead.source || '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Create Task Modal */}
      <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Task for {taskModalAgent?.name}</DialogTitle>
            <DialogDescription>Assign a task to this agent with a due date and priority</DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreateTask} className="space-y-4">
            {taskError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{taskError}</p>
              </div>
            )}
            
            {taskSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">Task created successfully!</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="taskTitle">Task Title *</Label>
              <Input
                id="taskTitle"
                placeholder="e.g., Follow up call, Send quote, Schedule meeting"
                value={taskFormData.title}
                onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
                required
                disabled={creatingTask || taskSuccess}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskDescription">Description</Label>
              <Textarea
                id="taskDescription"
                placeholder="Add details about the task..."
                value={taskFormData.description}
                onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                disabled={creatingTask || taskSuccess}
                className="min-h-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskPriority">Priority</Label>
              <Select value={taskFormData.priority} onValueChange={(value) => setTaskFormData({ ...taskFormData, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskDueDate">Due Date</Label>
              <Input
                id="taskDueDate"
                type="date"
                value={taskFormData.dueDate}
                onChange={(e) => setTaskFormData({ ...taskFormData, dueDate: e.target.value })}
                disabled={creatingTask || taskSuccess}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTaskModal(false)}
                disabled={creatingTask}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creatingTask || taskSuccess}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {creatingTask ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    Create Task
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Agent Activity Dialog */}
      {selectedAgent && (
        <AgentActivityDialog
          open={activityDialogOpen}
          onOpenChange={setActivityDialogOpen}
          agentId={selectedAgent._id}
          agentName={selectedAgent.name}
        />
      )}    </div>
  );
}
