import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  useKeyPress,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Zap,
  MessageSquare,
  Phone,
  Mail,
  Clock,
  GitBranch,
  Play,
  Save,
  Trash2,
  Plus,
  FolderOpen,
  User,
  PhoneCall,
  Bot,
  Timer,
  AlertCircle,
  CheckCircle2,
  Settings,
  Copy,
  MoreVertical,
  Undo2,
  Redo2,
  Loader2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

// Custom Node Components
import { TriggerNode, ActionNode, ConditionNode, DelayNode } from '../components/automation';
import NodeConfigPanel from '../components/automation/NodeConfigPanel';

// Automation service
import automationService, { type Automation } from '../../services/automations';

// Node types configuration
const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
  delay: DelayNode,
};

// Default edge options with curved lines
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: true,
  style: { strokeWidth: 2, stroke: '#6366f1' },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: '#6366f1',
  },
};

// Saved automation interface (for UI display)
interface SavedAutomation {
  id: string;
  _id?: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  isActive: boolean;
  lastModified: string;
  runsCount: number;
}

// Node palette items
const triggerItems = [
  { type: 'newLead', label: 'New Lead Added', icon: User, color: 'bg-green-500' },
  { type: 'leadUpdated', label: 'Lead Updated', icon: User, color: 'bg-blue-500' },
  { type: 'siteVisitScheduled', label: 'Site Visit Scheduled', icon: User, color: 'bg-purple-500' },
];

const actionItems = [
  { type: 'whatsapp', label: 'WhatsApp Message', icon: MessageSquare, color: 'bg-green-600' },
  { type: 'aiCall', label: 'AI Phone Call', icon: Bot, color: 'bg-blue-600' },
  { type: 'humanCall', label: 'Human Phone Call', icon: PhoneCall, color: 'bg-orange-600' },
  { type: 'email', label: 'Send Email', icon: Mail, color: 'bg-red-600' },
];

const logicItems = [
  { type: 'condition', label: 'If Condition', icon: GitBranch, color: 'bg-yellow-500' },
  { type: 'delay', label: 'Wait / Delay', icon: Timer, color: 'bg-gray-500' },
  { type: 'conditionTimeout', label: 'Condition + Timeout', icon: Clock, color: 'bg-indigo-500' },
];

function AutomationFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [automationName, setAutomationName] = useState('New Automation');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [configPanelNode, setConfigPanelNode] = useState<Node | null>(null);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Undo/Redo history
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([{ nodes: [], edges: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoAction = useRef(false);

  // Save state to history (for undo/redo)
  const saveToHistory = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ nodes: newNodes, edges: newEdges });
      // Limit history to 50 items
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex].nodes);
      setEdges(history[newIndex].edges);
      setSelectedNode(null);
      setSelectedEdge(null);
    }
  }, [historyIndex, history]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex].nodes);
      setEdges(history[newIndex].edges);
      setSelectedNode(null);
      setSelectedEdge(null);
    }
  }, [historyIndex, history]);

  // Keyboard shortcuts for undo/redo and delete
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl+Z for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
      }
      // Ctrl+Y or Ctrl+Shift+Z for redo
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        event.preventDefault();
        handleRedo();
      }
      // Delete or Backspace to delete selected node/edge
      if (event.key === 'Delete' || event.key === 'Backspace') {
        // Don't delete if user is typing in an input
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
          return;
        }
        event.preventDefault();
        // Delete selected edge or node
        if (selectedEdge) {
          const newEdges = edges.filter((e) => e.id !== selectedEdge.id);
          setEdges(newEdges);
          saveToHistory(nodes, newEdges);
          setSelectedEdge(null);
        } else if (selectedNode) {
          const newNodes = nodes.filter((n) => n.id !== selectedNode.id);
          const newEdges = edges.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id);
          setNodes(newNodes);
          setEdges(newEdges);
          saveToHistory(newNodes, newEdges);
          setSelectedNode(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedNode, selectedEdge, nodes, edges, saveToHistory]);
  
  // Saved automations state
  const [savedAutomations, setSavedAutomations] = useState<SavedAutomation[]>([]);
  const [activeAutomationId, setActiveAutomationId] = useState<string | null>(null);

  // Load automations from API
  useEffect(() => {
    const loadAutomations = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await automationService.getAutomations();
        const mapped = data.map((a: Automation) => ({
          id: a._id,
          _id: a._id,
          name: a.name,
          description: a.description || '',
          nodes: a.nodes as unknown as Node[],
          edges: a.edges as unknown as Edge[],
          isActive: a.isActive,
          lastModified: new Date(a.updatedAt).toLocaleDateString(),
          runsCount: a.runsCount,
        }));
        setSavedAutomations(mapped);
      } catch (err) {
        console.error('Failed to load automations:', err);
        setError('Failed to load automations');
      } finally {
        setIsLoading(false);
      }
    };
    loadAutomations();
  }, []);

  // Handle node changes
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const newNodes = applyNodeChanges(changes, nds);
        // Save to history on significant changes (not just selection)
        const hasSignificantChange = changes.some(c => c.type !== 'select');
        if (hasSignificantChange) {
          setTimeout(() => saveToHistory(newNodes, edges), 0);
        }
        return newNodes;
      });
    },
    [edges, saveToHistory]
  );

  // Handle edge changes
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => {
        const newEdges = applyEdgeChanges(changes, eds);
        // Save to history on significant changes
        const hasSignificantChange = changes.some(c => c.type !== 'select');
        if (hasSignificantChange) {
          setTimeout(() => saveToHistory(nodes, newEdges), 0);
        }
        return newEdges;
      });
    },
    [nodes, saveToHistory]
  );

  // Handle new connections
  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge({
          ...params,
          type: 'smoothstep',
          animated: true,
          style: { strokeWidth: 2, stroke: '#6366f1' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: '#6366f1',
          },
        }, eds);
        setTimeout(() => saveToHistory(nodes, newEdges), 0);
        return newEdges;
      });
    },
    [nodes, saveToHistory]
  );

  // Handle node selection
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  // Handle edge selection (click on arrow to select)
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  // Handle pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  // Drag and drop handlers
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow-type');
      const nodeType = event.dataTransfer.getData('application/reactflow-nodetype');
      const label = event.dataTransfer.getData('application/reactflow-label');
      const color = event.dataTransfer.getData('application/reactflow-color');

      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type: nodeType,
        position,
        data: { 
          label, 
          type,
          color,
          config: getDefaultConfig(type),
        },
      };

      setNodes((nds) => {
        const newNodes = nds.concat(newNode);
        setTimeout(() => saveToHistory(newNodes, edges), 0);
        return newNodes;
      });
    },
    [screenToFlowPosition, edges, saveToHistory]
  );

  // Get default config based on node type
  const getDefaultConfig = (type: string) => {
    switch (type) {
      case 'whatsapp':
        return { message: '', template: 'welcome' };
      case 'aiCall':
        return { script: 'default', maxDuration: 300 };
      case 'humanCall':
        return { assignTo: 'auto', priority: 'normal' };
      case 'email':
        return { subject: '', body: '', template: 'default' };
      case 'condition':
        return { field: 'budget', operator: '>', value: '' };
      case 'delay':
        return { duration: 1, unit: 'hours' };
      case 'conditionTimeout':
        return { condition: { field: 'response', operator: '==', value: 'none' }, timeout: { duration: 24, unit: 'hours' } };
      default:
        return {};
    }
  };

  // Save current automation
  const handleSaveAutomation = async () => {
    try {
      setIsSaving(true);
      setError(null);
      
      const automationData = {
        name: automationName,
        description: 'Workflow automation',
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type || 'action',
          position: n.position,
          data: n.data as { label: string; type: string; color: string; config?: Record<string, unknown> },
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          type: e.type,
          animated: e.animated,
        })),
      };

      if (activeAutomationId) {
        // Update existing automation
        const updated = await automationService.updateAutomation(activeAutomationId, automationData as Parameters<typeof automationService.updateAutomation>[1]);
        setSavedAutomations((prev) =>
          prev.map((auto) =>
            auto.id === activeAutomationId
              ? { 
                  ...auto, 
                  name: updated.name, 
                  nodes: updated.nodes as unknown as Node[], 
                  edges: updated.edges as unknown as Edge[], 
                  lastModified: 'Just now' 
                }
              : auto
          )
        );
      } else {
        // Create new automation
        const created = await automationService.createAutomation(automationData as Parameters<typeof automationService.createAutomation>[0]);
        const newAutomation: SavedAutomation = {
          id: created._id,
          _id: created._id,
          name: created.name,
          description: created.description || '',
          nodes: created.nodes as unknown as Node[],
          edges: created.edges as unknown as Edge[],
          isActive: created.isActive,
          lastModified: 'Just now',
          runsCount: 0,
        };
        setSavedAutomations((prev) => [...prev, newAutomation]);
        setActiveAutomationId(newAutomation.id);
      }
    } catch (err) {
      console.error('Failed to save automation:', err);
      setError('Failed to save automation');
    } finally {
      setIsSaving(false);
    }
  };

  // Load automation
  const handleLoadAutomation = (automation: SavedAutomation) => {
    setNodes(automation.nodes);
    setEdges(automation.edges);
    setAutomationName(automation.name);
    setActiveAutomationId(automation.id);
    setSelectedNode(null);
    setSelectedEdge(null);
    // Reset history when loading
    setHistory([{ nodes: automation.nodes, edges: automation.edges }]);
    setHistoryIndex(0);
  };

  // Create new automation
  const handleNewAutomation = () => {
    setNodes([]);
    setEdges([]);
    setAutomationName('New Automation');
    setActiveAutomationId(null);
    setSelectedNode(null);
    setSelectedEdge(null);
    // Reset history
    setHistory([{ nodes: [], edges: [] }]);
    setHistoryIndex(0);
  };

  // Delete automation
  const handleDeleteAutomation = async (id: string) => {
    try {
      await automationService.deleteAutomation(id);
      setSavedAutomations((prev) => prev.filter((auto) => auto.id !== id));
      if (activeAutomationId === id) {
        handleNewAutomation();
      }
    } catch (err) {
      console.error('Failed to delete automation:', err);
      setError('Failed to delete automation');
    }
  };

  // Toggle automation active state
  const handleToggleAutomation = async (id: string) => {
    try {
      const updated = await automationService.toggleAutomation(id);
      setSavedAutomations((prev) =>
        prev.map((auto) =>
          auto.id === id ? { ...auto, isActive: updated.isActive } : auto
        )
      );
    } catch (err) {
      console.error('Failed to toggle automation:', err);
      setError('Failed to toggle automation');
    }
  };

  // Delete selected node
  const handleDeleteNode = useCallback(() => {
    if (selectedNode) {
      const newNodes = nodes.filter((n) => n.id !== selectedNode.id);
      const newEdges = edges.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id);
      setNodes(newNodes);
      setEdges(newEdges);
      setSelectedNode(null);
      saveToHistory(newNodes, newEdges);
    }
  }, [selectedNode, nodes, edges, saveToHistory]);

  // Delete selected edge (arrow)
  const handleDeleteEdge = useCallback(() => {
    if (selectedEdge) {
      const newEdges = edges.filter((e) => e.id !== selectedEdge.id);
      setEdges(newEdges);
      setSelectedEdge(null);
      saveToHistory(nodes, newEdges);
    }
  }, [selectedEdge, nodes, edges, saveToHistory]);

  // Double-click to open config panel
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    setConfigPanelNode(node);
  }, []);

  // Update node data from config panel
  const handleUpdateNodeData = useCallback((nodeId: string, data: Record<string, unknown>) => {
    setNodes((nds) => {
      const newNodes = nds.map((n) => 
        n.id === nodeId ? { ...n, data } : n
      );
      saveToHistory(newNodes, edges);
      return newNodes;
    });
  }, [edges, saveToHistory]);

  // Add condition node when WhatsApp template has buttons
  const handleAddConditionNode = useCallback((sourceNodeId: string, buttons: Array<{ text: string; payload?: string }>) => {
    // Find the source node to position the new condition node below it
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    // Check if there's already a condition node connected to this source
    const existingCondition = edges.find(e => e.source === sourceNodeId && 
      nodes.find(n => n.id === e.target && n.type === 'condition'));
    
    if (existingCondition) {
      // Update existing condition node with new buttons
      const conditionNode = nodes.find(n => n.id === existingCondition.target);
      if (conditionNode) {
        const newData = {
          ...conditionNode.data as Record<string, unknown>,
          label: 'Template Response',
          type: 'templateResponse',
          config: {
            type: 'templateResponse',
            options: buttons.map(b => b.text),
          }
        };
        handleUpdateNodeData(conditionNode.id, newData);
      }
      return;
    }

    // Create a new condition node with template button options
    const conditionNodeId = `templateCondition-${Date.now()}`;
    const newConditionNode: Node = {
      id: conditionNodeId,
      type: 'condition',
      position: {
        x: sourceNode.position.x,
        y: sourceNode.position.y + 150,
      },
      data: {
        label: 'Template Response',
        type: 'templateResponse',
        color: 'bg-yellow-500',
        config: {
          type: 'templateResponse',
          options: buttons.map(b => b.text),
        }
      }
    };

    // Create edge from WhatsApp node to condition node
    const newEdge: Edge = {
      id: `edge-${sourceNodeId}-${conditionNodeId}`,
      source: sourceNodeId,
      target: conditionNodeId,
      type: 'smoothstep',
      animated: true,
      style: { strokeWidth: 2, stroke: '#6366f1' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#6366f1',
      },
    };

    setNodes((nds) => {
      const newNodes = [...nds, newConditionNode];
      setTimeout(() => saveToHistory(newNodes, [...edges, newEdge]), 0);
      return newNodes;
    });
    setEdges((eds) => [...eds, newEdge]);
  }, [nodes, edges, saveToHistory, handleUpdateNodeData]);

  // Draggable node item component
  const DraggableItem = ({ item, nodeType }: { item: typeof triggerItems[0]; nodeType: string }) => {
    const onDragStart = (event: React.DragEvent) => {
      event.dataTransfer.setData('application/reactflow-type', item.type);
      event.dataTransfer.setData('application/reactflow-nodetype', nodeType);
      event.dataTransfer.setData('application/reactflow-label', item.label);
      event.dataTransfer.setData('application/reactflow-color', item.color);
      event.dataTransfer.effectAllowed = 'move';
    };

    return (
      <div
        draggable
        onDragStart={onDragStart}
        className="flex items-center gap-2 p-2 bg-white border rounded-lg cursor-grab hover:border-blue-400 hover:shadow-sm transition-all active:cursor-grabbing"
      >
        <div className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center`}>
          <item.icon className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium">{item.label}</span>
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      {/* Left Panel - Node Palette */}
      <div className="w-64 bg-white border rounded-lg p-4 overflow-y-auto flex-shrink-0">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-500" />
          Workflow Blocks
        </h3>

        {/* Triggers */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <Play className="h-3 w-3" />
            Triggers
          </h4>
          <div className="space-y-2">
            {triggerItems.map((item) => (
              <DraggableItem key={item.type} item={item} nodeType="trigger" />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="mb-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <Zap className="h-3 w-3" />
            Actions
          </h4>
          <div className="space-y-2">
            {actionItems.map((item) => (
              <DraggableItem key={item.type} item={item} nodeType="action" />
            ))}
          </div>
        </div>

        {/* Logic */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            Logic & Flow
          </h4>
          <div className="space-y-2">
            {logicItems.map((item) => (
              <DraggableItem key={item.type} item={item} nodeType={item.type === 'condition' || item.type === 'conditionTimeout' ? 'condition' : 'delay'} />
            ))}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-3 bg-blue-50 rounded-lg space-y-2">
          <p className="text-xs text-blue-700">
            <strong>Tip:</strong> Drag blocks onto the canvas and connect them by dragging from one handle to another.
          </p>
          <p className="text-xs text-blue-600">
            <strong>Shortcuts:</strong><br />
            • Click arrow to select, Delete to remove<br />
            • Ctrl+Z to undo, Ctrl+Y to redo<br />
            • Double-click node to configure
          </p>
        </div>
      </div>

      {/* Center - Flow Canvas */}
      <div className="flex-1 flex flex-col bg-white border rounded-lg overflow-hidden relative">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <div className="flex items-center gap-3">
            <Input
              value={automationName}
              onChange={(e) => setAutomationName(e.target.value)}
              className="w-48 h-8 text-sm font-medium"
            />
            {activeAutomationId && (
              <span className="text-xs text-gray-500">
                Editing saved automation
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Undo/Redo buttons */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            {selectedNode && (
              <Button variant="outline" size="sm" onClick={handleDeleteNode} className="text-red-600 hover:text-red-700">
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Node
              </Button>
            )}
            {selectedEdge && (
              <Button variant="outline" size="sm" onClick={handleDeleteEdge} className="text-red-600 hover:text-red-700">
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Connection
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleNewAutomation}>
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
            <Button size="sm" onClick={handleSaveAutomation} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
          </div>
        )}

        {/* React Flow Canvas */}
        <div className="flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges.map(edge => ({
              ...edge,
              style: selectedEdge?.id === edge.id 
                ? { ...edge.style, stroke: '#ef4444', strokeWidth: 3 } 
                : edge.style
            }))}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            snapToGrid
            snapGrid={[15, 15]}
            className="bg-gray-50"
          >
            <Background color="#e5e7eb" gap={20} />
            <Controls />
          </ReactFlow>
        </div>

        {/* Empty State */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: '48px' }}>
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-600 mb-2">Start Building Your Automation</h3>
              <p className="text-sm text-gray-500 max-w-sm">
                Drag triggers, actions, and logic blocks from the left panel onto the canvas to create your workflow.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Saved Automations */}
      <div className="w-72 bg-white border rounded-lg p-4 overflow-y-auto flex-shrink-0">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-blue-500" />
          Saved Automations
        </h3>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <span className="text-sm">Loading automations...</span>
          </div>
        ) : savedAutomations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No automations yet</p>
            <p className="text-xs mt-1">Create your first workflow!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {savedAutomations.map((automation) => (
              <div
                key={automation.id}
                className={`border rounded-lg p-3 cursor-pointer transition-all hover:border-blue-400 ${
                  activeAutomationId === automation.id ? 'border-blue-500 bg-blue-50' : ''
                }`}
                onClick={() => handleLoadAutomation(automation)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{automation.name}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{automation.description}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleLoadAutomation(automation); }}>
                      <Settings className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); }}>
                      <Copy className="h-4 w-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={(e) => { e.stopPropagation(); handleDeleteAutomation(automation.id); }}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>{automation.runsCount} runs</span>
                  <span>•</span>
                  <span>{automation.lastModified}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleAutomation(automation.id); }}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                    automation.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {automation.isActive ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Paused
                    </span>
                  )}
                </button>
              </div>
            </div>
            ))}
          </div>
        )}

        {/* Stats Summary */}
        <div className="mt-6 pt-4 border-t">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Summary</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 rounded-lg p-2">
              <p className="text-lg font-bold text-green-700">
                {savedAutomations.filter((a) => a.isActive).length}
              </p>
              <p className="text-xs text-green-600">Active</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <p className="text-lg font-bold text-blue-700">
                {savedAutomations.reduce((sum, a) => sum + a.runsCount, 0)}
              </p>
              <p className="text-xs text-blue-600">Total Runs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Node Configuration Panel */}
      {configPanelNode && (
        <NodeConfigPanel
          node={configPanelNode}
          onClose={() => setConfigPanelNode(null)}
          onUpdateNode={handleUpdateNodeData}
          onAddConditionNode={handleAddConditionNode}
        />
      )}
    </div>
  );
}

// Main component wrapped with ReactFlowProvider
export default function Automation() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation Builder</h1>
          <p className="text-gray-600">Create automated workflows for lead engagement</p>
        </div>
      </div>

      {/* Flow Builder */}
      <ReactFlowProvider>
        <AutomationFlow />
      </ReactFlowProvider>
    </div>
  );
}
