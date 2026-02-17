/**
 * ElevenLabs Agent Management Service
 * Frontend API calls for managing ElevenLabs Conversational AI agents
 * 
 * Architecture: ONE shared ElevenLabs account. Agents are org-scoped via DB.
 * Usage is tracked per org for billing.
 */

import api from './api';

// Types
export interface AgentPrompt {
    prompt: string;
    llm: string;
    temperature: number;
    max_tokens: number;
}

export interface AgentTTS {
    voice_id: string;
    model_id?: string;
    stability?: number;
    speed?: number;
    similarity_boost?: number;
}

export interface AgentTurn {
    turn_timeout?: number;
    turn_eagerness?: string;
}

export interface AgentConversation {
    max_duration_seconds?: number;
}

export interface ConversationConfig {
    agent: {
        first_message: string;
        language: string;
        prompt: AgentPrompt;
    };
    tts?: AgentTTS;
    turn?: AgentTurn;
    conversation?: AgentConversation;
}

export interface AgentUsage {
    totalCalls: number;
    totalMinutes: number;
    lastCallAt?: string;
}

export interface ElevenLabsAgent {
    agent_id: string;
    name?: string;
    conversation_config?: ConversationConfig;
    metadata?: Record<string, any>;
    created_at?: string;
    _isDefault?: boolean;
    _usage?: AgentUsage;
    _deleted?: boolean;
}

export interface Voice {
    voice_id: string;
    name: string;
    category?: string;
    labels?: Record<string, string>;
    preview_url?: string;
    description?: string;
}

export interface OrgUsage {
    thisMonth: { calls: number; minutes: number };
    agentCount: number;
}

export interface UsageDetail {
    currentMonth: { month: string; calls: number; minutes: number };
    allTime: { calls: number; minutes: number };
    agentCount: number;
    agents: Array<{
        agentId: string;
        name: string;
        totalCalls: number;
        totalMinutes: number;
        monthCalls?: number;
        monthMinutes?: number;
    }>;
}

// API calls

const BASE_PATH = '/api/integrations/elevenlabs';

/**
 * List all ElevenLabs AI agents for current org
 */
export async function listAgents(): Promise<{ agents: ElevenLabsAgent[]; usage: OrgUsage }> {
    const res = await api.get(`${BASE_PATH}/agents`);
    return {
        agents: res.data.data || [],
        usage: res.data.usage || { thisMonth: { calls: 0, minutes: 0 }, agentCount: 0 }
    };
}

/**
 * Create a new ElevenLabs AI agent
 */
export async function createAgent(name: string, conversationConfig: ConversationConfig): Promise<{ agent_id: string }> {
    const res = await api.post(`${BASE_PATH}/agents`, {
        name,
        conversation_config: conversationConfig
    });
    return res.data.data;
}

/**
 * Get agent details by ID
 */
export async function getAgent(agentId: string): Promise<ElevenLabsAgent> {
    const res = await api.get(`${BASE_PATH}/agents/${agentId}`);
    return res.data.data;
}

/**
 * Update an existing agent
 */
export async function updateAgent(agentId: string, updates: {
    name?: string;
    conversation_config?: Partial<ConversationConfig>;
}): Promise<ElevenLabsAgent> {
    const res = await api.patch(`${BASE_PATH}/agents/${agentId}`, updates);
    return res.data.data;
}

/**
 * Delete an agent
 */
export async function deleteAgent(agentId: string): Promise<void> {
    await api.delete(`${BASE_PATH}/agents/${agentId}`);
}

/**
 * Set an agent as the default for outbound calls
 */
export async function setDefaultAgent(agentId: string): Promise<void> {
    await api.post(`${BASE_PATH}/agents/${agentId}/set-default`);
}

/**
 * List available voices
 */
export async function listVoices(): Promise<Voice[]> {
    const res = await api.get(`${BASE_PATH}/voices`);
    return res.data.data || [];
}

/**
 * Get usage details for billing
 */
export async function getUsage(month?: string): Promise<UsageDetail> {
    const params = month ? `?month=${month}` : '';
    const res = await api.get(`${BASE_PATH}/usage${params}`);
    return res.data.data;
}
