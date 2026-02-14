/**
 * Workflow type definitions.
 * These types must stay aligned with the backend Automation model
 * and the existing workflow engine executors.
 */

// ─── Trigger Types ──────────────────────────────────────────────
export const TRIGGER_TYPES = {
  newLead: { key: 'newLead', label: 'New Lead Added', description: 'Fires when a new lead is created' },
  leadUpdated: { key: 'leadUpdated', label: 'Lead Updated', description: 'Fires when a lead is modified' },
  siteVisitScheduled: { key: 'siteVisitScheduled', label: 'Appointment Scheduled', description: 'Fires when an appointment is booked' },
} as const;

export type TriggerType = keyof typeof TRIGGER_TYPES;

// ─── Action Types ───────────────────────────────────────────────
export const ACTION_TYPES = {
  whatsapp: { key: 'whatsapp', label: 'WhatsApp Message', description: 'Send WhatsApp message via template or custom text' },
  aiCall: { key: 'aiCall', label: 'AI Phone Call', description: 'Automated AI call via ElevenLabs' },
  humanCall: { key: 'humanCall', label: 'Human Phone Call', description: 'Notify sales exec to call the lead' },
  email: { key: 'email', label: 'Send Email', description: 'Send email to the lead' },
} as const;

export type ActionType = keyof typeof ACTION_TYPES;

// ─── Logic Types ────────────────────────────────────────────────
export const LOGIC_TYPES = {
  delay: { key: 'delay', label: 'Wait / Delay', description: 'Wait before executing the next step' },
  condition: { key: 'condition', label: 'If Condition', description: 'Branch based on lead field values' },
  conditionTimeout: { key: 'conditionTimeout', label: 'Condition + Timeout', description: 'Condition with a timeout fallback' },
} as const;

export type LogicType = keyof typeof LOGIC_TYPES;

// ─── Node Data Types (all mapped to the backend) ───────────────
export type WorkflowNodeType = TriggerType | ActionType | LogicType;

// ReactFlow node category (determines which component renders)
export type ReactFlowNodeCategory = 'trigger' | 'action' | 'condition' | 'delay';

// Map from workflow node type → ReactFlow node category
export function getNodeCategory(type: WorkflowNodeType): ReactFlowNodeCategory {
  if (type in TRIGGER_TYPES) return 'trigger';
  if (type in ACTION_TYPES) return 'action';
  if (type === 'delay') return 'delay';
  return 'condition'; // condition, conditionTimeout
}

// ─── Node Config Shapes ─────────────────────────────────────────
export interface WhatsAppConfig {
  template?: string;
  templateId?: string;
  message?: string;
  buttons?: Array<{ text: string; payload?: string }>;
}

export interface AICallConfig {
  agentId?: string;
  script?: string;
  maxDuration?: number;
}

export interface HumanCallConfig {
  assignTo: 'auto' | string;
  priority: 'high' | 'medium' | 'low';
  autoConfigured: boolean;
}

export interface EmailConfig {
  subject: string;
  body: string;
  templateId?: string;
}

export interface DelayConfig {
  duration: number;
  unit: 'seconds' | 'minutes' | 'hours' | 'days';
}

export interface ConditionConfig {
  field: string;
  operator: string;
  value: string;
}

export interface ConditionTimeoutConfig extends ConditionConfig {
  timeout: {
    duration: number;
    unit: 'minutes' | 'hours' | 'days';
  };
}

export type NodeConfig =
  | WhatsAppConfig
  | AICallConfig
  | HumanCallConfig
  | EmailConfig
  | DelayConfig
  | ConditionConfig
  | ConditionTimeoutConfig
  | Record<string, unknown>;

// ─── Node & Edge Data (what sits inside ReactFlow nodes) ────────
export interface WorkflowNodeData {
  label: string;
  type: WorkflowNodeType;
  color: string;
  config: NodeConfig;
  [key: string]: unknown;
}

// ─── Serialized shapes (saved to / loaded from MongoDB) ─────────
export interface SerializedNode {
  id: string;
  type: ReactFlowNodeCategory;
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface SerializedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
}

export interface WorkflowData {
  name: string;
  description?: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
}

// ─── Saved Automation (from API) ────────────────────────────────
export interface SavedAutomation {
  id: string;
  _id: string;
  name: string;
  description: string;
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  isActive: boolean;
  triggerType?: string;
  runsCount: number;
  successCount: number;
  failureCount: number;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Validation ─────────────────────────────────────────────────
export interface ValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// ─── Palette Item ───────────────────────────────────────────────
export interface PaletteItem {
  type: WorkflowNodeType;
  label: string;
  nodeCategory: ReactFlowNodeCategory;
  color: string;
  icon: string; // lucide icon name
}
