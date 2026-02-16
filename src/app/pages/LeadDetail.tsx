import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useTenantConfig } from '../context/TenantConfigContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, User, Phone, MapPin, FileText, Clock, Loader2, PhoneOff, Mic, MicOff, CheckCircle, Mail, Sparkles, MessageSquare, PhoneCall } from 'lucide-react';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DollarSign } from 'lucide-react';
import ScheduleSiteVisitDialog from '../components/ScheduleSiteVisitDialog';
import { useAIVoiceCall } from '../hooks/useAIVoiceCall';
import { updateLeadStatus } from '../../services/leads';
import { WhatsAppTemplate, getTemplates, sendTemplateMessage } from '../../services/whatsapp';
import { makeHumanCall, getCallStatus } from '../../services/twilio';

// Activity type for the lead
interface LeadActivity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  color: string;
}

export default function LeadDetail() {
  const { id } = useParams();
  const { categoryFieldLabel, appointmentFieldLabel, leadStatuses, getStatusColor, getStatusLabel, closedStatusKeys } = useTenantConfig();
  const { leads, activities, updateLead, addActivity } = useData();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [callStatus, setCallStatus] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [leadActivityList, setLeadActivityList] = useState<LeadActivity[]>([]);
  const [callNotes, setCallNotes] = useState<string>('');
  const [notesSaved, setNotesSaved] = useState(false);

  // Close Deal State
  const [closeDealOpen, setCloseDealOpen] = useState(false);
  const [dealValue, setDealValue] = useState('');
  const [dealNotes, setDealNotes] = useState('');

  // AI Call Summary State (auto-fetched when call ends)
  const [aiCallSummary, setAiCallSummary] = useState<string | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);

  // WhatsApp Template State
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [whatsappTemplates, setWhatsappTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Human Phone Call State
  const [isHumanCallConnecting, setIsHumanCallConnecting] = useState(false);
  const [isHumanCallActive, setIsHumanCallActive] = useState(false);
  const [humanCallSid, setHumanCallSid] = useState<string | null>(null);
  const [humanCallStatus, setHumanCallStatus] = useState<string | null>(null);
  const humanCallStatusPollRef = useRef<NodeJS.Timeout | null>(null);

  // Use ElevenLabs Hook
  const {
    makeCall,
    hangUp,
    isConnecting,
    isOnCall,
    error: callError,
    formattedDuration,
  } = useAIVoiceCall({
    onCallStarted: () => {
      setCallStatus('🔊 Call initiated via ElevenLabs');
    },
    onCallEnded: () => {
      setCallStatus('📞 Call ended - Fetching AI summary...');
      // Auto-fetch AI summary when call ends
      if (lead?.phone) {
        fetchAISummaryAfterCall(lead.phone);
      }
      setTimeout(() => setCallStatus(null), 5000);
    },
    onError: (err: string) => setCallStatus(`❌ Error: ${err}`),
  });

  // Auto-fetch AI Summary after call ends
  const fetchAISummaryAfterCall = async (phoneNumber: string) => {
    setAiSummaryLoading(true);
    // Wait a few seconds for ElevenLabs to process the call
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`http://localhost:4000/api/elevenlabs/summary/${encodeURIComponent(phoneNumber)}?leadId=${encodeURIComponent(id || '')}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();

      if (data.success && data.data?.summary) {
        setAiCallSummary(data.data.summary);
        // Save to localStorage for persistence
        localStorage.setItem(`lead_ai_summary_${id}`, data.data.summary);
        addLeadActivity('note', 'AI Call Summary received', 'bg-purple-500');
        
        // If backend auto-updated the lead status, reflect it in the UI
        if (data.data.statusUpdated && data.data.newStatus && id) {
          updateLead(id, { status: data.data.newStatus });
          setSelectedStatus(data.data.newStatus);
          addLeadActivity('status_change', `Status auto-updated to: ${data.data.newStatus}`, 'bg-green-500');
        }
      }
    } catch (error) {
      console.error('Error fetching AI summary:', error);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // Track call connection for activity logging
  useEffect(() => {
    if (isOnCall && id) {
      // Call just connected - log activity
      const stored = localStorage.getItem(`lead_activities_${id}`);
      const activities = stored ? JSON.parse(stored) : [];
      const connectedActivity = {
        id: Date.now().toString(),
        type: 'call',
        description: 'AI Call Initiated',
        timestamp: new Date().toISOString(),
        color: 'bg-green-500'
      };
      const updated = [connectedActivity, ...activities];
      localStorage.setItem(`lead_activities_${id}`, JSON.stringify(updated));
      setLeadActivityList(updated);
    }
  }, [isOnCall, id]);

  const lead = leads.find(l => l.id === id);
  const leadActivities = activities.filter(a => a.leadId === id);

  // Load activities from localStorage on mount
  useEffect(() => {
    if (id) {
      const stored = localStorage.getItem(`lead_activities_${id}`);
      if (stored) {
        setLeadActivityList(JSON.parse(stored));
      } else {
        // Initialize with Lead Created activity
        const initialActivity: LeadActivity = {
          id: '1',
          type: 'created',
          description: 'Lead Created',
          timestamp: lead?.createdAt || new Date().toISOString(),
          color: 'bg-blue-500'
        };
        setLeadActivityList([initialActivity]);
      }
    }
  }, [id, lead?.createdAt]);

  // Load saved notes from localStorage or lead data
  useEffect(() => {
    if (id) {
      const savedNotes = localStorage.getItem(`lead_notes_${id}`);
      if (savedNotes) {
        setCallNotes(savedNotes);
      } else if (lead?.notes) {
        setCallNotes(lead.notes);
      }
    }
  }, [id, lead?.notes]);

  // Save activities to localStorage whenever they change
  useEffect(() => {
    if (id && leadActivityList.length > 0) {
      localStorage.setItem(`lead_activities_${id}`, JSON.stringify(leadActivityList));
    }
  }, [id, leadActivityList]);

  // Add a new activity
  const addLeadActivity = (type: string, description: string, color: string) => {
    const newActivity: LeadActivity = {
      id: Date.now().toString(),
      type,
      description,
      timestamp: new Date().toISOString(),
      color
    };
    setLeadActivityList(prev => [newActivity, ...prev]);

    // Also add to global activities context
    if (id) {
      addActivity({
        type: type as any,
        leadId: id,
        title: description, // Use description as title
        description,
        timestamp: new Date().toISOString(),
        user: 'Agent'
      });
    }
  };

  // Handle call button click
  const handleCall = async () => {
    if (!lead?.phone) return;

    if (isOnCall) {
      hangUp();
      addLeadActivity('call', `Call Ended`, 'bg-gray-500');
    } else {
      setCallStatus('📞 Connecting to ElevenLabs...');
      addLeadActivity('call', 'Call Initiated', 'bg-blue-500');
      // Use makeCall from the new hook
      const success = await makeCall(lead.phone, lead.id, lead.name);
      if (!success && !callError) {
        setCallStatus('❌ Failed to connect call');
        addLeadActivity('call', 'Call Failed', 'bg-red-500');
        setTimeout(() => setCallStatus(null), 3000);
      }
    }
  };

  // Handle Human Phone Call button click
  const handleHumanCall = async () => {
    if (!lead?.phone) return;

    if (isHumanCallActive) {
      // Call is active, user wants to end/close
      setIsHumanCallActive(false);
      setHumanCallSid(null);
      setHumanCallStatus(null);
      addLeadActivity('call', 'Human Call Closed', 'bg-gray-500');
      // Clear polling
      if (humanCallStatusPollRef.current) {
        clearInterval(humanCallStatusPollRef.current);
        humanCallStatusPollRef.current = null;
      }
    } else {
      // Start new human call via ElevenLabs
      setIsHumanCallConnecting(true);
      setHumanCallStatus('📞 Initiating call via ElevenLabs...');
      addLeadActivity('call', 'Human Call Initiated', 'bg-orange-500');

      try {
        const result = await makeHumanCall(lead.phone, lead.id, lead.name);
        
        if (result.success) {
          const callId = result.callSid || result.conversationId || 'call';
          setHumanCallSid(callId);
          setIsHumanCallActive(true);
          setHumanCallStatus(`🔊 Call ${result.status || 'initiated'} - Lead will receive a call`);
          addLeadActivity('call', `Human Call Connected${callId !== 'call' ? ` (ID: ${callId.substring(0, 8)}...)` : ''}`, 'bg-green-500');
          
          // Auto-reset after 30 seconds since ElevenLabs webhooks handle the actual call lifecycle
          setTimeout(() => {
            if (isHumanCallActive) {
              setHumanCallStatus('📞 Call in progress - close when done');
            }
          }, 5000);
        } else {
          setHumanCallStatus(`❌ Failed: ${result.error || 'Unknown error'}`);
          addLeadActivity('call', `Human Call Failed: ${result.error}`, 'bg-red-500');
          setTimeout(() => setHumanCallStatus(null), 5000);
        }
      } catch (error: any) {
        console.error('Human call error:', error);
        setHumanCallStatus(`❌ Error: ${error.message}`);
        addLeadActivity('call', `Human Call Error: ${error.message}`, 'bg-red-500');
        setTimeout(() => setHumanCallStatus(null), 5000);
      } finally {
        setIsHumanCallConnecting(false);
      }
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (humanCallStatusPollRef.current) {
        clearInterval(humanCallStatusPollRef.current);
      }
    };
  }, []);

  // Load WhatsApp templates
  const loadWhatsAppTemplates = async () => {
    setIsLoadingTemplates(true);
    setTemplateError(null);
    try {
      const templates = await getTemplates();
      setWhatsappTemplates(templates);
    } catch (error: any) {
      console.error('Failed to load WhatsApp templates:', error);
      setTemplateError(error.response?.data?.error || 'Failed to load templates. Please configure WhatsApp in Settings.');
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  // Send WhatsApp template
  const handleSendWhatsAppTemplate = async () => {
    if (!selectedTemplate || !lead?.phone) return;

    setIsSendingWhatsApp(true);
    try {
      const result = await sendTemplateMessage(lead.phone, selectedTemplate);
      
      if (result.messageId) {
        addLeadActivity('whatsapp', `WhatsApp template "${selectedTemplate}" sent`, 'bg-green-500');
        setUpdateMessage('WhatsApp message sent successfully!');
        setWhatsappDialogOpen(false);
        setTimeout(() => setUpdateMessage(null), 3000);
      }
    } catch (error: any) {
      console.error('Failed to send WhatsApp template:', error);
      setUpdateMessage(`Failed to send WhatsApp: ${error.response?.data?.error || error.message}`);
      setTimeout(() => setUpdateMessage(null), 5000);
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Load saved AI summary from localStorage and always fetch from API on mount (for status update)
  useEffect(() => {
    if (id && lead?.phone) {
      // Show cached summary immediately for fast UX
      const savedSummary = localStorage.getItem(`lead_ai_summary_${id}`);
      if (savedSummary) {
        setAiCallSummary(savedSummary);
      }

      // Always call API to check for status updates (even if we have cached summary)
      const token = localStorage.getItem('accessToken');
      fetch(`http://localhost:4000/api/elevenlabs/summary/${encodeURIComponent(lead.phone)}?leadId=${encodeURIComponent(id || '')}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data?.summary) {
            setAiCallSummary(data.data.summary);
            localStorage.setItem(`lead_ai_summary_${id}`, data.data.summary);
            
            // If backend auto-updated the lead status, reflect it in the UI
            if (data.data.statusUpdated && data.data.newStatus && id) {
              updateLead(id, { status: data.data.newStatus });
              setSelectedStatus(data.data.newStatus);
              addLeadActivity('status_change', `Status auto-updated to: ${data.data.newStatus}`, 'bg-green-500');
            }
          }
        })
        .catch(err => console.error('Error fetching initial AI summary:', err));
    }
  }, [id, lead?.phone]);

  if (!lead) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold text-gray-900">Lead not found</h2>
        <Link to="/leads">
          <Button className="mt-4">Back to Leads</Button>
        </Link>
      </div>
    );
  }

  // Get time ago string
  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  const getStatusBadgeColor = (status: string) => {
    const color = getStatusColor(status);
    return `bg-opacity-10 text-opacity-90`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-2">
          <Link to="/leads">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-blue-900">Call Center Agent Dashboard</h1>
        </div>
        <p className="text-gray-600 ml-14">Assigned Lead Details</p>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Lead Information */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            {/* Header with Status */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-700 mb-2">Lead Information</h2>
                <Badge style={{ backgroundColor: `${getStatusColor(lead.status)}20`, color: getStatusColor(lead.status) }}>
                  {getStatusLabel(lead.status)}
                </Badge>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Lead ID</div>
                <div className="font-semibold text-blue-600">#LD-{lead.id.padStart(4, '0')}</div>
              </div>
            </div>

            {/* Lead Details Cards */}
            <div className="space-y-3">
              {/* Full Name */}
              <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-lg">
                <div className="bg-blue-500 rounded-full p-2">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-600">Full Name</div>
                  <div className="font-semibold text-gray-900">{lead.name}</div>
                </div>
              </div>

              {/* Phone Number */}
              <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-lg">
                <div className="bg-green-500 rounded-full p-2">
                  <Phone className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-600">Phone Number</div>
                  <div className="font-semibold text-gray-900">{lead.phone}</div>
                </div>
              </div>

              {/* Property Interested */}
              <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-lg">
                <div className="bg-purple-500 rounded-full p-2">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-600">{categoryFieldLabel}</div>
                  <div className="font-semibold text-gray-900">{lead.company}</div>
                </div>
              </div>

              {/* Source */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">Source</div>
                <div className="font-medium text-gray-900">{lead.source}</div>
              </div>

              {/* Last Activity */}
              <div className="flex items-center gap-3 bg-gray-50 p-4 rounded-lg">
                <div className="bg-orange-500 rounded-full p-2">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-xs text-gray-600">Last Activity</div>
                  <div className="font-medium text-gray-900">IVR Call Attempted - {lead.lastActivity}</div>
                </div>
              </div>
            </div>

            {/* Call Status */}
            {callStatus && (
              <div className={`p-3 rounded-lg mb-4 mt-4 ${callStatus.includes('✅') || callStatus.includes('🔊') ? 'bg-green-100 text-green-800' : callStatus.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                {callStatus}
                {isOnCall && <span className="ml-2 font-mono">Connecting...</span>}
              </div>
            )}

            {/* On Call Controls */}
            {isOnCall && (
              <div className="flex gap-4 mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex-1 text-center text-gray-600 text-sm">
                  Call initiated. Check phone/dash for status.
                </div>
                <Button
                  onClick={hangUp}
                  variant="destructive"
                  className="flex-1"
                >
                  <PhoneOff className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>
            )}

            {/* Human Call Status */}
            {humanCallStatus && (
              <div className={`p-3 rounded-lg mb-4 mt-4 ${humanCallStatus.includes('✅') || humanCallStatus.includes('🔊') ? 'bg-orange-100 text-orange-800' : humanCallStatus.includes('❌') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                {humanCallStatus}
                {isHumanCallActive && <span className="ml-2 animate-pulse">●</span>}
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-4 mt-6">
              <Button
                className={isOnCall ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"}
                onClick={handleCall}
                disabled={isConnecting || isHumanCallConnecting || isHumanCallActive}
              >
                {isConnecting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : isOnCall ? (
                  <PhoneOff className="h-4 w-4 mr-2" />
                ) : (
                  <Phone className="h-4 w-4 mr-2" />
                )}
                {isConnecting ? 'Connecting...' : isOnCall ? 'End' : 'AI Call Now'}
              </Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700 text-white"
                onClick={() => {
                  // Open phone dialer with lead's number (works on mobile & desktop with phone apps)
                  const phoneNumber = lead.phone.replace(/[^0-9+]/g, '');
                  const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : 
                    (phoneNumber.length === 10 ? `+91${phoneNumber}` : `+${phoneNumber}`);
                  window.open(`tel:${formattedNumber}`, '_self');
                  addLeadActivity('call', `Human Call initiated to ${lead.phone}`, 'bg-orange-500');
                }}
              >
                <PhoneCall className="h-4 w-4 mr-2" />
                Human Call
              </Button>
              <Button
                className="bg-[#25D366] hover:bg-[#128C7E] text-white"
                onClick={() => {
                  setWhatsappDialogOpen(true);
                  loadWhatsAppTemplates();
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  if (lead.email) {
                    // Open Gmail compose with pre-filled recipient and subject
                    const subject = encodeURIComponent(`Follow up - ${lead.name}`);
                    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${lead.email}&su=${subject}`;
                    window.open(gmailUrl, '_blank');
                    // Log Email activity
                    addLeadActivity('email', 'Email Composed via Gmail', 'bg-blue-500');
                  }
                }}
              >
                <Mail className="h-4 w-4 mr-2" />
                Email
              </Button>
              <Button
                variant="outline"
                className="border-gray-300"
                onClick={() => {
                  setDialogOpen(true);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Schedule {appointmentFieldLabel}
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => setCloseDealOpen(true)}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Close Deal
              </Button>
            </div>

            {/* Call Notes */}
            <div className="mt-6">
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Call Notes</label>
              <Textarea
                placeholder="Enter notes from the call..."
                rows={4}
                className="resize-none"
                value={callNotes}
                onChange={(e) => {
                  setCallNotes(e.target.value);
                  setNotesSaved(false);
                }}
              />
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (callNotes.trim()) {
                      // Save notes to localStorage
                      localStorage.setItem(`lead_notes_${id}`, callNotes);
                      addLeadActivity('note', `Notes saved: "${callNotes.substring(0, 50)}${callNotes.length > 50 ? '...' : ''}"`, 'bg-gray-500');
                      setNotesSaved(true);
                      setTimeout(() => setNotesSaved(false), 3000);
                    }
                  }}
                  disabled={!callNotes.trim()}
                >
                  Save Notes
                </Button>
                {notesSaved && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" /> Saved!
                  </span>
                )}
              </div>
            </div>

            {/* AI Call Summary - Auto populated */}
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-600" />
                <label className="text-sm font-semibold text-gray-700">AI Call Summary</label>
                {aiSummaryLoading && <span className="text-xs text-purple-600 animate-pulse">Generating summary...</span>}
              </div>

              {aiCallSummary ? (
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap shadow-sm">
                  {aiCallSummary}
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <p className="text-gray-500 text-sm italic mb-1">
                    {aiSummaryLoading ? 'Analyzing call conversation...' : 'No AI summary available yet'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {aiSummaryLoading ? 'Please wait, this may take a moment.' : 'Make an AI call to generate a conversation summary.'}
                  </p>
                </div>
              )}
            </div>

            {/* Update Status */}
            <div className="mt-6">
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Update Status</label>
              <Select value={selectedStatus || lead.status} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {leadStatuses.filter(s => !s.isClosed).map(s => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Update Message */}
            {updateMessage && (
              <div className="mt-2 p-2 bg-green-100 text-green-800 rounded-lg flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                {updateMessage}
              </div>
            )}

            {/* Update Status Button */}
            <Button
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={async () => {
                if (!selectedStatus && !lead.status) return;
                setIsUpdating(true);
                const newStatus = selectedStatus || lead.status;

                try {
                  // Call backend API to update status (which syncs to Zoho CRM)
                  await updateLeadStatus(lead.id, newStatus);

                  // Also update local state
                  updateLead(lead.id, { status: newStatus });

                  addLeadActivity('status', `Status Updated: ${getStatusLabel(newStatus)}`, 'bg-gray-500');

                  setUpdateMessage(`✅ Status updated to "${newStatus}" and synced to Zoho CRM`);
                  setTimeout(() => {
                    setIsUpdating(false);
                    setUpdateMessage(null);
                  }, 3000);
                } catch (error: any) {
                  console.error('Failed to update status:', error);
                  setUpdateMessage(`❌ Failed to update status: ${error.message || 'Unknown error'}`);
                  setTimeout(() => {
                    setIsUpdating(false);
                    setUpdateMessage(null);
                  }, 5000);
                }
              }}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Status & Sync to CRM'
              )}
            </Button>
          </Card>
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="lg:col-span-1">
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-6">Activity Timeline</h3>
            {leadActivityList.length === 0 ? (
              <p className="text-gray-500 text-sm">No activities yet</p>
            ) : (
              <div className="space-y-4">
                {leadActivityList.map((item, index) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                      {index < leadActivityList.length - 1 && (
                        <div className="w-0.5 h-full bg-gray-200 my-1"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="text-xs text-gray-600 mb-1">{getTimeAgo(item.timestamp)}</div>
                      <div className="text-sm font-medium text-gray-900">{item.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div >

      {/* Schedule Appointment Dialog */}
      {
        lead && (
          <ScheduleSiteVisitDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            lead={lead}
            onConfirm={(details) => {
              addLeadActivity(`${appointmentFieldLabel} Scheduled for ${details.visitDate} at ${details.timeSlot}`, 'appointment', 'bg-purple-500');
            }}
          />
        )
      }

      {/* Close Deal Dialog */}
      <Dialog open={closeDealOpen} onOpenChange={setCloseDealOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Deal - Mark as Won</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dealValue">Deal Value (Revenue)</Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                <Input
                  id="dealValue"
                  placeholder="0.00"
                  className="pl-9"
                  value={dealValue}
                  onChange={(e) => {
                    // Only allow numbers
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setDealValue(val);
                  }}
                />
              </div>
              <p className="text-xs text-gray-500">Enter the total value of the closed deal.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dealNotes">Closing Notes (Optional)</Label>
              <Textarea
                id="dealNotes"
                placeholder="Any additional details about the deal..."
                value={dealNotes}
                onChange={(e) => setDealNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDealOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={async () => {
                const value = parseInt(dealValue || '0', 10);
                if (value <= 0) {
                  alert('Please enter a valid deal value');
                  return;
                }

                setIsUpdating(true);
                try {
                  // Call updateLeadStatus for status if needed, but updateLead handles everything
                  // We'll trust updateLead to handle the backend update via DataContext -> API
                  await updateLead(lead.id, {
                    status: 'Deal Closed',
                    value: value,
                    notes: lead.notes ? `${lead.notes}\n\n[Deal Closed]: ${dealNotes}` : `[Deal Closed]: ${dealNotes}`
                  });

                  addLeadActivity('status', `Deal Closed! Revenue: $${value.toLocaleString()}`, 'bg-emerald-500');
                  setUpdateMessage('🎉 Deal Closed successfully! Revenue recorded.');
                  setCloseDealOpen(false);

                  setTimeout(() => {
                    setUpdateMessage(null);
                    setIsUpdating(false); // Reset updating state
                  }, 3000);
                } catch (error) {
                  console.error('Failed to close deal:', error);
                  setIsUpdating(false);
                }
              }}
              disabled={!dealValue || isUpdating}
            >
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <DollarSign className="h-4 w-4 mr-2" />}
              Confirm Close Deal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Template Dialog */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-green-600" />
              Send WhatsApp Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Phone Number
              </label>
              <Input
                value={lead.phone || ''}
                disabled
                className="bg-gray-50"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Select Template
              </label>
              {isLoadingTemplates ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-gray-600">Loading templates...</span>
                </div>
              ) : templateError ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{templateError}</p>
                </div>
              ) : whatsappTemplates.length === 0 ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-700">
                    No templates found. Please configure WhatsApp in Settings first.
                  </p>
                </div>
              ) : (
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {whatsappTemplates.map((template) => (
                      <SelectItem key={template.name} value={template.name}>
                        <div>
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {template.category} • {template.language}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedTemplate && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-1">Preview:</p>
                {(() => {
                  const template = whatsappTemplates.find(t => t.name === selectedTemplate);
                  return template?.components?.find(c => c.type === 'BODY')?.text || 'Template preview not available';
                })()}
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setWhatsappDialogOpen(false);
                setSelectedTemplate('');
                setTemplateError('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendWhatsAppTemplate}
              disabled={!selectedTemplate || isSendingWhatsApp}
              className="bg-[#25D366] hover:bg-[#128C7E] text-white"
            >
              {isSendingWhatsApp ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Send Template
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
