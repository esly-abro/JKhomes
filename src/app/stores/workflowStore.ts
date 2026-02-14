/**
 * Zustand store for the Workflow Builder.
 *
 * Single source of truth for:
 *   - ReactFlow canvas state (nodes, edges)
 *   - Current workflow metadata (name, id, active state)
 *   - Undo/Redo history
 *   - Saved workflows list
 *   - UI state (selected node, config modal, validation errors)
 *   - Clipboard for copy/paste
 *
 * All mutations go through this store. The Automation page
 * and its child components subscribe to slices they need.
 */

import { create } from 'zustand';
import {
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import automationService, { type Automation } from '../../services/automations';
import { validateWorkflow } from '../lib/workflowValidation';
import type {
  SerializedNode,
  SerializedEdge,
  SavedAutomation,
  ValidationResult,
  WorkflowNodeData,
  WorkflowNodeType,
  ReactFlowNodeCategory,
} from '../lib/workflowTypes';
import { getNodeCategory } from '../lib/workflowTypes';

// ─── Constants ──────────────────────────────────────────────────

const MAX_HISTORY = 50;

const DEFAULT_EDGE_STYLE = {
  type: 'smoothstep' as const,
  animated: true,
  style: { strokeWidth: 2, stroke: '#6366f1' },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#6366f1',
  },
};

// ─── Default Configs ────────────────────────────────────────────

function getDefaultConfig(type: WorkflowNodeType): Record<string, unknown> {
  switch (type) {
    case 'whatsapp':
      return { message: '', template: '' };
    case 'aiCall':
      return { script: '', maxDuration: 300 };
    case 'humanCall':
      return { assignTo: 'auto', priority: 'high', autoConfigured: true };
    case 'email':
      return { subject: '', body: '' };
    case 'condition':
      return { field: 'status', operator: 'equals', value: '' };
    case 'delay':
      return { duration: 5, unit: 'minutes' };
    case 'conditionTimeout':
      return { field: 'status', operator: 'equals', value: '', timeout: { duration: 24, unit: 'hours' } };
    default:
      return {};
  }
}

// ─── Color Map ──────────────────────────────────────────────────

const NODE_COLORS: Record<string, string> = {
  newLead: 'bg-green-500',
  leadUpdated: 'bg-blue-500',
  siteVisitScheduled: 'bg-purple-500',
  whatsapp: 'bg-green-600',
  aiCall: 'bg-blue-600',
  humanCall: 'bg-orange-600',
  email: 'bg-red-600',
  condition: 'bg-yellow-500',
  delay: 'bg-gray-500',
  conditionTimeout: 'bg-indigo-500',
};

// ─── Store Interface ────────────────────────────────────────────

interface HistoryEntry {
  nodes: Node[];
  edges: Edge[];
}

interface WorkflowStore {
  // ── Canvas State ────────────────────────────
  nodes: Node[];
  edges: Edge[];

  // ── Workflow Metadata ───────────────────────
  workflowId: string | null;
  workflowName: string;
  isDirty: boolean;

  // ── Saved Workflows ─────────────────────────
  workflows: SavedAutomation[];
  isLoadingWorkflows: boolean;

  // ── UI State ────────────────────────────────
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  configNodeId: string | null; // node open in config modal
  isSaving: boolean;
  error: string | null;
  validationResult: ValidationResult | null;

  // ── Undo/Redo ───────────────────────────────
  history: HistoryEntry[];
  historyIndex: number;
  _isUndoRedo: boolean;

  // ── Clipboard ───────────────────────────────
  clipboard: { nodes: Node[]; edges: Edge[] } | null;

  // ── Actions: Canvas ─────────────────────────
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (type: WorkflowNodeType, label: string, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  deleteSelected: () => void;

  // ── Actions: Selection ──────────────────────
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  clearSelection: () => void;
  selectAll: () => void;
  openConfigModal: (nodeId: string) => void;
  closeConfigModal: () => void;

  // ── Actions: Undo/Redo ──────────────────────
  undo: () => void;
  redo: () => void;
  _pushHistory: () => void;

  // ── Actions: Clipboard ──────────────────────
  copySelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;

  // ── Actions: Workflow CRUD ──────────────────
  newWorkflow: () => void;
  loadWorkflow: (automation: SavedAutomation) => void;
  saveWorkflow: () => Promise<boolean>;
  deleteWorkflow: (id: string) => Promise<void>;
  toggleWorkflow: (id: string) => Promise<void>;
  fetchWorkflows: () => Promise<void>;

  // ── Actions: Validation ─────────────────────
  validate: () => ValidationResult;
  clearError: () => void;

  // ── Actions: Condition Node Helper ──────────
  addConditionNodeFromWhatsApp: (sourceNodeId: string, buttons: Array<{ text: string; payload?: string }>) => void;
}

// ─── Store ──────────────────────────────────────────────────────

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  // ── Initial State ───────────────────────────
  nodes: [],
  edges: [],
  workflowId: null,
  workflowName: 'New Automation',
  isDirty: false,
  workflows: [],
  isLoadingWorkflows: true,
  selectedNodeId: null,
  selectedEdgeId: null,
  configNodeId: null,
  isSaving: false,
  error: null,
  validationResult: null,
  history: [{ nodes: [], edges: [] }],
  historyIndex: 0,
  _isUndoRedo: false,
  clipboard: null,

  // ── Canvas Handlers ─────────────────────────

  onNodesChange: (changes) => {
    set((state) => {
      const newNodes = applyNodeChanges(changes, state.nodes);
      const hasSignificant = changes.some((c) => c.type !== 'select');
      return { nodes: newNodes, isDirty: hasSignificant ? true : state.isDirty };
    });
    // Push history for significant changes (debounced externally via commit)
    const hasSignificant = changes.some((c) => c.type !== 'select');
    if (hasSignificant && !get()._isUndoRedo) {
      get()._pushHistory();
    }
  },

  onEdgesChange: (changes) => {
    set((state) => {
      const newEdges = applyEdgeChanges(changes, state.edges);
      const hasSignificant = changes.some((c) => c.type !== 'select');
      return { edges: newEdges, isDirty: hasSignificant ? true : state.isDirty };
    });
    const hasSignificant = changes.some((c) => c.type !== 'select');
    if (hasSignificant && !get()._isUndoRedo) {
      get()._pushHistory();
    }
  },

  onConnect: (connection) => {
    set((state) => ({
      edges: addEdge(
        {
          ...connection,
          ...DEFAULT_EDGE_STYLE,
        },
        state.edges
      ),
      isDirty: true,
    }));
    get()._pushHistory();
  },

  addNode: (type, label, position) => {
    const category = getNodeCategory(type);
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: category,
      position,
      data: {
        label,
        type,
        color: NODE_COLORS[type] || 'bg-gray-500',
        config: getDefaultConfig(type),
      },
    };
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
    }));
    get()._pushHistory();
  },

  updateNodeData: (nodeId, data) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)),
      isDirty: true,
    }));
    get()._pushHistory();
  },

  deleteSelected: () => {
    const { nodes, edges, selectedNodeId, selectedEdgeId } = get();
    const selectedNodes = nodes.filter((n) => n.selected || n.id === selectedNodeId);
    const selectedEdges = edges.filter((e) => e.selected || e.id === selectedEdgeId);

    if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

    const nodeIdsToDelete = new Set(selectedNodes.map((n) => n.id));
    const edgeIdsToDelete = new Set(selectedEdges.map((e) => e.id));

    set({
      nodes: nodes.filter((n) => !nodeIdsToDelete.has(n.id)),
      edges: edges.filter(
        (e) => !edgeIdsToDelete.has(e.id) && !nodeIdsToDelete.has(e.source) && !nodeIdsToDelete.has(e.target)
      ),
      selectedNodeId: null,
      selectedEdgeId: null,
      isDirty: true,
    });
    get()._pushHistory();
  },

  // ── Selection ───────────────────────────────

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedEdgeId: null }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedNodeId: null }),
  clearSelection: () => {
    set((state) => ({
      selectedNodeId: null,
      selectedEdgeId: null,
      nodes: state.nodes.map((n) => ({ ...n, selected: false })),
      edges: state.edges.map((e) => ({ ...e, selected: false })),
    }));
  },
  selectAll: () => {
    set((state) => ({
      nodes: state.nodes.map((n) => ({ ...n, selected: true })),
      edges: state.edges.map((e) => ({ ...e, selected: true })),
    }));
  },
  openConfigModal: (nodeId) => set({ configNodeId: nodeId }),
  closeConfigModal: () => set({ configNodeId: null }),

  // ── Undo / Redo ─────────────────────────────

  _pushHistory: () => {
    const { nodes, edges, history, historyIndex, _isUndoRedo } = get();
    if (_isUndoRedo) {
      set({ _isUndoRedo: false });
      return;
    }
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    if (newHistory.length > MAX_HISTORY) newHistory.shift();
    set({
      history: newHistory,
      historyIndex: Math.min(newHistory.length - 1, MAX_HISTORY - 1),
    });
  },

  undo: () => {
    const { historyIndex, history } = get();
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    set({
      _isUndoRedo: true,
      historyIndex: newIndex,
      nodes: structuredClone(history[newIndex].nodes),
      edges: structuredClone(history[newIndex].edges),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  redo: () => {
    const { historyIndex, history } = get();
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    set({
      _isUndoRedo: true,
      historyIndex: newIndex,
      nodes: structuredClone(history[newIndex].nodes),
      edges: structuredClone(history[newIndex].edges),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  // ── Clipboard ───────────────────────────────

  copySelected: () => {
    const { nodes, edges, selectedNodeId } = get();
    const selected = nodes.filter((n) => n.selected || n.id === selectedNodeId);
    if (selected.length === 0) return;
    const selectedIds = new Set(selected.map((n) => n.id));
    const selectedEdges = edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target));
    set({ clipboard: { nodes: structuredClone(selected), edges: structuredClone(selectedEdges) } });
  },

  paste: () => {
    const { clipboard, nodes, edges } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;

    const ts = Date.now();
    const idMap: Record<string, string> = {};

    const newNodes = clipboard.nodes.map((node, i) => {
      const newId = `${(node.data as WorkflowNodeData).type}-${ts}-${i}`;
      idMap[node.id] = newId;
      return { ...node, id: newId, position: { x: node.position.x + 50, y: node.position.y + 50 }, selected: true };
    });

    const newEdges = clipboard.edges.map((edge, i) => ({
      ...edge,
      id: `e-${ts}-${i}`,
      source: idMap[edge.source] || edge.source,
      target: idMap[edge.target] || edge.target,
      selected: false,
    }));

    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...edges, ...newEdges],
      isDirty: true,
    });
    get()._pushHistory();
  },

  duplicateSelected: () => {
    const { nodes, edges, selectedNodeId } = get();
    const selected = nodes.filter((n) => n.selected || n.id === selectedNodeId);
    if (selected.length === 0) return;

    const selectedIds = new Set(selected.map((n) => n.id));
    const selectedEdges = edges.filter((e) => selectedIds.has(e.source) && selectedIds.has(e.target));

    const ts = Date.now();
    const idMap: Record<string, string> = {};

    const newNodes = selected.map((node, i) => {
      const newId = `${(node.data as WorkflowNodeData).type}-${ts}-${i}`;
      idMap[node.id] = newId;
      return { ...node, id: newId, position: { x: node.position.x + 50, y: node.position.y + 50 }, selected: true };
    });

    const newEdges = selectedEdges.map((edge, i) => ({
      ...edge,
      id: `e-dup-${ts}-${i}`,
      source: idMap[edge.source] || edge.source,
      target: idMap[edge.target] || edge.target,
    }));

    set({
      nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
      edges: [...edges, ...newEdges],
      isDirty: true,
    });
    get()._pushHistory();
  },

  // ── Workflow CRUD ───────────────────────────

  newWorkflow: () => {
    set({
      nodes: [],
      edges: [],
      workflowId: null,
      workflowName: 'New Automation',
      isDirty: false,
      selectedNodeId: null,
      selectedEdgeId: null,
      configNodeId: null,
      validationResult: null,
      error: null,
      history: [{ nodes: [], edges: [] }],
      historyIndex: 0,
    });
  },

  loadWorkflow: (automation) => {
    const rfNodes = (automation.nodes || []).map((n) => ({
      ...n,
      data: n.data as Record<string, unknown>,
    })) as Node[];

    const rfEdges = (automation.edges || []).map((e) => ({
      ...e,
      ...DEFAULT_EDGE_STYLE,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })) as Edge[];

    set({
      nodes: rfNodes,
      edges: rfEdges,
      workflowId: automation._id || automation.id,
      workflowName: automation.name,
      isDirty: false,
      selectedNodeId: null,
      selectedEdgeId: null,
      configNodeId: null,
      validationResult: null,
      error: null,
      history: [{ nodes: structuredClone(rfNodes), edges: structuredClone(rfEdges) }],
      historyIndex: 0,
    });
  },

  saveWorkflow: async () => {
    const { nodes, edges, workflowId, workflowName, validate: validateFn } = get();

    // Validate first
    const result = validateFn();
    if (!result.valid) {
      set({ validationResult: result, error: `Validation failed: ${result.errors.length} error(s)` });
      return false;
    }

    set({ isSaving: true, error: null, validationResult: result });

    try {
      // Extract triggerType from the trigger node
      const triggerNode = nodes.find((n) => n.type === 'trigger');
      const triggerType = triggerNode
        ? ((triggerNode.data as WorkflowNodeData).type as string)
        : 'newLead';

      const automationData = {
        name: workflowName,
        description: 'Workflow automation',
        triggerType,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type || 'action',
          position: n.position,
          data: n.data as SerializedNode['data'],
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: e.type,
          animated: e.animated,
        })),
      };

      let saved: Automation;
      if (workflowId) {
        saved = await automationService.updateAutomation(
          workflowId,
          automationData as Parameters<typeof automationService.updateAutomation>[1]
        );
      } else {
        saved = await automationService.createAutomation(
          automationData as Parameters<typeof automationService.createAutomation>[0]
        );
      }

      // Update workflows list
      const mapped = mapAutomation(saved);
      set((state) => ({
        workflowId: saved._id,
        isDirty: false,
        isSaving: false,
        workflows: workflowId
          ? state.workflows.map((w) => (w.id === workflowId ? mapped : w))
          : [...state.workflows, mapped],
      }));

      return true;
    } catch (err) {
      console.error('Failed to save workflow:', err);
      set({ isSaving: false, error: 'Failed to save workflow' });
      return false;
    }
  },

  deleteWorkflow: async (id) => {
    try {
      await automationService.deleteAutomation(id);
      const { workflowId } = get();
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
      }));
      if (workflowId === id) {
        get().newWorkflow();
      }
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      set({ error: 'Failed to delete workflow' });
    }
  },

  toggleWorkflow: async (id) => {
    try {
      const updated = await automationService.toggleAutomation(id);
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === id ? { ...w, isActive: updated.isActive } : w
        ),
      }));
    } catch (err) {
      console.error('Failed to toggle workflow:', err);
      set({ error: 'Failed to toggle automation' });
    }
  },

  fetchWorkflows: async () => {
    set({ isLoadingWorkflows: true, error: null });
    try {
      const data = await automationService.getAutomations();
      set({
        workflows: data.map(mapAutomation),
        isLoadingWorkflows: false,
      });
    } catch (err) {
      console.error('Failed to load workflows:', err);
      set({ isLoadingWorkflows: false, error: 'Failed to load automation workflows' });
    }
  },

  // ── Validation ──────────────────────────────

  validate: () => {
    const { nodes, edges } = get();
    const serialized = nodes.map((n) => ({
      id: n.id,
      type: n.type || 'action',
      position: n.position,
      data: n.data,
    })) as SerializedNode[];

    const serializedEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    })) as SerializedEdge[];

    const result = validateWorkflow(serialized, serializedEdges);
    set({ validationResult: result });
    return result;
  },

  clearError: () => set({ error: null, validationResult: null }),

  // ── Condition Node Helper ───────────────────

  addConditionNodeFromWhatsApp: (sourceNodeId, buttons) => {
    const { nodes, edges } = get();
    const sourceNode = nodes.find((n) => n.id === sourceNodeId);
    if (!sourceNode) return;

    // Check if condition already connected
    const existingConditionEdge = edges.find(
      (e) => e.source === sourceNodeId && nodes.find((n) => n.id === e.target && n.type === 'condition')
    );

    if (existingConditionEdge) {
      // Update existing condition node
      const condNode = nodes.find((n) => n.id === existingConditionEdge.target);
      if (condNode) {
        get().updateNodeData(condNode.id, {
          ...condNode.data,
          label: 'Template Response',
          type: 'templateResponse',
          config: { type: 'templateResponse', options: buttons.map((b) => b.text) },
        } as Record<string, unknown>);
      }
      return;
    }

    const condId = `templateCondition-${Date.now()}`;
    const newNode: Node = {
      id: condId,
      type: 'condition',
      position: { x: sourceNode.position.x, y: sourceNode.position.y + 150 },
      data: {
        label: 'Template Response',
        type: 'templateResponse',
        color: 'bg-yellow-500',
        config: { type: 'templateResponse', options: buttons.map((b) => b.text) },
      },
    };

    const newEdge: Edge = {
      id: `edge-${sourceNodeId}-${condId}`,
      source: sourceNodeId,
      target: condId,
      ...DEFAULT_EDGE_STYLE,
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
      edges: [...state.edges, newEdge],
      isDirty: true,
    }));
    get()._pushHistory();
  },
}));

// ─── Helpers ────────────────────────────────────────────────────

function mapAutomation(a: Automation): SavedAutomation {
  return {
    id: a._id,
    _id: a._id,
    name: a.name,
    description: a.description || '',
    nodes: a.nodes as unknown as SerializedNode[],
    edges: a.edges as unknown as SerializedEdge[],
    isActive: a.isActive,
    triggerType: a.triggerType,
    runsCount: a.runsCount || 0,
    successCount: a.successCount || 0,
    failureCount: a.failureCount || 0,
    lastRunAt: a.lastRunAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
