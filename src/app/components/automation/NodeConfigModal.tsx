/**
 * NodeConfigModal — react-hook-form + zod powered config modal.
 *
 * Opens when a user double-clicks a node on the canvas.
 * Each node type gets its own form section with validation.
 * On save, config is validated via zod before writing to the store.
 */

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X, MessageSquare, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTenantConfig } from '../../context/TenantConfigContext';
import { useWorkflowStore } from '../../stores/workflowStore';
import whatsappService, { WhatsAppTemplate, getMetaAccessToken } from '../../../services/whatsapp';
import type { WorkflowNodeData } from '../../lib/workflowTypes';

// ─── Form Schemas (per node type) ───────────────────────────────

const whatsappSchema = z.object({
  template: z.string().optional(),
  templateId: z.string().optional(),
  message: z.string().optional(),
  buttons: z.array(z.object({ text: z.string(), payload: z.string().optional() })).optional(),
}).refine((d) => !!(d.template || d.message), {
  message: 'Select a template or enter a custom message',
  path: ['message'],
});

const emailSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
});

const delaySchema = z.object({
  duration: z.coerce.number().min(1, 'Duration must be at least 1'),
  unit: z.enum(['seconds', 'minutes', 'hours', 'days']),
});

const aiCallSchema = z.object({
  agentId: z.string().optional(),
  script: z.string().optional(),
  maxDuration: z.coerce.number().positive().optional(),
});

const conditionSchema = z.object({
  field: z.string().min(1, 'Field is required'),
  operator: z.string().min(1, 'Operator is required'),
  value: z.string().optional(),
});

const conditionTimeoutSchema = conditionSchema.extend({
  timeout: z.object({
    duration: z.coerce.number().min(1, 'Timeout duration required'),
    unit: z.enum(['minutes', 'hours', 'days']),
  }),
});

// ─── Component ──────────────────────────────────────────────────

export default function NodeConfigModal() {
  const configNodeId = useWorkflowStore((s) => s.configNodeId);
  const nodes = useWorkflowStore((s) => s.nodes);
  const updateNodeData = useWorkflowStore((s) => s.updateNodeData);
  const closeConfigModal = useWorkflowStore((s) => s.closeConfigModal);
  const addConditionNodeFromWhatsApp = useWorkflowStore((s) => s.addConditionNodeFromWhatsApp);

  const node = nodes.find((n) => n.id === configNodeId);
  const nodeData = node?.data as WorkflowNodeData | undefined;
  const nodeType = nodeData?.type;
  const nodeConfig = (nodeData?.config || {}) as Record<string, unknown>;

  if (!node || !nodeData || !nodeType) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { if (e.target === e.currentTarget) closeConfigModal(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Configure: {nodeData.label}</h3>
          <button onClick={closeConfigModal} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {nodeType === 'whatsapp' && (
            <WhatsAppForm
              nodeId={node.id}
              nodeData={nodeData}
              config={nodeConfig}
              onSave={(config) => { updateNodeData(node.id, { ...nodeData, config }); closeConfigModal(); }}
              onAddCondition={(buttons) => addConditionNodeFromWhatsApp(node.id, buttons)}
              onClose={closeConfigModal}
            />
          )}
          {nodeType === 'email' && (
            <GenericForm
              schema={emailSchema}
              defaults={{ subject: (nodeConfig.subject as string) || '', body: (nodeConfig.body as string) || '' }}
              onSave={(config) => { updateNodeData(node.id, { ...nodeData, config }); closeConfigModal(); }}
              onClose={closeConfigModal}
              render={({ control, errors }) => (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <Controller name="subject" control={control} render={({ field }) => <Input {...field} placeholder="Welcome to our team!" />} />
                    {errors.subject && <p className="text-xs text-red-500 mt-1">{String(errors.subject.message)}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                    <Controller
                      name="body"
                      control={control}
                      render={({ field }) => (
                        <textarea {...field} rows={5} placeholder="Dear {{name}},..." className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      )}
                    />
                    {errors.body && <p className="text-xs text-red-500 mt-1">{String(errors.body.message)}</p>}
                  </div>
                </>
              )}
            />
          )}
          {nodeType === 'delay' && (
            <GenericForm
              schema={delaySchema}
              defaults={{ duration: (nodeConfig.duration as number) || 5, unit: (nodeConfig.unit as 'seconds' | 'minutes' | 'hours' | 'days') || 'minutes' }}
              onSave={(config) => { updateNodeData(node.id, { ...nodeData, config }); closeConfigModal(); }}
              onClose={closeConfigModal}
              render={({ control, errors }) => (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wait Duration</label>
                  <div className="flex gap-2">
                    <Controller name="duration" control={control} render={({ field }) => <Input type="number" {...field} min={1} className="w-24" />} />
                    <Controller
                      name="unit"
                      control={control}
                      render={({ field }) => (
                        <select {...field} className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="seconds">Seconds</option>
                          <option value="minutes">Minutes</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      )}
                    />
                  </div>
                  {errors.duration && <p className="text-xs text-red-500 mt-1">{String(errors.duration.message)}</p>}
                </div>
              )}
            />
          )}
          {nodeType === 'aiCall' && (
            <GenericForm
              schema={aiCallSchema}
              defaults={{ agentId: (nodeConfig.agentId as string) || '', script: (nodeConfig.script as string) || '', maxDuration: (nodeConfig.maxDuration as number) || 300 }}
              onSave={(config) => { updateNodeData(node.id, { ...nodeData, config }); closeConfigModal(); }}
              onClose={closeConfigModal}
              render={({ control, errors }) => (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🤖</span>
                      <span className="font-semibold text-blue-900">AI Phone Call</span>
                    </div>
                    <p className="text-sm text-blue-800">The AI will call the lead using their phone number from the lead record. Lead name and details are passed to the AI agent.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Agent ID (Optional)</label>
                    <Controller name="agentId" control={control} render={({ field }) => <Input {...field} placeholder="ElevenLabs Agent ID" />} />
                    <p className="text-xs text-gray-500 mt-1">Leave blank to use the default agent from Settings</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Call Script (Optional)</label>
                    <Controller
                      name="script"
                      control={control}
                      render={({ field }) => (
                        <textarea {...field} rows={4} placeholder="Greet the lead, introduce your company..." className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Duration (seconds)</label>
                    <Controller name="maxDuration" control={control} render={({ field }) => <Input type="number" {...field} min={30} className="w-32" />} />
                  </div>
                </>
              )}
            />
          )}
          {nodeType === 'humanCall' && (
            <HumanCallInfo onClose={closeConfigModal} onSave={() => { updateNodeData(node.id, { ...nodeData, config: { assignTo: 'auto', priority: 'high', autoConfigured: true } }); closeConfigModal(); }} />
          )}
          {(nodeType === 'condition' || nodeType === 'conditionTimeout') && (
            <ConditionForm nodeType={nodeType} config={nodeConfig} onSave={(config) => { updateNodeData(node.id, { ...nodeData, config }); closeConfigModal(); }} onClose={closeConfigModal} />
          )}
          {/* Trigger nodes - no config needed */}
          {['newLead', 'leadUpdated', 'siteVisitScheduled'].includes(nodeType) && (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <h4 className="font-medium text-gray-900">Trigger Node</h4>
              <p className="text-sm text-gray-600 mt-1">This node fires automatically. No configuration needed.</p>
              <div className="mt-4">
                <Button onClick={closeConfigModal}>Close</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Generic Form Wrapper (react-hook-form + zod) ───────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface GenericFormProps {
  schema: any;
  defaults: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  render: (props: { control: any; errors: any }) => React.ReactNode;
}

function GenericForm({ schema, defaults, onSave, onClose, render }: GenericFormProps) {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults as Record<string, any>,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      {render({ control, errors })}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save Configuration</Button>
      </div>
    </form>
  );
}

// ─── WhatsApp Form (special — loads templates from Meta API) ────

interface WhatsAppFormProps {
  nodeId: string;
  nodeData: WorkflowNodeData;
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onAddCondition: (buttons: Array<{ text: string; payload?: string }>) => void;
  onClose: () => void;
}

function WhatsAppForm({ config, onSave, onAddCondition, onClose }: WhatsAppFormProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(whatsappSchema),
    defaultValues: {
      template: (config.template as string) || '',
      templateId: (config.templateId as string) || '',
      message: (config.message as string) || '',
      buttons: (config.buttons as Array<{ text: string; payload?: string }>) || [],
    },
  });

  const selectedTemplate = watch('template');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    setTemplateError(null);
    try {
      const data = await whatsappService.getTemplates();
      setTemplates(data);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string };
      setTemplateError(error.response?.data?.error || error.message || 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (templateName: string) => {
    setValue('template', templateName);
    const template = templates.find((t) => t.name === templateName);
    if (template) {
      setValue('templateId', template.id);
      setValue('buttons', template.buttons || []);
      if (template.buttons && template.buttons.length > 0) {
        onAddCondition(template.buttons);
      }
    }
  };

  const template = templates.find((t) => t.name === selectedTemplate);

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 text-blue-600" />
          <span className="font-medium text-blue-900">WhatsApp Configuration</span>
        </div>
        <p className="text-xs text-blue-700 mt-1">Templates are loaded from your WhatsApp settings. Go to Settings → WhatsApp to configure.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message Template</label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates...</div>
        ) : templateError ? (
          <div className="text-sm text-red-500 flex items-center gap-2 py-2">
            <AlertCircle className="h-4 w-4" /> {templateError}
            <button type="button" onClick={loadTemplates} className="text-blue-500 underline ml-2">Retry</button>
          </div>
        ) : templates.length > 0 ? (
          <select
            value={selectedTemplate || ''}
            onChange={(e) => handleTemplateSelect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.name}>{t.name} ({t.status})</option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-gray-500 py-2">No templates found. Configure WhatsApp in Settings.</p>
        )}
      </div>

      {/* Template preview */}
      {template && (
        <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Preview</h4>
          <div className="text-sm text-gray-700 space-y-1">
            {template.components.map((comp, idx) => (
              <div key={idx}>
                {comp.type === 'HEADER' && comp.text && <div className="font-semibold">{comp.text}</div>}
                {comp.type === 'BODY' && comp.text && <div>{comp.text}</div>}
                {comp.type === 'FOOTER' && comp.text && <div className="text-xs text-gray-500">{comp.text}</div>}
              </div>
            ))}
          </div>
          {template.buttons.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs font-medium text-gray-600 mb-1">Quick Reply Buttons:</div>
              <div className="flex flex-wrap gap-2">
                {template.buttons.map((btn, idx) => (
                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">{btn.text}</span>
                ))}
              </div>
              <p className="text-xs text-green-600 mt-2">✓ A condition node will be added with these options</p>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message (if no template)</label>
        <Controller
          name="message"
          control={control}
          render={({ field }) => (
            <textarea {...field} rows={3} placeholder="Hi {{name}}, thank you for your interest..." className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
        />
        {errors.message && <p className="text-xs text-red-500 mt-1">{errors.message.message as string}</p>}
        <p className="text-xs text-gray-500 mt-1">Variables: {'{{name}}'}, {'{{phone}}'}, {'{{budget}}'}, {'{{location}}'}</p>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save Configuration</Button>
      </div>
    </form>
  );
}

// ─── Human Call Info (auto-configured) ──────────────────────────

function HumanCallInfo({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📞</span>
          <span className="font-semibold text-orange-900">Auto-Configured Action</span>
        </div>
        <p className="text-sm text-orange-800 mb-3">No configuration needed — this works automatically.</p>
        <div className="space-y-2 text-sm text-gray-700">
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>The lead's <strong>assigned agent</strong> receives a notification</span></div>
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>A <strong>task</strong> is created and assigned to the agent</span></div>
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>All <strong>lead details</strong> are attached automatically</span></div>
          <div className="flex items-start gap-2"><span className="text-green-500 mt-0.5">✓</span><span>Automation <strong>pauses</strong> until the agent completes the call</span></div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave}>Confirm</Button>
      </div>
    </div>
  );
}

// ─── Condition Form ─────────────────────────────────────────────

function ConditionForm({
  nodeType,
  config,
  onSave,
  onClose,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const { categoryFieldLabel, leadStatuses } = useTenantConfig();
  const schema = nodeType === 'conditionTimeout' ? conditionTimeoutSchema : conditionSchema;

  const timeout = config.timeout as Record<string, unknown> | undefined;
  const defaults = {
    field: (config.field as string) || 'status',
    operator: (config.operator as string) || 'equals',
    value: (config.value as string) || '',
    ...(nodeType === 'conditionTimeout'
      ? { timeout: { duration: (timeout?.duration as number) || 24, unit: (timeout?.unit as string) || 'hours' } }
      : {}),
  };

  const { control, handleSubmit, watch, formState: { errors } } = useForm<Record<string, any>>({
    resolver: zodResolver(schema) as any,
    defaultValues: defaults as Record<string, any>,
  });

  const field = watch('field');
  const operator = watch('operator');

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Check This Field</label>
        <Controller
          name="field"
          control={control}
          render={({ field: f }) => (
            <select {...f} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="status">Lead Status</option>
              <option value="callStatus">Call Status</option>
              <option value="whatsappStatus">WhatsApp Response</option>
              <option value="budget">Budget</option>
              <option value="source">Lead Source</option>
              <option value="propertyType">{categoryFieldLabel}</option>
              <option value="location">Location</option>
            </select>
          )}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
        <Controller
          name="operator"
          control={control}
          render={({ field: f }) => (
            <select {...f} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="equals">Is Equal To</option>
              <option value="notEquals">Is Not Equal To</option>
              <option value="contains">Contains</option>
              <option value="greaterThan">Greater Than</option>
              <option value="lessThan">Less Than</option>
              <option value="isEmpty">Is Empty</option>
              <option value="isNotEmpty">Is Not Empty</option>
            </select>
          )}
        />
      </div>

      {!['isEmpty', 'isNotEmpty'].includes(operator) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
          {field === 'status' ? (
            <Controller
              name="value"
              control={control}
              render={({ field: f }) => (
                <select {...f} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select status...</option>
                  {leadStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              )}
            />
          ) : field === 'callStatus' ? (
            <Controller
              name="value"
              control={control}
              render={({ field: f }) => (
                <select {...f} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select call status...</option>
                  <option value="not_called">Not Called Yet</option>
                  <option value="answered">Answered</option>
                  <option value="not_answered">Not Answered</option>
                  <option value="busy">Busy</option>
                  <option value="voicemail">Voicemail</option>
                </select>
              )}
            />
          ) : field === 'whatsappStatus' ? (
            <Controller
              name="value"
              control={control}
              render={({ field: f }) => (
                <select {...f} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select WhatsApp status...</option>
                  <option value="not_sent">Not Sent</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="replied">Replied</option>
                  <option value="not_responding">Not Responding</option>
                </select>
              )}
            />
          ) : field === 'budget' ? (
            <Controller name="value" control={control} render={({ field: f }) => <Input type="number" {...f} placeholder="e.g., 5000000" />} />
          ) : (
            <Controller name="value" control={control} render={({ field: f }) => <Input type="text" {...f} placeholder={`Enter ${field}...`} />} />
          )}
          {errors.value && <p className="text-xs text-red-500 mt-1">{String(errors.value.message)}</p>}
        </div>
      )}

      {/* Timeout section for conditionTimeout */}
      {nodeType === 'conditionTimeout' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timeout</label>
          <div className="flex gap-2">
            <Controller name="timeout.duration" control={control} render={({ field: f }) => <Input type="number" {...f} min={1} className="w-24" />} />
            <Controller
              name="timeout.unit"
              control={control}
              render={({ field: f }) => (
                <select {...f} className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              )}
            />
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-yellow-800 uppercase mb-2">Condition Preview</h4>
        <p className="text-sm text-yellow-900">If <strong>{field}</strong> {operator} {!['isEmpty', 'isNotEmpty'].includes(operator) && <strong>"{watch('value') || '...'}"</strong>}</p>
        <div className="flex gap-4 mt-2 text-xs">
          <span className="text-green-600">✓ Yes → continue</span>
          <span className="text-red-600">✗ No → alternate path</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">Save Configuration</Button>
      </div>
    </form>
  );
}
