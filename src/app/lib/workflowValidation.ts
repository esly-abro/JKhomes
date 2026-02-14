/**
 * Workflow validation engine.
 *
 * Validates the graph structure and node configurations
 * BEFORE saving to the database. Rejects invalid flows.
 *
 * Rules enforced:
 *   1. Exactly 1 trigger node
 *   2. Trigger must be a start node (no incoming edges)
 *   3. No disconnected nodes (all reachable from trigger)
 *   4. No cycles (DAG enforcement via DFS)
 *   5. All required configs filled per node type
 *   6. Valid graph structure
 */

import { z } from 'zod';
import type {
  SerializedNode,
  SerializedEdge,
  ValidationResult,
  ValidationError,
  WorkflowNodeData,
} from './workflowTypes';
import { TRIGGER_TYPES } from './workflowTypes';

// ─── Zod Config Schemas ─────────────────────────────────────────

export const whatsAppConfigSchema = z.object({
  template: z.string().optional(),
  templateId: z.string().optional(),
  message: z.string().optional(),
  buttons: z.array(z.object({ text: z.string(), payload: z.string().optional() })).optional(),
}).refine(
  (data) => !!(data.template || data.message),
  { message: 'WhatsApp node requires a template or custom message' }
);

export const aiCallConfigSchema = z.object({
  agentId: z.string().optional(),
  script: z.string().optional(),
  maxDuration: z.number().positive().optional(),
});
// AI call works with defaults — no required fields

export const humanCallConfigSchema = z.object({
  assignTo: z.string().default('auto'),
  priority: z.enum(['high', 'medium', 'low']).default('high'),
  autoConfigured: z.boolean().default(true),
});
// Human call is auto-configured — no required fields

export const emailConfigSchema = z.object({
  subject: z.string().min(1, 'Email subject is required'),
  body: z.string().min(1, 'Email body is required'),
  templateId: z.string().optional(),
});

export const delayConfigSchema = z.object({
  duration: z.number().min(1, 'Duration must be at least 1'),
  unit: z.enum(['seconds', 'minutes', 'hours', 'days']),
});

export const conditionConfigSchema = z.object({
  field: z.string().min(1, 'Condition field is required'),
  operator: z.string().min(1, 'Condition operator is required'),
  value: z.string().optional(), // empty allowed for isEmpty / isNotEmpty operators
});

export const conditionTimeoutConfigSchema = conditionConfigSchema.extend({
  timeout: z.object({
    duration: z.number().min(1, 'Timeout duration must be at least 1'),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
});

// ─── Config Validator Dispatch ──────────────────────────────────

function validateNodeConfig(
  nodeType: string,
  config: Record<string, unknown>
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  try {
    switch (nodeType) {
      case 'whatsapp': {
        const result = whatsAppConfigSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((i) => issues.push(i.message));
        }
        break;
      }
      case 'aiCall': {
        const result = aiCallConfigSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((i) => issues.push(i.message));
        }
        break;
      }
      case 'humanCall': {
        // Auto-configured, always valid
        break;
      }
      case 'email': {
        const result = emailConfigSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((i) => issues.push(i.message));
        }
        break;
      }
      case 'delay': {
        const result = delayConfigSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((i) => issues.push(i.message));
        }
        break;
      }
      case 'condition': {
        const result = conditionConfigSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((i) => issues.push(i.message));
        }
        break;
      }
      case 'conditionTimeout': {
        const result = conditionTimeoutConfigSchema.safeParse(config);
        if (!result.success) {
          result.error.issues.forEach((i) => issues.push(i.message));
        }
        break;
      }
      // Trigger nodes have no config to validate
      default:
        break;
    }
  } catch {
    issues.push(`Unexpected error validating ${nodeType} config`);
  }

  return { valid: issues.length === 0, issues };
}

// ─── Graph Structure Validators ─────────────────────────────────

function findTriggerNodes(nodes: SerializedNode[]): SerializedNode[] {
  return nodes.filter((n) => n.type === 'trigger');
}

function buildAdjacencyList(
  nodes: SerializedNode[],
  edges: SerializedEdge[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    const current = adj.get(e.source) || [];
    current.push(e.target);
    adj.set(e.source, current);
  });
  return adj;
}

function buildIncomingMap(
  nodes: SerializedNode[],
  edges: SerializedEdge[]
): Map<string, string[]> {
  const inc = new Map<string, string[]>();
  nodes.forEach((n) => inc.set(n.id, []));
  edges.forEach((e) => {
    const current = inc.get(e.target) || [];
    current.push(e.source);
    inc.set(e.target, current);
  });
  return inc;
}

/** DFS cycle detection */
function hasCycle(adj: Map<string, string[]>): { hasCycle: boolean; cycleNode?: string } {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();

  adj.forEach((_, key) => color.set(key, WHITE));

  for (const [node] of adj) {
    if (color.get(node) === WHITE) {
      const stack: Array<{ node: string; iterator: IterableIterator<string> }> = [];
      stack.push({ node, iterator: (adj.get(node) || [])[Symbol.iterator]() });
      color.set(node, GRAY);

      while (stack.length > 0) {
        const entry = stack[stack.length - 1];
        const next = entry.iterator.next();

        if (next.done) {
          color.set(entry.node, BLACK);
          stack.pop();
        } else {
          const neighbor = next.value;
          const neighborColor = color.get(neighbor);
          if (neighborColor === GRAY) {
            return { hasCycle: true, cycleNode: neighbor };
          }
          if (neighborColor === WHITE) {
            color.set(neighbor, GRAY);
            stack.push({ node: neighbor, iterator: (adj.get(neighbor) || [])[Symbol.iterator]() });
          }
        }
      }
    }
  }

  return { hasCycle: false };
}

/** BFS reachability from a start node */
function reachableFrom(startId: string, adj: Map<string, string[]>): Set<string> {
  const visited = new Set<string>();
  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited;
}

// ─── Main Validator ─────────────────────────────────────────────

export function validateWorkflow(
  nodes: SerializedNode[],
  edges: SerializedEdge[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // 0. Must have at least one node
  if (nodes.length === 0) {
    errors.push({ message: 'Workflow must have at least one node', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  // 1. Exactly 1 trigger
  const triggers = findTriggerNodes(nodes);
  if (triggers.length === 0) {
    errors.push({ message: 'Workflow must have exactly one trigger node', severity: 'error' });
  } else if (triggers.length > 1) {
    triggers.slice(1).forEach((t) =>
      errors.push({
        nodeId: t.id,
        message: `Extra trigger node "${(t.data as WorkflowNodeData).label}" — only one trigger is allowed`,
        severity: 'error',
      })
    );
  }

  // 2. Trigger must be a start node (no incoming edges)
  if (triggers.length >= 1) {
    const incoming = buildIncomingMap(nodes, edges);
    for (const trigger of triggers) {
      const inEdges = incoming.get(trigger.id) || [];
      if (inEdges.length > 0) {
        errors.push({
          nodeId: trigger.id,
          message: 'Trigger node must not have incoming connections — it must be the starting point',
          severity: 'error',
        });
      }
    }
  }

  // 3. No cycles
  const adj = buildAdjacencyList(nodes, edges);
  const cycleResult = hasCycle(adj);
  if (cycleResult.hasCycle) {
    errors.push({
      nodeId: cycleResult.cycleNode,
      message: 'Workflow contains a cycle (infinite loop). Remove the circular connection.',
      severity: 'error',
    });
  }

  // 4. No disconnected nodes
  if (triggers.length === 1) {
    const reachable = reachableFrom(triggers[0].id, adj);
    for (const node of nodes) {
      if (!reachable.has(node.id)) {
        errors.push({
          nodeId: node.id,
          message: `Node "${(node.data as WorkflowNodeData).label}" is not connected to the workflow`,
          severity: 'error',
        });
      }
    }
  }

  // 5. All edges reference valid nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({ message: `Edge references non-existent source node: ${edge.source}`, severity: 'error' });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({ message: `Edge references non-existent target node: ${edge.target}`, severity: 'error' });
    }
  }

  // 6. Validate each node's config
  for (const node of nodes) {
    const data = node.data as WorkflowNodeData;
    if (!data.type) {
      errors.push({
        nodeId: node.id,
        message: `Node "${data.label}" has no type defined`,
        severity: 'error',
      });
      continue;
    }

    // Skip trigger config validation (triggers don't need config)
    if (node.type === 'trigger') continue;

    const config = (data.config || {}) as Record<string, unknown>;
    const configResult = validateNodeConfig(data.type, config);

    if (!configResult.valid) {
      configResult.issues.forEach((issue) =>
        errors.push({
          nodeId: node.id,
          field: 'config',
          message: `${data.label}: ${issue}`,
          severity: 'error',
        })
      );
    }
  }

  // 7. Warnings: non-trigger leaf nodes (no outgoing edges)
  for (const node of nodes) {
    if (node.type !== 'trigger') {
      const outgoing = adj.get(node.id) || [];
      if (outgoing.length === 0) {
        const data = node.data as WorkflowNodeData;
        // Leaf action nodes are fine (end of flow), but condition leaves are suspicious
        if (node.type === 'condition') {
          warnings.push({
            nodeId: node.id,
            message: `Condition node "${data.label}" has no outgoing connections — its branches lead nowhere`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Helper: Check if a single node's config is complete ────────
export function isNodeConfigured(data: WorkflowNodeData): boolean {
  const config = (data.config || {}) as Record<string, unknown>;

  switch (data.type) {
    case 'whatsapp':
      return !!(config.template || config.message);
    case 'aiCall':
      return true; // works with defaults
    case 'humanCall':
      return true; // auto-configured
    case 'email':
      return !!(config.subject && config.body);
    case 'delay':
      return typeof config.duration === 'number' && config.duration > 0 && !!config.unit;
    case 'condition':
      return !!(config.field && config.operator);
    case 'conditionTimeout':
      return !!(config.field && config.operator && config.timeout);
    default:
      return true; // triggers and unknown types
  }
}
