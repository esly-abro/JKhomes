import { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  Image,
  Phone,
  Globe,
  Trash2,
  Copy,
  MoreVertical,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Eye,
  X,
  Upload,
  MessageSquare
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import broadcastService, { 
  Broadcast, 
  CreateBroadcastData, 
  CTAButton,
  BroadcastStats 
} from '../../services/broadcasts';

export default function Broadcasts() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [leadsCount, setLeadsCount] = useState<number>(0);
  
  // Form state
  const [formData, setFormData] = useState<CreateBroadcastData>({
    name: '',
    message: '',
    imageUrl: '',
    headerText: '',
    footerText: '',
    buttons: []
  });
  const [imagePreview, setImagePreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Load broadcasts
  useEffect(() => {
    loadBroadcasts();
    loadLeadsCount();
  }, []);

  const loadBroadcasts = async () => {
    try {
      setLoading(true);
      const result = await broadcastService.getBroadcasts();
      setBroadcasts(result.data);
    } catch (error) {
      console.error('Error loading broadcasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLeadsCount = async () => {
    try {
      const count = await broadcastService.getTargetLeadsCount();
      setLeadsCount(count);
    } catch (error) {
      console.error('Error loading leads count:', error);
    }
  };

  const handleCreateNew = () => {
    setFormData({
      name: '',
      message: '',
      imageUrl: '',
      headerText: '',
      footerText: '',
      buttons: []
    });
    setImagePreview('');
    setEditMode(false);
    setEditId(null);
    setShowCreateModal(true);
  };

  const handleEdit = (broadcast: Broadcast) => {
    setFormData({
      name: broadcast.name,
      message: broadcast.message,
      imageUrl: broadcast.imageUrl || '',
      headerText: broadcast.headerText || '',
      footerText: broadcast.footerText || '',
      buttons: broadcast.buttons || []
    });
    setImagePreview(broadcast.imageUrl || '');
    setEditMode(true);
    setEditId(broadcast._id);
    setShowCreateModal(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to server
    try {
      setUploading(true);
      const url = await broadcastService.uploadBroadcastImage(file);
      setFormData(prev => ({ ...prev, imageUrl: url }));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
      setImagePreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleImageUrl = (url: string) => {
    setFormData(prev => ({ ...prev, imageUrl: url }));
    setImagePreview(url);
  };

  const addButton = (type: 'call' | 'url') => {
    if (formData.buttons && formData.buttons.length >= 2) {
      alert('Maximum 2 CTA buttons allowed');
      return;
    }
    
    const newButton: CTAButton = type === 'call' 
      ? { type: 'call', text: '📞 Call Now', phoneNumber: '' }
      : { type: 'url', text: '🌐 View Details', url: '' };
    
    setFormData(prev => ({
      ...prev,
      buttons: [...(prev.buttons || []), newButton]
    }));
  };

  const updateButton = (index: number, updates: Partial<CTAButton>) => {
    setFormData(prev => ({
      ...prev,
      buttons: prev.buttons?.map((btn, i) => 
        i === index ? { ...btn, ...updates } : btn
      ) || []
    }));
  };

  const removeButton = (index: number) => {
    setFormData(prev => ({
      ...prev,
      buttons: prev.buttons?.filter((_, i) => i !== index) || []
    }));
  };

  const handleSave = async (sendNow = false) => {
    if (!formData.name || !formData.message) {
      alert('Name and message are required');
      return;
    }

    // Validate buttons
    for (const btn of formData.buttons || []) {
      if (btn.type === 'call' && !btn.phoneNumber) {
        alert('Phone number required for Call button');
        return;
      }
      if (btn.type === 'url' && !btn.url) {
        alert('URL required for Website button');
        return;
      }
    }

    try {
      setSaving(true);
      let broadcast: Broadcast;

      if (editMode && editId) {
        broadcast = await broadcastService.updateBroadcast(editId, formData);
      } else {
        broadcast = await broadcastService.createBroadcast(formData);
      }

      setShowCreateModal(false);
      loadBroadcasts();

      if (sendNow) {
        handleSend(broadcast._id);
      }
    } catch (error) {
      console.error('Error saving broadcast:', error);
      alert('Failed to save broadcast');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: string) => {
    if (!confirm(`Send this broadcast to ${leadsCount} leads?`)) return;

    try {
      setSendingId(id);
      const result = await broadcastService.sendBroadcast(id);
      alert(`Sending to ${result.totalLeads} leads...`);
      loadBroadcasts();
    } catch (error: any) {
      console.error('Error sending broadcast:', error);
      alert(error.response?.data?.error || 'Failed to send broadcast');
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this broadcast?')) return;

    try {
      await broadcastService.deleteBroadcast(id);
      loadBroadcasts();
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      alert('Failed to delete broadcast');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await broadcastService.duplicateBroadcast(id);
      loadBroadcasts();
    } catch (error) {
      console.error('Error duplicating broadcast:', error);
      alert('Failed to duplicate broadcast');
    }
  };

  const viewStatus = async (broadcast: Broadcast) => {
    setSelectedBroadcast(broadcast);
    setShowStatusModal(true);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-700',
      scheduled: 'bg-blue-100 text-blue-700',
      sending: 'bg-yellow-100 text-yellow-700',
      sent: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      cancelled: 'bg-gray-100 text-gray-500'
    };
    
    const icons: Record<string, React.ReactNode> = {
      draft: <Clock className="h-3 w-3" />,
      scheduled: <Clock className="h-3 w-3" />,
      sending: <Loader2 className="h-3 w-3 animate-spin" />,
      sent: <CheckCircle2 className="h-3 w-3" />,
      failed: <XCircle className="h-3 w-3" />,
      cancelled: <XCircle className="h-3 w-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.draft}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📢 Broadcasts</h1>
          <p className="text-gray-500 mt-1">
            Send WhatsApp messages with images and CTA buttons to all leads
          </p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Broadcast
        </Button>
      </div>

      {/* Stats Card */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-4 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 opacity-80" />
            <div>
              <p className="text-green-100 text-sm">Target Audience</p>
              <p className="text-2xl font-bold">{leadsCount.toLocaleString()} Leads</p>
            </div>
          </div>
          <p className="text-green-100 text-sm">with valid phone numbers</p>
        </div>
      </div>

      {/* Broadcasts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : broadcasts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <MessageSquare className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No broadcasts yet</h3>
          <p className="text-gray-500 mb-4">Create your first broadcast to send messages to all leads</p>
          <Button onClick={handleCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            Create Broadcast
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {broadcasts.map((broadcast) => (
            <div
              key={broadcast._id}
              className="bg-white rounded-lg border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Image Preview */}
              {broadcast.imageUrl ? (
                <div className="h-40 bg-gray-100">
                  <img
                    src={broadcast.imageUrl}
                    alt={broadcast.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="h-40 bg-gray-50 flex items-center justify-center">
                  <Image className="h-12 w-12 text-gray-300" />
                </div>
              )}

              {/* Content */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 truncate flex-1">
                    {broadcast.name}
                  </h3>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {broadcast.status === 'draft' && (
                        <DropdownMenuItem onClick={() => handleEdit(broadcast)}>
                          Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDuplicate(broadcast._id)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      {(broadcast.status === 'sent' || broadcast.status === 'sending') && (
                        <DropdownMenuItem onClick={() => viewStatus(broadcast)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Status
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleDelete(broadcast._id)}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                  {broadcast.message}
                </p>

                {/* Buttons Preview */}
                {broadcast.buttons && broadcast.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {broadcast.buttons.map((btn, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
                      >
                        {btn.type === 'call' ? (
                          <Phone className="h-3 w-3" />
                        ) : (
                          <Globe className="h-3 w-3" />
                        )}
                        {btn.text}
                      </span>
                    ))}
                  </div>
                )}

                {/* Status & Stats */}
                <div className="flex items-center justify-between pt-3 border-t">
                  <div>{getStatusBadge(broadcast.status)}</div>
                  {broadcast.status === 'sent' && (
                    <span className="text-xs text-gray-500">
                      {broadcast.stats.sent}/{broadcast.stats.totalLeads} sent
                    </span>
                  )}
                </div>

                {/* Actions */}
                {broadcast.status === 'draft' && (
                  <Button
                    className="w-full mt-3 gap-2"
                    onClick={() => handleSend(broadcast._id)}
                    disabled={sendingId === broadcast._id}
                  >
                    {sendingId === broadcast._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send to All Leads
                  </Button>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
                Created {formatDate(broadcast.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">
                {editMode ? 'Edit Broadcast' : 'Create Broadcast'}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Summer Sale 2026"
                />
              </div>

              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image (optional)
                </label>
                <div className="space-y-2">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setImagePreview('');
                          setFormData(prev => ({ ...prev, imageUrl: '' }));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500 mb-2">
                        Upload an image or enter URL
                      </p>
                      <div className="flex gap-2 justify-center">
                        <label className="cursor-pointer">
                          <span className="px-3 py-1.5 bg-gray-100 rounded text-sm hover:bg-gray-200">
                            {uploading ? 'Uploading...' : 'Choose File'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                            disabled={uploading}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                  <Input
                    value={formData.imageUrl}
                    onChange={(e) => handleImageUrl(e.target.value)}
                    placeholder="Or enter image URL..."
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Write your promotional message here..."
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={1024}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.message.length}/1024 characters
                </p>
              </div>

              {/* Footer Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Footer Text (optional)
                </label>
                <Input
                  value={formData.footerText}
                  onChange={(e) => setFormData(prev => ({ ...prev, footerText: e.target.value }))}
                  placeholder="e.g., Reply STOP to unsubscribe"
                  maxLength={60}
                />
              </div>

              {/* CTA Buttons */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CTA Buttons (max 2)
                </label>
                
                {formData.buttons && formData.buttons.map((btn, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2 p-3 bg-gray-50 rounded-lg">
                    {btn.type === 'call' ? (
                      <>
                        <Phone className="h-4 w-4 text-green-600" />
                        <Input
                          value={btn.text}
                          onChange={(e) => updateButton(idx, { text: e.target.value })}
                          placeholder="Button text"
                          className="flex-1"
                          maxLength={20}
                        />
                        <Input
                          value={btn.phoneNumber || ''}
                          onChange={(e) => updateButton(idx, { phoneNumber: e.target.value })}
                          placeholder="+919876543210"
                          className="flex-1"
                        />
                      </>
                    ) : (
                      <>
                        <Globe className="h-4 w-4 text-blue-600" />
                        <Input
                          value={btn.text}
                          onChange={(e) => updateButton(idx, { text: e.target.value })}
                          placeholder="Button text"
                          className="flex-1"
                          maxLength={20}
                        />
                        <Input
                          value={btn.url || ''}
                          onChange={(e) => updateButton(idx, { url: e.target.value })}
                          placeholder="https://..."
                          className="flex-1"
                        />
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeButton(idx)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {(!formData.buttons || formData.buttons.length < 2) && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addButton('call')}
                      className="gap-1"
                    >
                      <Phone className="h-4 w-4" />
                      Add Call Button
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addButton('url')}
                      className="gap-1"
                    >
                      <Globe className="h-4 w-4" />
                      Add URL Button
                    </Button>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <p className="text-sm font-medium text-gray-700 mb-3">Preview</p>
                <div className="bg-white rounded-lg border max-w-xs mx-auto overflow-hidden shadow-sm">
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-3">
                    <p className="text-sm whitespace-pre-wrap">
                      {formData.message || 'Your message here...'}
                    </p>
                    {formData.footerText && (
                      <p className="text-xs text-gray-500 mt-2">{formData.footerText}</p>
                    )}
                  </div>
                  {formData.buttons && formData.buttons.length > 0 && (
                    <div className="border-t">
                      {formData.buttons.map((btn, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-center gap-2 p-2 text-blue-600 text-sm border-b last:border-b-0 hover:bg-gray-50"
                        >
                          {btn.type === 'call' ? <Phone className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                          {btn.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t bg-gray-50 sticky bottom-0">
              <p className="text-sm text-gray-500">
                Will send to <strong>{leadsCount}</strong> leads
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save as Draft
                </Button>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={saving}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Save & Send Now
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {showStatusModal && selectedBroadcast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Delivery Status</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowStatusModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-4">
              <h3 className="font-medium mb-4">{selectedBroadcast.name}</h3>
              
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-sm text-blue-600">Total Leads</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {selectedBroadcast.stats.totalLeads}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-sm text-green-600">Sent</p>
                  <p className="text-2xl font-bold text-green-700">
                    {selectedBroadcast.stats.sent}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-sm text-purple-600">Delivered</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {selectedBroadcast.stats.delivered}
                  </p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm text-red-600">Failed</p>
                  <p className="text-2xl font-bold text-red-700">
                    {selectedBroadcast.stats.failed}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>
                    {Math.round((selectedBroadcast.stats.sent / selectedBroadcast.stats.totalLeads) * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${(selectedBroadcast.stats.sent / selectedBroadcast.stats.totalLeads) * 100}%`
                    }}
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="text-sm text-gray-500 space-y-1">
                {selectedBroadcast.startedAt && (
                  <p>Started: {formatDate(selectedBroadcast.startedAt)}</p>
                )}
                {selectedBroadcast.completedAt && (
                  <p>Completed: {formatDate(selectedBroadcast.completedAt)}</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowStatusModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
