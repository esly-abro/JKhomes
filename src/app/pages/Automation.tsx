/**
 * Automation Page — Visual Workflow Builder
 *
 * All state lives in useWorkflowStore (zustand).
 * This component is purely presentational + event wiring.
 *
 * Architecture:
 *   Left panel  — Draggable node palette
 *   Center      — ReactFlow canvas + toolbar
 *   Right panel — Saved workflows list
 *   Overlay     — NodeConfigModal (react-hook-form + zod)
 */

import React, { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Zap,
  MessageSquare,
  Phone,
  Mail,
  Clock,
  GitBranch,
  Save,
  Trash2,
  Plus,
  User,
  PhoneCall,
  Bot,
  Timer,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Undo2,
  Redo2,
  Loader2,
  Power,
  ToggleLeft,
  ToggleRight,
  Play,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import { TriggerNode, ActionNode, ConditionNode, DelayNode } from '../components/automation';
import NodeConfigModal from '../components/automation/NodeConfigModal';
import { useWorkflowStore } from '../stores/workflowStore';
import type { WorkflowNodeType, ReactFlowNodeCategory, WorkflowNodeData } from '../lib/workflowTypes';

// ─── Node Types for ReactFlow ───────────────────────────────────

const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
};

// ─── Palette Definition ─────────────────────────────────────────

interface PaletteEntry {
  type: WorkflowNodeType;
  label: string;
  category: ReactFlowNodeCategory;
  color: string;
  icon: React.ElementType;
}

const TRIGGERS: PaletteEntry[] = [
  { type: 'newLead', label: 'New Lead Added', category: 'trigger', color: 'bg-green-500', icon: User },
  { type: 'leadUpdated', label: 'Lead Updated', category: 'trigger', color: 'bg-blue-500', icon: User },
  { type: 'siteVisitScheduled', label: 'Appointment Scheduled', category: 'trigger', color: 'bg-purple-500', icon: Phone },
];

const ACTIONS: PaletteEntry[] = [
  { type: 'whatsapp', label: 'WhatsApp Message', category: 'action', color: 'bg-green-600', icon: MessageSquare },
  { type: 'aiCall', label: 'AI Phone Call', category: 'action', color: 'bg-blue-600', icon: Bot },
  { type: 'humanCall', label: 'Human Phone Call', category: 'action', color: 'bg-orange-600', icon: PhoneCall },
  { type: 'email', label: 'Send Email', category: 'action', color: 'bg-red-600', icon: Mail },
];

const LOGIC: PaletteEntry[] = [
  { type: 'delay', label: 'Wait / Delay', category: 'delay', color: 'bg-gray-500', icon: Clock },
  { type: 'condition', label: 'If Condition', category: 'condition', color: 'bg-yellow-500', icon: GitBranch },
  { type: 'conditionTimeout', label: 'Condition + Timeout', category: 'condition', color: 'bg-indigo-500', icon: Timer },
];

// ─── Draggable Palette Item ─────────────────────────────────────

function DraggableItem({ entry }: { entry: PaletteEntry }) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/workflow-node', JSON.stringify({
      type: entry.type,
      label: entry.label,
      category: entry.category,
      color: entry.color,
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const Icon = entry.icon;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-grab active:cursor-grabbing transition-all text-sm"
    >
      <div className={`w-6 h-6 rounded ${entry.color} flex items-center justify-center`}>
        <Icon className="h-3 w-3 text-white" />
      </div>
      <span className="text-gray-700 text-xs font-medium">{entry.label}</span>
    </div>
  );
}

// ─── Left Panel — Node Palette ──────────────────────────────────

function NodePalette() {
  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Zap className="h-4 w-4 text-indigo-500" />
          Workflow Nodes
        </h2>
        <p className="text-xs text-gray-500 mt-1">Drag nodes onto the canvas</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Triggers */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Play className="h-3 w-3" /> Triggers
          </h3>
          <div className="space-y-1.5">
            {TRIGGERS.map((t) => <DraggableItem key={t.type} entry={t} />)}
          </div>
        </div>

        {/* Actions */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Zap className="h-3 w-3" /> Actions
          </h3>
          <div className="space-y-1.5">
            {ACTIONS.map((a) => <DraggableItem key={a.type} entry={a} />)}
          </div>
        </div>

        {/* Logic */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <GitBranch className="h-3 w-3" /> Logic
          </h3>
          <div className="space-y-1.5">
            {LOGIC.map((l) => <DraggableItem key={l.type} entry={l} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Right Panel — Saved Workflows ──────────────────────────────

function SavedWorkflowsPanel() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const isLoading = useWorkflowStore((s) => s.isLoadingWorkflows);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);
  const toggleWorkflow = useWorkflowStore((s) => s.toggleWorkflow);

  return (
    <div className="w-72 bg-gray-50 border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Saved Workflows</h2>
        <p className="text-xs text-gray-500 mt-1">{workflows.length} workflow{workflows.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
          </div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">No saved workflows</div>
        ) : (
          workflows.map((w) => {
            const isActive = workflowId === w.id;
            return (
              <div
                key={w.id}
                className={`rounded-lg border px-3 py-2 cursor-pointer transition-all ${
                  isActive ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
                onClick={() => loadWorkflow(w)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{w.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {w.nodes?.length || 0} nodes · {w.runsCount || 0} runs
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
                    {/* Toggle Active */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWorkflow(w.id); }}
                      className="p-1 rounded hover:bg-gray-100"
                      title={w.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {w.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-gray-400" />
                      )}
                    </button>

                    {/* More Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-gray-100" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4 text-gray-400" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => loadWorkflow(w)}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => deleteWorkflow(w.id)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Status badge */}
                <div className="mt-1">
                  {w.isActive ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                      <Power className="h-2.5 w-2.5" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Inactive
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Validation Errors Banner ───────────────────────────────────

function ValidationBanner() {
  const validationResult = useWorkflowStore((s) => s.validationResult);
  const clearError = useWorkflowStore((s) => s.clearError);

  if (!validationResult || validationResult.valid) return null;

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-2">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-medium text-red-800">
            Workflow has {validationResult.errors.length} error{validationResult.errors.length !== 1 ? 's' : ''}
          </div>
          <ul className="mt-1 space-y-0.5">
            {validationResult.errors.slice(0, 5).map((err, i) => (
              <li key={i} className="text-xs text-red-600">• {err.message}</li>
            ))}
            {validationResult.errors.length > 5 && (
              <li className="text-xs text-red-500 italic">...and {validationResult.errors.length - 5} more</li>
            )}
          </ul>
        </div>
        <button onClick={clearError} className="text-red-400 hover:text-red-600 text-xs">✕</button>
      </div>
    </div>
  );
}

// ─── Success Banner ─────────────────────────────────────────────

function SuccessBanner({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="bg-green-50 border-b border-green-200 px-4 py-2">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-sm text-green-800">{message}</span>
        <button onClick={onClose} className="ml-auto text-green-400 hover:text-green-600 text-xs">✕</button>
      </div>
    </div>
  );
}

// ─── Canvas (Center Panel) ──────────────────────────────────────

function WorkflowCanvas() {
  const { screenToFlowPosition } = useReactFlow();

  // Store selectors — pick exactly what we need
  const nodes = useWorkflowStore((s) => s.nodes);
  const edges = useWorkflowStore((s) => s.edges);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const workflowId = useWorkflowStore((s) => s.workflowId);
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const isSaving = useWorkflowStore((s) => s.isSaving);
  const error = useWorkflowStore((s) => s.error);

  const onNodesChange = useWorkflowStore((s) => s.onNodesChange);
  const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange);
  const onConnect = useWorkflowStore((s) => s.onConnect);
  const addNode = useWorkflowStore((s) => s.addNode);
  const selectNode = useWorkflowStore((s) => s.selectNode);
  const selectEdge = useWorkflowStore((s) => s.selectEdge);
  const clearSelection = useWorkflowStore((s) => s.clearSelection);
  const openConfigModal = useWorkflowStore((s) => s.openConfigModal);
  const deleteSelected = useWorkflowStore((s) => s.deleteSelected);
  const newWorkflow = useWorkflowStore((s) => s.newWorkflow);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const undo = useWorkflowStore((s) => s.undo);
  const redo = useWorkflowStore((s) => s.redo);
  const clearError = useWorkflowStore((s) => s.clearError);

  // Local state only for success message
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // ── Drop Handler ──────────────────────────────
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/workflow-node');
      if (!raw) return;

      try {
        const { type, label } = JSON.parse(raw) as { type: WorkflowNodeType; label: string };
        const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        addNode(type, label, position);
      } catch {
        // Ignore bad data
      }
    },
    [screenToFlowPosition, addNode]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Keyboard Shortcuts ────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z': e.preventDefault(); undo(); break;
          case 'y': e.preventDefault(); redo(); break;
          case 's': e.preventDefault(); handleSave(); break;
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
          deleteSelected();
        }
      }
      if (e.key === 'Escape') clearSelection();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, deleteSelected, clearSelection]);

  // ── Save Handler ──────────────────────────────
  const handleSave = useCallback(async () => {
    const success = await saveWorkflow();
    if (success) setSaveSuccess(true);
  }, [saveWorkflow]);

  // ── Workflow Name Change ──────────────────────
  const handleNameChange = useCallback((name: string) => {
    useWorkflowStore.setState({ workflowName: name, isDirty: true });
  }, []);

  // Edge style for selected edges
  const styledEdges = edges.map((e) => ({
    ...e,
    style: e.selected
      ? { strokeWidth: 3, stroke: '#ef4444' }
      : { strokeWidth: 2, stroke: '#6366f1' },
  }));

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3">
        {/* Name Input */}
        <Input
          value={workflowName}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-56 h-8 text-sm font-medium"
          placeholder="Workflow name..."
        />

        {isDirty && (
          <span className="text-xs text-amber-500 font-medium">Unsaved changes</span>
        )}

        <div className="flex-1" />

        {/* Undo / Redo */}
        <Button variant="ghost" size="sm" onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={redo} title="Redo (Ctrl+Y)">
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-200" />

        {/* Delete Selected */}
        <Button variant="ghost" size="sm" onClick={deleteSelected} title="Delete selected (Del)">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>

        {/* New Workflow */}
        <Button variant="ghost" size="sm" onClick={newWorkflow} title="New workflow">
          <Plus className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-200" />

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white h-8"
          size="sm"
        >
          {isSaving ? (
            <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</>
          ) : (
            <><Save className="h-3 w-3 mr-1" /> Save{workflowId ? '' : ' New'}</>
          )}
        </Button>
      </div>

      {/* Validation Errors */}
      <ValidationBanner />

      {/* Success */}
      {saveSuccess && <SuccessBanner message="Workflow saved successfully!" onClose={() => setSaveSuccess(false)} />}

      {/* Error Banner */}
      {error && !useWorkflowStore.getState().validationResult?.errors?.length && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-sm text-red-800">{error}</span>
          <button onClick={clearError} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}

      {/* ReactFlow Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={styledEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => selectNode(node.id)}
          onNodeDoubleClick={(_, node) => openConfigModal(node.id)}
          onEdgeClick={(_, edge) => selectEdge(edge.id)}
          onPaneClick={() => clearSelection()}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { strokeWidth: 2, stroke: '#6366f1' },
          }}
          fitView
          snapToGrid
          snapGrid={[15, 15]}
          className="bg-gray-50"
        >
          <Controls />
          <Background gap={15} size={1} color="#e5e7eb" />
        </ReactFlow>
      </div>
    </div>
  );
}

// ─── Main Page Component ────────────────────────────────────────

function AutomationPageInner() {
  const fetchWorkflows = useWorkflowStore((s) => s.fetchWorkflows);
  const configNodeId = useWorkflowStore((s) => s.configNodeId);

  // Fetch saved workflows on mount
  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  return (
    <div className="h-full flex">
      {/* Left — Node Palette */}
      <NodePalette />

      {/* Center — Canvas */}
      <WorkflowCanvas />

      {/* Right — Saved Workflows */}
      <SavedWorkflowsPanel />

      {/* Config Modal Overlay */}
      {configNodeId && <NodeConfigModal />}
    </div>
  );
}

export default function AutomationPage() {
  return (
    <ReactFlowProvider>
      <AutomationPageInner />
    </ReactFlowProvider>
  );
}
