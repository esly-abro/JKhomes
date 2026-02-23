import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Search, Send, Phone, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { parseApiError } from '../lib/parseApiError';
import {
  getConversations,
  getConversation,
  sendMessage as sendMessageAPI,
  markConversationRead,
  searchMessages,
  type ConversationSummary,
  type ConversationMessage,
  type ConversationListResponse,
} from '../../services/messages';

const TEMPLATES = [
  { label: 'Follow-up message', text: 'Hi, I wanted to follow up on our previous conversation. Do you have any questions or concerns I can help with?' },
  { label: 'Meeting request', text: "I'd love to schedule a meeting to discuss this further. What time works best for you?" },
  { label: 'Pricing info', text: "I'm sending over the pricing details we discussed. Please let me know if you have any questions." },
];

export default function Messages() {
  const { leads } = useData();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // --- Conversation list state ---
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listPage, setListPage] = useState(1);
  const [listTotalPages, setListTotalPages] = useState(1);

  // --- Thread state ---
  const [threadMessages, setThreadMessages] = useState<ConversationMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [threadPage, setThreadPage] = useState(1);

  // --- Input state ---
  const [messageText, setMessageText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);

  // --- Fetch conversation list ---
  const fetchConversations = useCallback(async (page = 1) => {
    setLoading(true);
    setListError(null);
    try {
      const result: ConversationListResponse = await getConversations(page);
      const items = result?.data ?? [];
      setConversations(items);
      setListPage(result?.pagination?.page ?? 1);
      setListTotalPages(result?.pagination?.totalPages ?? 1);
      if (items.length > 0 && !selectedLeadId) {
        setSelectedLeadId(items[0].leadId || items[0]._id);
      }
    } catch (err) {
      const parsed = parseApiError(err);
      setListError(parsed.message);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [selectedLeadId]);

  useEffect(() => { fetchConversations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Load thread ---
  const loadThread = useCallback(async (leadId: string, page = 1, append = false) => {
    setLoadingThread(true);
    setThreadError(null);
    try {
      const result = await getConversation(leadId, page);
      const msgs = result?.data ?? [];
      setThreadMessages(prev => append ? [...msgs, ...prev] : msgs);
      setThreadPage(result?.pagination?.page ?? 1);
      setHasOlderMessages((result?.pagination?.page ?? 1) < (result?.pagination?.totalPages ?? 1));
      markConversationRead(leadId).catch(() => {});
      setConversations(prev => prev.map(c =>
        (c.leadId || c._id) === leadId ? { ...c, unreadCount: 0 } : c
      ));
    } catch (err) {
      const parsed = parseApiError(err);
      setThreadError(parsed.message);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLeadId) {
      setThreadMessages([]);
      loadThread(selectedLeadId);
    }
  }, [selectedLeadId, loadThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages]);

  // --- Send message (state sync: thread + sidebar update) ---
  const handleSend = useCallback(async () => {
    if (!messageText.trim() || !selectedLeadId || sending) return;
    const text = messageText.trim();
    setMessageText('');
    setSending(true);
    try {
      const result = await sendMessageAPI(selectedLeadId, text);
      if (result?.data) {
        setThreadMessages(prev => [...prev, result.data]);
      }
      setConversations(prev => {
        const updated = prev.map(c =>
          (c.leadId || c._id) === selectedLeadId
            ? { ...c, lastMessage: text, lastMessageAt: new Date().toISOString() }
            : c
        );
        const idx = updated.findIndex(c => (c.leadId || c._id) === selectedLeadId);
        if (idx > 0) { const [moved] = updated.splice(idx, 1); updated.unshift(moved); }
        return updated;
      });
      addToast('Message sent', 'success', 2000);
    } catch (err) {
      addToast(parseApiError(err).message, 'error');
      setMessageText(text);
    } finally {
      setSending(false);
    }
  }, [messageText, selectedLeadId, sending, addToast]);

  // --- Debounced search ---
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      if (!q.trim()) { fetchConversations(); return; }
      try {
        const result = await searchMessages(q);
        setConversations(result?.data ?? []);
      } catch (err) {
        addToast(parseApiError(err).message, 'error');
      }
    }, 350);
  }, [fetchConversations, addToast]);

  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

  // --- Derived ---
  const selectedConv = conversations.find(c => (c.leadId || c._id) === selectedLeadId);
  const lead = leads.find(l => l.id === selectedLeadId || (l as any)._id === selectedLeadId);

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
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
        {/* ── Sidebar ── */}
        <Card className="lg:col-span-1 p-4 overflow-y-auto flex flex-col">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search conversations…" className="pl-10" value={searchQuery} onChange={e => handleSearch(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
          ) : listError ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-red-500">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm text-center">{listError}</p>
              <Button variant="outline" size="sm" onClick={() => fetchConversations()}>Retry</Button>
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <MessageSquare className="h-10 w-10 mb-2 text-gray-300" />
              <p className="text-sm">{searchQuery ? 'No matching conversations' : 'No conversations yet'}</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 flex-1 overflow-y-auto">
                {conversations.map(conv => {
                  const convId = conv.leadId || conv._id;
                  return (
                    <div
                      key={convId}
                      onClick={() => setSelectedLeadId(convId)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedLeadId === convId ? 'bg-blue-50 border-2 border-blue-600' : 'hover:bg-gray-50 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm truncate">{conv.leadName || 'Unknown Lead'}</span>
                        {(conv.unreadCount ?? 0) > 0 && <Badge className="bg-blue-600 text-white text-xs ml-1">{conv.unreadCount}</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 truncate">{conv.lastMessage || '—'}</p>
                      <span className="text-xs text-gray-500">{formatTime(conv.lastMessageAt)}</span>
                    </div>
                  );
                })}
              </div>
              {listTotalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t mt-2">
                  <Button variant="outline" size="sm" disabled={listPage <= 1} onClick={() => fetchConversations(listPage - 1)}>Prev</Button>
                  <span className="text-xs text-gray-500">{listPage}/{listTotalPages}</span>
                  <Button variant="outline" size="sm" disabled={listPage >= listTotalPages} onClick={() => fetchConversations(listPage + 1)}>Next</Button>
                </div>
              )}
            </>
          )}
        </Card>

        {/* ── Chat Thread ── */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{selectedConv?.leadName || lead?.name || 'Select a conversation'}</h3>
              <p className="text-sm text-gray-600">{lead?.email || ''}</p>
            </div>
            <Button variant="outline" size="icon" disabled={!lead?.phone} onClick={() => lead?.phone && window.open(`tel:${lead.phone}`)}>
              <Phone className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {hasOlderMessages && !loadingThread && (
              <div className="text-center">
                <Button variant="ghost" size="sm" onClick={() => loadThread(selectedLeadId!, threadPage + 1, true)}>Load older messages</Button>
              </div>
            )}
            {loadingThread ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : threadError ? (
              <div className="flex flex-col items-center justify-center py-8 text-red-500 gap-2">
                <AlertCircle className="h-8 w-8" />
                <p className="text-sm">{threadError}</p>
                <Button variant="outline" size="sm" onClick={() => selectedLeadId && loadThread(selectedLeadId)}>Retry</Button>
              </div>
            ) : threadMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MessageSquare className="h-12 w-12 mx-auto mb-2" />
                <p>No messages yet. Start a conversation!</p>
              </div>
            ) : (
              threadMessages.map(msg => (
                <div key={msg._id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] p-3 rounded-lg ${msg.direction === 'outbound' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                    {msg.direction === 'inbound' && msg.senderName && <p className="text-xs font-semibold mb-1">{msg.senderName}</p>}
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <span className={`text-xs block mt-1 ${msg.direction === 'outbound' ? 'text-blue-100' : 'text-gray-500'}`}>{formatTime(msg.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message…"
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                disabled={!selectedLeadId || sending}
              />
              <Button onClick={handleSend} disabled={!messageText.trim() || !selectedLeadId || sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </Card>

        {/* ── Lead Quick View ── */}
        <Card className="p-4 overflow-y-auto">
          <h3 className="font-semibold mb-4">Lead Information</h3>
          {lead ? (
            <div className="space-y-4">
              <InfoRow label="Name" value={lead.name} />
              <InfoRow label="Company" value={lead.company} />
              <InfoRow label="Email" value={lead.email} />
              <InfoRow label="Phone" value={lead.phone} />
              <div>
                <span className="text-sm text-gray-600">Status</span>
                <div><Badge className="mt-1">{lead.status}</Badge></div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Deal Value</span>
                <div className="text-lg font-bold">₹{lead.value?.toLocaleString() || '0'}</div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate(`/leads/${lead.id || (lead as any)._id}`)}>
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
                <Button key={i} variant="outline" size="sm" className="w-full text-left justify-start text-sm" onClick={() => setMessageText(tmpl.text)}>
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

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-sm">{value || '—'}</div>
    </div>
  );
}
