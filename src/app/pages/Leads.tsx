import { useState, useEffect } from 'react';
import { useData, Lead } from '../context/DataContext';
import { useNotifications } from '../context/NotificationContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Plus, Upload, Filter, Search, Phone, Mail, Calendar,
  MoreHorizontal, Layout, LayoutList, Table as TableIcon, Headphones, X, Download, User, Building, UserCheck, Home, Trash2
} from 'lucide-react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { createLead, deleteLead, deleteLeads } from '../../services/leads';
import { Label } from '../components/ui/label';
import ImportLeadsDialog from '../components/ImportLeadsDialog';
import { assignLeads } from '../../services/assignments';
import { getUsers } from '../../services/leads';
import { getProperties } from '../../services/properties';
import { getStoredUser } from '../../services/auth';
import * as XLSX from 'xlsx';

// --- Sub-Components for Different Views ---

const LeadsTable = ({
  leads,
  selectedLeads,
  onSelectLead,
  onSelectAll,
  properties,
  onDeleteLead,
  isAdminOrManager
}: {
  leads: Lead[];
  selectedLeads: Set<string>;
  onSelectLead: (leadId: string) => void;
  onSelectAll: (checked: boolean) => void;
  properties: any[];
  onDeleteLead?: (leadId: string, leadName: string) => void;
  isAdminOrManager?: boolean;
}) => {
  const allSelected = leads.length > 0 && leads.every(lead => selectedLeads.has(lead.id));

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-slate-50">
              <th className="px-4 py-4 text-left">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Name</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Phone</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Property</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Assigned To</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Source</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Last Action</th>
              <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const property = properties.find(p => p._id === lead.propertyId);
              // Use local agent assignment (assignedToName) if available, otherwise fall back to owner
              const leadData = lead as any;
              const assignedAgent = leadData.assignedToName ||
                (typeof lead.owner === 'string' ? '' : lead.owner?.name) ||
                'Unassigned';

              return (
                <tr key={lead.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedLeads.has(lead.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => onSelectLead(lead.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">{lead.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{lead.phone}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {property ? (
                      <div className="flex items-center gap-1">
                        <Home className="h-3 w-3 text-blue-500" />
                        <span className="truncate max-w-[150px]" title={property.name}>
                          {property.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">No property</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3 text-gray-400" />
                      <span className={assignedAgent === 'Unassigned' ? 'text-orange-500 italic' : ''}>
                        {assignedAgent}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{lead.source}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {lead.lastActivity ? new Date(lead.lastActivity).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-2">
                      <Link to={`/leads/${lead.id}`}>
                        <Button variant="outline" size="sm" className="rounded-md border-blue-300 text-blue-600 hover:bg-blue-50">
                          Call Agent
                        </Button>
                      </Link>
                      {isAdminOrManager && onDeleteLead && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="rounded-md border-red-300 text-red-600 hover:bg-red-50"
                          onClick={() => onDeleteLead(lead.id, lead.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                  No leads found matching your criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const LeadsList = ({ leads }: { leads: Lead[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {leads.map((lead) => (
      <Card key={lead.id} className="p-4 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{lead.name}</h3>
              <p className="text-xs text-gray-500">{lead.company || 'No Company'}</p>
            </div>
          </div>
          <StatusBadge status={lead.status} />
        </div>

        <div className="space-y-2 text-sm text-gray-600 mb-4">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400" />
            <span className="truncate">{lead.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-400" />
            <span>{lead.phone}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-gray-400" />
            <span>{lead.source}</span>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
          <span className="text-xs text-gray-400">
            {lead.lastActivity ? new Date(lead.lastActivity).toLocaleDateString() : 'No activity'}
          </span>
          <Link to={`/leads/${lead.id}`}>
            <Button size="sm" variant="outline" className="h-8">View Details</Button>
          </Link>
        </div>
      </Card>
    ))}
    {leads.length === 0 && (
      <div className="col-span-full text-center py-12 text-gray-500 bg-gray-50 rounded-lg">
        No leads found matching your criteria.
      </div>
    )}
  </div>
);

const LeadsKanban = ({ leads }: { leads: Lead[] }) => {
  const statuses = ['New', 'Call Attended', 'No Response', 'Not Interested', 'Appointment Booked', 'Appointment Scheduled', 'Site Visit Booked', 'Site Visit Scheduled', 'Interested'];
  // Include statuses that are in leads but not in the default list
  const allStatuses = Array.from(new Set([...statuses, ...leads.map(l => l.status)]));

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-250px)]">
      {allStatuses.map(status => {
        const statusLeads = leads.filter(l => l.status === status);
        return (
          <div key={status} className="min-w-[300px] w-[300px] bg-gray-50 rounded-lg flex flex-col h-full max-h-full">
            <div className="p-3 font-semibold text-sm text-gray-700 flex justify-between items-center bg-gray-100/50 rounded-t-lg border-b border-gray-200">
              <span>{status}</span>
              <span className="bg-white px-2 py-0.5 rounded-full text-xs text-gray-500 border border-gray-200">
                {statusLeads.length}
              </span>
            </div>
            <div className="p-2 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
              {statusLeads.map(lead => (
                <Card key={lead.id} className="p-3 shadow-none border-gray-200 hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all bg-white">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-medium text-sm text-gray-900 truncate" title={lead.name}>{lead.name}</h4>
                    {/* Tiny priority dot if needed */}
                  </div>
                  <div className="text-xs text-gray-500 space-y-1 mb-2">
                    <p className="truncate">{lead.company}</p>
                    <p className="text-gray-400">{lead.phone}</p>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                    <span className="text-[10px] text-gray-400">{lead.source}</span>
                    <Link to={`/leads/${lead.id}`}>
                      <Button size="icon" variant="ghost" className="h-6 w-6">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
              {statusLeads.length === 0 && (
                <div className="text-center py-4 text-xs text-gray-400 italic">No leads</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const getStatusStyles = (s: string) => {
    switch (s) {
      case 'Call Attended':
        return 'bg-blue-100 text-blue-700 hover:bg-blue-100';
      case 'No Response':
      case 'New':
        return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100';
      case 'Site Visit Scheduled':
      case 'Site Visit Booked':
      case 'Appointment Scheduled':
      case 'Appointment Booked':
        return 'bg-purple-100 text-purple-700 hover:bg-purple-100';
      case 'Interested':
        return 'bg-green-100 text-green-700 hover:bg-green-100';
      case 'Not Interested':
        return 'bg-red-100 text-red-700 hover:bg-red-100';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <Badge className={getStatusStyles(status)}>
      {status}
    </Badge>
  );
};


export default function Leads() {
  const { leads, loading, error, refreshLeads } = useData();
  const { addNotification } = useNotifications();
  const { categoryFieldLabel, appointmentFieldLabel } = useTenantConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [view, setView] = useState<'list' | 'kanban' | 'table'>('table');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all'); // New filter
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [autoAssign, setAutoAssign] = useState(false);

  // Get current user to check role for permissions
  const currentUser = getStoredUser();
  const isAdminOrManager = currentUser?.role === 'admin' || currentUser?.role === 'manager' || currentUser?.role === 'owner';
  const isAgent = currentUser?.role === 'agent' || currentUser?.role === 'bpo';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    source: 'Website',
    propertyId: ''
  });

  // Handle URL query params for opening dialogs from header dropdown
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'add') {
      setShowAddDialog(true);
      // Clear the action param from URL
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    } else if (action === 'import') {
      setShowImportDialog(true);
      // Clear the action param from URL
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchUsers();
    fetchProperties();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  const fetchProperties = async () => {
    try {
      const data = await getProperties();
      setProperties(data);
    } catch (error) {
      console.error('Failed to fetch properties:', error);
    }
  };

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(new Set(filteredLeads.map(lead => lead.id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  const handleBulkAssign = async () => {
    if (selectedLeads.size === 0) {
      alert('Please select at least one lead to assign');
      return;
    }

    if (!autoAssign && !selectedAgent) {
      alert('Please select an agent or enable auto-assign');
      return;
    }

    try {
      setAssigning(true);
      const leadIds = Array.from(selectedLeads);
      const result = await assignLeads(leadIds, selectedAgent || undefined, autoAssign);

      const successCount = result.results.filter(r => r.success).length;
      const failCount = result.results.filter(r => !r.success).length;

      alert(`Successfully assigned ${successCount} lead(s)${failCount > 0 ? `, ${failCount} failed` : ''}`);

      setSelectedLeads(new Set());
      setShowAssignDialog(false);
      setSelectedAgent('');
      setAutoAssign(false);
      await refreshLeads();
    } catch (error: any) {
      console.error('Failed to assign leads:', error);
      alert(error.response?.data?.error || 'Failed to assign leads');
    } finally {
      setAssigning(false);
    }
  };

  // Handle single lead delete
  const handleDeleteLead = (leadId: string, leadName: string) => {
    setDeleteTarget({ id: leadId, name: leadName });
    setShowDeleteDialog(true);
  };

  // Confirm and execute delete
  const confirmDelete = async () => {
    if (!deleteTarget && selectedLeads.size === 0) return;

    try {
      setDeleting(true);
      
      if (deleteTarget) {
        // Single delete
        await deleteLead(deleteTarget.id);
        addNotification({
          type: 'system',
          iconType: 'trash',
          title: `Lead deleted: <strong>${deleteTarget.name}</strong>`,
          description: 'Lead has been permanently removed',
          isUnread: true,
        });
      } else {
        // Bulk delete
        const leadIds = Array.from(selectedLeads);
        const result = await deleteLeads(leadIds);
        addNotification({
          type: 'system',
          iconType: 'trash',
          title: `${result.deletedCount} lead(s) deleted`,
          description: result.failedCount > 0 ? `${result.failedCount} failed to delete` : 'All leads removed successfully',
          isUnread: true,
        });
        setSelectedLeads(new Set());
      }

      setShowDeleteDialog(false);
      setDeleteTarget(null);
      await refreshLeads();
    } catch (error: any) {
      console.error('Failed to delete lead(s):', error);
      alert(error.response?.data?.error || 'Failed to delete lead(s)');
    } finally {
      setDeleting(false);
    }
  };

  // Handle bulk delete button click
  const handleBulkDelete = () => {
    if (selectedLeads.size === 0) {
      alert('Please select at least one lead to delete');
      return;
    }
    setDeleteTarget(null); // null means bulk delete
    setShowDeleteDialog(true);
  };

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = (lead.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (lead.company || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter;

    // Owner filter - "my-leads" or specific owner
    let matchesOwner = true;
    if (ownerFilter !== 'all') {
      if (ownerFilter === 'my-leads') {
        // Check if lead is assigned to current user
        const currentUser = getStoredUser();
        if (currentUser) {
          const leadData = lead as any;
          const assignedToId = leadData.assignedTo || (typeof lead.owner === 'object' ? lead.owner?.id : lead.owner);
          matchesOwner = assignedToId === currentUser.id;
        } else {
          matchesOwner = false;
        }
      } else if (ownerFilter === 'unassigned') {
        matchesOwner = !lead.owner || lead.owner === 'Unassigned';
      } else {
        const ownerId = typeof lead.owner === 'string' ? lead.owner : lead.owner?.id;
        matchesOwner = ownerId === ownerFilter;
      }
    }

    return matchesSearch && matchesStatus && matchesSource && matchesOwner;
  });

  const handleExportLeads = async () => {
    try {
      setExporting(true);

      const exportData = leads.map(lead => ({
        'Name': lead.name,
        'Email': lead.email,
        'Phone': lead.phone,
        'Company': lead.company,
        'Source': lead.source,
        'Status': lead.status,
        'Created At': lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '',
        'Last Action': lead.lastActivity ? new Date(lead.lastActivity).toLocaleDateString() : ''
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');

      const colWidths = [
        { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 20 },
        { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
      ];
      ws['!cols'] = colWidths;

      const date = new Date().toISOString().split('T')[0];
      const filename = `zoho_leads_export_${date}.xlsx`;

      XLSX.writeFile(wb, filename);

      alert(`Successfully exported ${leads.length} leads!`);
    } catch (err) {
      console.error('Failed to export leads:', err);
      alert('Failed to export leads. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreating(true);
      await createLead(formData);

      // Add notification for new lead
      const propertyName = properties.find(p => p._id === formData.propertyId)?.name;
      addNotification({
        type: 'lead',
        avatarFallback: formData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase(),
        iconType: 'flag',
        title: `New lead added: <strong>${formData.name}</strong>`,
        description: propertyName ? `Interested in ${propertyName}` : `Source: ${formData.source}`,
        isUnread: true,
      });

      setFormData({ name: '', email: '', phone: '', company: '', source: 'Website', propertyId: '' });
      setShowAddDialog(false);
      await refreshLeads();
      alert('Lead created successfully! It will appear in Zoho CRM.');
    } catch (err: any) {
      console.error('Failed to create lead:', err);
      alert(err.response?.data?.error || 'Failed to create lead. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading leads...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load leads</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {isAgent ? 'My Leads' : 'Leads'}
          </h1>
          <p className="text-gray-600">
            {isAgent
              ? `Manage your assigned leads (${leads.length} leads)`
              : 'Manage and track all your leads in one place'
            }
          </p>
        </div>
        <div className="flex gap-2">
          {selectedLeads.size > 0 && isAdminOrManager && (
            <>
              <Button onClick={() => setShowAssignDialog(true)} className="bg-purple-600 hover:bg-purple-700">
                <UserCheck className="h-4 w-4 mr-2" />
                Assign ({selectedLeads.size})
              </Button>
              <Button onClick={handleBulkDelete} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({selectedLeads.size})
              </Button>
            </>
          )}
          {isAdminOrManager && (
            <>
              <Button variant="outline" onClick={handleExportLeads} disabled={exporting || leads.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
              <Button variant="outline" onClick={() => setShowImportDialog(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Lead
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters and View Toggle */}
      <Card className="p-4 shrink-0">
        <div className="flex flex-col lg:flex-row gap-4 justify-between">
          <div className="flex-1 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Only show owner filter for admins/managers */}
            {isAdminOrManager && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Assigned To" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Leads</SelectItem>
                  <SelectItem value="my-leads">My Leads</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.filter(u => ['agent', 'bpo', 'manager'].includes(u.role)).map(user => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name || user.email.split('@')[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="Call Attended">Call Attended</SelectItem>
                <SelectItem value="No Response">No Response</SelectItem>
                <SelectItem value="Not Interested">Not Interested</SelectItem>
                <SelectItem value="Appointment Booked">{appointmentFieldLabel} Booked</SelectItem>
                {Array.from(new Set(leads.map(l => l.status)))
                  .filter(s => !['New', 'Call Attended', 'No Response', 'Not Interested', 'Appointment Booked', 'Site Visit Booked'].includes(s))
                  .map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)
                }
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="Website">Website</SelectItem>
                <SelectItem value="LinkedIn Ads">LinkedIn Ads</SelectItem>
                <SelectItem value="Referral">Referral</SelectItem>
                <SelectItem value="Google Ads">Google Ads</SelectItem>
                <SelectItem value="Conference">Conference</SelectItem>
                <SelectItem value="Facebook">Facebook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              variant={view === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setView('list')}
              title="List View"
            >
              <LayoutList className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'kanban' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setView('kanban')}
              title="Kanban View"
            >
              <Layout className="h-4 w-4" />
            </Button>
            <Button
              variant={view === 'table' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setView('table')}
              title="Table View"
            >
              <TableIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="text-sm text-gray-600 shrink-0">
        Showing {filteredLeads.length} of {leads.length} leads
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto min-h-0">
        {view === 'table' && (
          <LeadsTable
            leads={filteredLeads}
            selectedLeads={selectedLeads}
            onSelectLead={handleSelectLead}
            onSelectAll={handleSelectAll}
            properties={properties}
            onDeleteLead={handleDeleteLead}
            isAdminOrManager={isAdminOrManager}
          />
        )}
        {view === 'list' && <LeadsList leads={filteredLeads} />}
        {view === 'kanban' && <LeadsKanban leads={filteredLeads} />}
      </div>

      {/* Bulk Assignment Dialog */}
      {showAssignDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Assign Leads</h2>
              <button
                onClick={() => setShowAssignDialog(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>{selectedLeads.size}</strong> lead(s) selected for assignment
                </p>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <input
                  type="checkbox"
                  id="autoAssign"
                  checked={autoAssign}
                  onChange={(e) => {
                    setAutoAssign(e.target.checked);
                    if (e.target.checked) setSelectedAgent('');
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Label htmlFor="autoAssign" className="cursor-pointer flex-1">
                  <div className="font-medium text-gray-900">Auto-Assign with Smart Rules</div>
                  <div className="text-xs text-gray-600">Automatically assign based on workload, {categoryFieldLabel.toLowerCase()} & location</div>
                </Label>
              </div>

              {!autoAssign && (
                <div>
                  <Label htmlFor="agent">Select Agent *</Label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter(u => ['agent', 'bpo', 'manager'].includes(u.role)).map(user => (
                        <SelectItem key={user._id} value={user._id}>
                          {user.name || user.email.split('@')[0]} ({user.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowAssignDialog(false)}
                  className="flex-1"
                  disabled={assigning}
                >
                  Cancel
                </Button>
                <Button onClick={handleBulkAssign} className="flex-1" disabled={assigning}>
                  {assigning ? 'Assigning...' : `Assign Lead${selectedLeads.size > 1 ? 's' : ''}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Add New Lead</h2>
              <button
                onClick={() => setShowAddDialog(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Lead name"
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div>
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Acme Inc"
                />
              </div>

              <div>
                <Label htmlFor="property">Interested Property</Label>
                <Select
                  value={formData.propertyId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, propertyId: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {properties.filter(p => p.status === 'Available').map(property => (
                      <SelectItem key={property._id} value={property._id!}>
                        {property.name} - {property.location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.propertyId && (() => {
                  const selectedProperty = properties.find(p => p._id === formData.propertyId);
                  return selectedProperty?.assignedAgent ? (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <UserCheck className="h-3 w-3" />
                      Will be auto-assigned to {selectedProperty.assignedAgent.name}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">
                      No agent assigned to this property
                    </p>
                  );
                })()}
              </div>

              <div>
                <Label htmlFor="source">Source *</Label>
                <Select
                  value={formData.source}
                  onValueChange={(value) => setFormData({ ...formData, source: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Website">Website</SelectItem>
                    <SelectItem value="Referral">Referral</SelectItem>
                    <SelectItem value="LinkedIn Ads">LinkedIn Ads</SelectItem>
                    <SelectItem value="Google Ads">Google Ads</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                    <SelectItem value="Conference">Conference</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1"
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Lead'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Delete Lead{!deleteTarget ? 's' : ''}</h2>
              <button
                onClick={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Trash2 className="h-5 w-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-800 font-medium">
                      {deleteTarget 
                        ? `Are you sure you want to delete "${deleteTarget.name}"?`
                        : `Are you sure you want to delete ${selectedLeads.size} lead(s)?`
                      }
                    </p>
                    <p className="text-xs text-red-600 mt-1">
                      This action cannot be undone. The lead(s) will be removed from both the app and Zoho CRM.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => { setShowDeleteDialog(false); setDeleteTarget(null); }}
                  className="flex-1"
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmDelete} 
                  className="flex-1 bg-red-600 hover:bg-red-700" 
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImportLeadsDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImportComplete={refreshLeads}
      />
    </div>
  );
}
