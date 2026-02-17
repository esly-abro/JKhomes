import { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  MoreVertical,
  Volume2,
  VolumeX,
  Copy,
  Phone,
  MessageSquare,
  Globe,
  Cpu,
  Clock,
  X,
  AlertCircle,
  Check,
  RefreshCw,
  Star
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../components/ui/dropdown-menu';
import {
  listAgents,
  createAgent,
  getAgent,
  updateAgent,
  deleteAgent,
  setDefaultAgent,
  listVoices,
  type ElevenLabsAgent,
  type Voice,
  type ConversationConfig,
  type OrgUsage
} from '../../services/elevenLabsAgents';

// Available LLM models
const LLM_MODELS = [
  { value: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'grok-2', label: 'Grok 2' },
];

// Available languages
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ml', label: 'Malayalam' },
];

const DEFAULT_FORM: AgentFormData = {
  name: '',
  firstMessage: 'Hello! How can I help you today?',
  language: 'en',
  prompt: '',
  llm: 'gemini-2.0-flash-001',
  temperature: 0.7,
  maxTokens: -1,
  voiceId: '',
  ttsModel: 'eleven_turbo_v2',
  stability: 0.5,
  speed: 1,
  similarityBoost: 0.8,
  turnTimeout: 7,
  maxDuration: 600,
};

interface AgentFormData {
  name: string;
  firstMessage: string;
  language: string;
  prompt: string;
  llm: string;
  temperature: number;
  maxTokens: number;
  voiceId: string;
  ttsModel: string;
  stability: number;
  speed: number;
  similarityBoost: number;
  turnTimeout: number;
  maxDuration: number;
}

function buildConversationConfig(form: AgentFormData): ConversationConfig {
  return {
    agent: {
      first_message: form.firstMessage,
      language: form.language,
      prompt: {
        prompt: form.prompt,
        llm: form.llm,
        temperature: form.temperature,
        max_tokens: form.maxTokens,
      }
    },
    tts: {
      voice_id: form.voiceId,
      model_id: form.ttsModel,
      stability: form.stability,
      speed: form.speed,
      similarity_boost: form.similarityBoost,
    },
    turn: {
      turn_timeout: form.turnTimeout,
    },
    conversation: {
      max_duration_seconds: form.maxDuration,
    }
  };
}

function parseAgentToForm(agent: ElevenLabsAgent): AgentFormData {
  const cc = agent.conversation_config;
  return {
    name: agent.name || '',
    firstMessage: cc?.agent?.first_message || '',
    language: cc?.agent?.language || 'en',
    prompt: cc?.agent?.prompt?.prompt || '',
    llm: cc?.agent?.prompt?.llm || 'gemini-2.0-flash-001',
    temperature: cc?.agent?.prompt?.temperature ?? 0.7,
    maxTokens: cc?.agent?.prompt?.max_tokens ?? -1,
    voiceId: cc?.tts?.voice_id || '',
    ttsModel: cc?.tts?.model_id || 'eleven_turbo_v2',
    stability: cc?.tts?.stability ?? 0.5,
    speed: cc?.tts?.speed ?? 1,
    similarityBoost: cc?.tts?.similarity_boost ?? 0.8,
    turnTimeout: cc?.turn?.turn_timeout ?? 7,
    maxDuration: cc?.conversation?.max_duration_seconds ?? 600,
  };
}

export default function AIAgents() {
  const [agents, setAgents] = useState<ElevenLabsAgent[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [usage, setUsage] = useState<OrgUsage>({ thisMonth: { calls: 0, minutes: 0 }, agentCount: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<ElevenLabsAgent | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formData, setFormData] = useState<AgentFormData>({ ...DEFAULT_FORM });

  // Voice preview
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-dismiss success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [agentResult, voiceList] = await Promise.all([
        listAgents(),
        listVoices()
      ]);
      setAgents(agentResult.agents);
      setUsage(agentResult.usage);
      setVoices(voiceList);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setFormData({ ...DEFAULT_FORM });
    setEditingAgent(null);
    setShowCreateDialog(true);
  }

  async function openEditDialog(agentId: string) {
    try {
      setError(null);
      const agent = await getAgent(agentId);
      setEditingAgent(agent);
      setFormData(parseAgentToForm(agent));
      setShowCreateDialog(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load agent details');
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      setError('Agent name is required');
      return;
    }
    if (!formData.prompt.trim()) {
      setError('System prompt is required');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const config = buildConversationConfig(formData);

      if (editingAgent) {
        await updateAgent(editingAgent.agent_id, {
          name: formData.name,
          conversation_config: config
        });
        setSuccess('Agent updated successfully');
      } else {
        await createAgent(formData.name, config);
        setSuccess('Agent created successfully');
      }

      setShowCreateDialog(false);
      setEditingAgent(null);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save agent');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(agentId: string) {
    try {
      setError(null);
      await deleteAgent(agentId);
      setSuccess('Agent deleted successfully');
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete agent');
    }
  }

  async function handleSetDefault(agentId: string) {
    try {
      setError(null);
      await setDefaultAgent(agentId);
      setSuccess('Agent set as default for calls');
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to set default agent');
    }
  }

  function playVoicePreview(voice: Voice) {
    if (!voice.preview_url) return;

    if (playingVoice === voice.voice_id) {
      audioRef.current?.pause();
      setPlayingVoice(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlayingVoice(voice.voice_id);
    audio.play();
    audio.onended = () => setPlayingVoice(null);
  }

  function copyAgentId(agentId: string) {
    navigator.clipboard.writeText(agentId);
    setSuccess('Agent ID copied to clipboard');
  }

  function getVoiceName(voiceId: string) {
    return voices.find(v => v.voice_id === voiceId)?.name || voiceId || 'Default';
  }

  function getLangLabel(code: string) {
    return LANGUAGES.find(l => l.value === code)?.label || code;
  }

  function getLlmLabel(model: string) {
    return LLM_MODELS.find(m => m.value === model)?.label || model;
  }

  // ===== RENDER =====

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-500">Loading AI Agents...</span>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="h-7 w-7 text-blue-600" />
            AI Agents
          </h1>
          <p className="text-gray-500 mt-1">
            Create and manage ElevenLabs conversational AI agents
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Create Agent
          </Button>
        </div>
      </div>

      {/* Success Banner */}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="h-4 w-4" />
          {success}
        </div>
      )}

      {/* Error Banner */}
      {error && !showCreateDialog && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Usage Stats */}
      {agents.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Bot className="h-4 w-4" />
              Active Agents
            </div>
            <p className="text-2xl font-bold text-gray-900">{usage.agentCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Phone className="h-4 w-4" />
              Calls This Month
            </div>
            <p className="text-2xl font-bold text-gray-900">{usage.thisMonth.calls}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Clock className="h-4 w-4" />
              Minutes This Month
            </div>
            <p className="text-2xl font-bold text-gray-900">{usage.thisMonth.minutes.toFixed(1)}</p>
          </div>
        </div>
      )}

      {/* Empty State */}
      {agents.length === 0 && !error ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Bot className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No AI Agents yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Create your first AI agent to handle phone calls, answer questions, and engage with your leads automatically.
          </p>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Create Your First Agent
          </Button>
        </div>
      ) : (
        /* Agent Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => {
            const cc = agent.conversation_config;
            return (
              <div
                key={agent.agent_id}
                className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${
                  agent._isDefault ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'
                }`}
              >
                {/* Default Badge */}
                {agent._isDefault && (
                  <div className="mb-2 -mt-1">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                      <Star className="h-3 w-3 fill-blue-500" />
                      Default Agent (used for calls)
                    </span>
                  </div>
                )}
                {/* Card Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Bot className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 truncate max-w-[180px]">
                        {agent.name || 'Unnamed Agent'}
                      </h3>
                      <p className="text-xs text-gray-400 font-mono truncate max-w-[180px]">
                        {agent.agent_id}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(agent.agent_id)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      {!agent._isDefault && (
                        <DropdownMenuItem onClick={() => handleSetDefault(agent.agent_id)}>
                          <Star className="h-4 w-4 mr-2" /> Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => copyAgentId(agent.agent_id)}>
                        <Copy className="h-4 w-4 mr-2" /> Copy ID
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteConfirm(agent.agent_id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* First Message Preview */}
                {cc?.agent?.first_message && (
                  <div className="mb-3 p-2.5 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-1 mb-1">
                      <MessageSquare className="h-3 w-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Greeting</span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">{cc.agent.first_message}</p>
                  </div>
                )}

                {/* Agent Details Tags */}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {cc?.agent?.language && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">
                      <Globe className="h-3 w-3" />
                      {getLangLabel(cc.agent.language)}
                    </span>
                  )}
                  {cc?.agent?.prompt?.llm && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">
                      <Cpu className="h-3 w-3" />
                      {getLlmLabel(cc.agent.prompt.llm)}
                    </span>
                  )}
                  {cc?.tts?.voice_id && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">
                      <Volume2 className="h-3 w-3" />
                      {getVoiceName(cc.tts.voice_id)}
                    </span>
                  )}
                  {cc?.conversation?.max_duration_seconds && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">
                      <Clock className="h-3 w-3" />
                      {Math.floor(cc.conversation.max_duration_seconds / 60)}m
                    </span>
                  )}
                </div>

                {/* System Prompt Preview */}
                {cc?.agent?.prompt?.prompt && (
                  <p className="text-xs text-gray-400 mt-3 line-clamp-2 italic">
                    "{cc.agent.prompt.prompt}"
                  </p>
                )}

                {/* Per-Agent Usage Stats */}
                {agent._usage && (agent._usage.totalCalls > 0 || agent._usage.totalMinutes > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {agent._usage.totalCalls} calls
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {agent._usage.totalMinutes.toFixed(1)} min
                    </span>
                  </div>
                )}

                {/* Deleted badge */}
                {agent._deleted && (
                  <div className="mt-2 px-2 py-1 bg-red-50 text-red-600 text-xs rounded-md inline-flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Deleted from ElevenLabs
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== CREATE / EDIT DIALOG ===== */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingAgent(null);
          setError(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAgent ? 'Edit Agent' : 'Create AI Agent'}</DialogTitle>
            <DialogDescription>
              {editingAgent
                ? 'Modify your ElevenLabs conversational AI agent settings.'
                : 'Set up a new ElevenLabs conversational AI agent for handling calls.'}
            </DialogDescription>
          </DialogHeader>

          {error && showCreateDialog && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-5 py-2">
            {/* Agent Name */}
            <div>
              <Label>Agent Name *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Sales Assistant, Support Bot"
                className="mt-1"
              />
            </div>

            {/* First Message */}
            <div>
              <Label>First Message</Label>
              <p className="text-xs text-gray-500 mb-1">The opening message the agent says when a call starts</p>
              <Textarea
                value={formData.firstMessage}
                onChange={e => setFormData({ ...formData, firstMessage: e.target.value })}
                placeholder="Hello! How can I help you today?"
                rows={2}
                className="mt-1"
              />
            </div>

            {/* System Prompt */}
            <div>
              <Label>System Prompt *</Label>
              <p className="text-xs text-gray-500 mb-1">Instructions for how the agent should behave and respond</p>
              <Textarea
                value={formData.prompt}
                onChange={e => setFormData({ ...formData, prompt: e.target.value })}
                placeholder="You are a helpful sales assistant for a construction company. Your job is to answer questions about available properties, pricing, and schedule site visits..."
                rows={5}
                className="mt-1"
              />
            </div>

            {/* Language & LLM Model - Side by Side */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Language</Label>
                <Select value={formData.language} onValueChange={v => setFormData({ ...formData, language: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(lang => (
                      <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>LLM Model</Label>
                <Select value={formData.llm} onValueChange={v => setFormData({ ...formData, llm: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_MODELS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Voice Selection */}
            <div>
              <Label>Voice</Label>
              <p className="text-xs text-gray-500 mb-1">Choose the voice for your AI agent</p>
              <Select value={formData.voiceId} onValueChange={v => setFormData({ ...formData, voiceId: v })}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a voice" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {voices.map(voice => (
                    <SelectItem key={voice.voice_id} value={voice.voice_id}>
                      <div className="flex items-center gap-2">
                        <span>{voice.name}</span>
                        {voice.category && (
                          <span className="text-xs text-gray-400">({voice.category})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Voice Preview */}
              {formData.voiceId && (
                <div className="mt-2">
                  {(() => {
                    const selected = voices.find(v => v.voice_id === formData.voiceId);
                    if (!selected?.preview_url) return null;
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => playVoicePreview(selected)}
                        className="text-xs"
                      >
                        {playingVoice === selected.voice_id ? (
                          <><VolumeX className="h-3 w-3 mr-1" /> Stop Preview</>
                        ) : (
                          <><Volume2 className="h-3 w-3 mr-1" /> Preview Voice</>
                        )}
                      </Button>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Advanced Settings */}
            <details className="border border-gray-200 rounded-lg">
              <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
                Advanced Settings
              </summary>
              <div className="px-4 pb-4 space-y-4 pt-2 border-t border-gray-100">
                {/* Temperature */}
                <div>
                  <Label>Temperature ({formData.temperature})</Label>
                  <p className="text-xs text-gray-500 mb-1">Lower = more focused, Higher = more creative</p>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.temperature}
                    onChange={e => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Focused (0)</span>
                    <span>Creative (1)</span>
                  </div>
                </div>

                {/* Voice Settings */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Stability ({formData.stability})</Label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={formData.stability}
                      onChange={e => setFormData({ ...formData, stability: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Speed ({formData.speed})</Label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={formData.speed}
                      onChange={e => setFormData({ ...formData, speed: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Similarity ({formData.similarityBoost})</Label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={formData.similarityBoost}
                      onChange={e => setFormData({ ...formData, similarityBoost: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>

                {/* Turn Timeout & Max Duration */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Turn Timeout (seconds)</Label>
                    <Input
                      type="number"
                      value={formData.turnTimeout}
                      onChange={e => setFormData({ ...formData, turnTimeout: parseInt(e.target.value) || 7 })}
                      min={1}
                      max={30}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max Call Duration (seconds)</Label>
                    <Input
                      type="number"
                      value={formData.maxDuration}
                      onChange={e => setFormData({ ...formData, maxDuration: parseInt(e.target.value) || 600 })}
                      min={60}
                      max={3600}
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* TTS Model */}
                <div>
                  <Label className="text-xs">TTS Model</Label>
                  <Select value={formData.ttsModel} onValueChange={v => setFormData({ ...formData, ttsModel: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eleven_turbo_v2">Turbo v2 (Fast)</SelectItem>
                      <SelectItem value="eleven_turbo_v2_5">Turbo v2.5 (Balanced)</SelectItem>
                      <SelectItem value="eleven_multilingual_v2">Multilingual v2 (Quality)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingAgent(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingAgent ? 'Save Changes' : 'Create Agent'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== DELETE CONFIRM DIALOG ===== */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this agent? This action cannot be undone and will permanently remove the agent from ElevenLabs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
