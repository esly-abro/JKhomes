import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Search, Send, MoreVertical, Phone, Video, Loader2, MessageSquare } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import {
  getConversations,
  getConversation,
  sendMessage as sendMessageAPI,
  markConversationRead,
  searchMessages,
  type ConversationSummary,
  type ConversationMessage
} from '../../services/messages';

const TEMPLATES = [
  { label: 'Follow-up message', text: 'Hi, I wanted to follow up on our previous conversation. Do you have any questions or concerns I can help with?' },
  { label: 'Meeting request', text: 'I\'d love to schedule a meeting to discuss this further. What time works best for you?' },
  { label: 'Pricing info', text: 'I\'m sending over the pricing details we discussed. Please let me know if you have any questions.' },
];

export default function Messages() {
  const { leads } = useData();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ConversationMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const result = await getConversations();
      setConversations(result.data || []);
      // Auto-select first conversation
      if (result.data?.length && !selectedLeadId) {
        setSelectedLeadId(result.data[0].leadId || result.data[0]._id);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load thread when conversation is selected
  useEffect(() => {
    if (selectedLeadId) {
      loadThread(selectedLeadId);
    }
  }, [selectedLeadId]);

  const loadThread = async (leadId: string) => {
    try {
      setLoadingThread(true);
      const result = await getConversation(leadId);
      setThreadMessages(result.data || []);
      // Mark as read
      markConversationRead(leadId).catch(() => {});
      // Update unread in sidebar
      setConversations(prev => prev.map(c =>
        (c.leadId || c._id) === leadId ? { ...c, unreadCount: 0 } : c
      ));
    } catch (err) {
      console.error('Failed to load thread:', err);
    } finally {
      setLoadingThread(false);
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  // Send message
  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !selectedLeadId || sending) return;
    const text = messageText.trim();
    setMessageText('');
    setSending(true);
    try {
      const result = await sendMessageAPI(selectedLeadId, text);
      setThreadMessages(prev => [...prev, result.data]);
      // Update sidebar last message
      setConversations(prev => prev.map(c =>
        (c.leadId || c._id) === selectedLeadId
          ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() }
          : c
      ));
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessageText(text); // Restore on failure
    } finally {
      setSending(false);
    }
  }, [messageText, selectedLeadId, sending]);

  // Search
  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      fetchConversations();
      return;
    }
    try {
      const result = await searchMessages(q);
      // Show matching conversations
      if (result.data) {
        setConversations(result.data);
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  // Insert template text
  const handleTemplate = (text: string) => {
    setMessageText(text);
  };

  // Find lead info
  const selectedConv = conversations.find(c => (c.leadId || c._id) === selectedLeadId);
  const lead = leads.find(l => l.id === selectedLeadId || l._id === selectedLeadId);

  // Format time
  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-600">Communicate with your leads in real-time</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-250px)]">
        {/* Conversations List */}
        <Card className="lg:col-span-1 p-4 overflow-y-auto">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search conversations..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No conversations yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => {
                  const convId = conv.leadId || conv._id;
                  return (
                    <div
                      key={convId}
                      onClick={() => setSelectedLeadId(convId)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedLeadId === convId
                          ? 'bg-blue-50 border-2 border-blue-600'
                          : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{conv.leadName || 'Unknown Lead'}</span>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-blue-600 text-white text-xs">{conv.unreadCount}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">{conv.lastMessage}</p>
                      <span className="text-xs text-gray-500">{formatTime(conv.lastMessageAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Chat Thread */}
        <Card className="lg:col-span-2 flex flex-col">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{selectedConv?.leadName || lead?.name || 'Select a conversation'}</h3>
              <p className="text-sm text-gray-600">{lead?.email || ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={() => lead?.phone && window.open(`tel:${lead.phone}`)}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled>
                <Video className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" disabled>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {loadingThread ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : threadMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MessageSquare className="h-12 w-12 mx-auto mb-2" />
                <p>No messages yet. Start a conversation!</p>
              </div>
            ) : (
              threadMessages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] p-3 rounded-lg ${
                      msg.direction === 'outbound'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {msg.direction === 'inbound' && (
                      <p className="text-xs font-semibold mb-1">{msg.senderName}</p>
                    )}
                    <p>{msg.body}</p>
                    <span className={`text-xs ${msg.direction === 'outbound' ? 'text-blue-100' : 'text-gray-500'}`}>
                      {formatTime(msg.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={!selectedLeadId || sending}
              />
              <Button onClick={handleSend} disabled={!messageText.trim() || !selectedLeadId || sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* Lead Quick View */}
        <Card className="p-4 overflow-y-auto">
          <h3 className="font-semibold mb-4">Lead Information</h3>
          {lead ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">Name</label>
                <div className="font-semibold">{lead.name}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Company</label>
                <div>{lead.company}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Email</label>
                <div className="text-sm">{lead.email}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Phone</label>
                <div className="text-sm">{lead.phone}</div>
              </div>
              <div>
                <label className="text-sm text-gray-600">Status</label>
                <Badge className="mt-1">{lead.status}</Badge>
              </div>
              <div>
                <label className="text-sm text-gray-600">Deal Value</label>
                <div className="text-lg font-bold">₹{lead.value?.toLocaleString() || '0'}</div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate(`/leads/${lead.id || lead._id}`)}>
                View Full Profile
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Select a conversation to see lead info</p>
          )}

          <div className="mt-6">
            <h4 className="font-semibold mb-2">Quick Templates</h4>
            <div className="space-y-2">
              {TEMPLATES.map((tmpl, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="w-full text-left justify-start text-sm"
                  onClick={() => handleTemplate(tmpl.text)}
                >
                  {tmpl.label}
                </Button>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
