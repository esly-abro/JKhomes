import { useState, useEffect } from 'react';
import { Node } from '@xyflow/react';
import { X, MessageSquare, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import whatsappService, { WhatsAppTemplate, setMetaAccessToken, getMetaAccessToken } from '../../../services/whatsapp';

interface NodeConfigPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdateNode: (nodeId: string, data: Record<string, unknown>) => void;
  onAddConditionNode: (sourceNodeId: string, buttons: Array<{ text: string; payload?: string }>) => void;
}

export default function NodeConfigPanel({ node, onClose, onUpdateNode, onAddConditionNode }: NodeConfigPanelProps) {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState(getMetaAccessToken() || '');
  const [isTokenSaved, setIsTokenSaved] = useState(!!getMetaAccessToken());
  
  // Node config state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [message, setMessage] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [duration, setDuration] = useState<number>(5);
  const [durationUnit, setDurationUnit] = useState<string>('minutes');
  
  // Condition config state
  const [conditionField, setConditionField] = useState<string>('status');
  const [conditionOperator, setConditionOperator] = useState<string>('equals');
  const [conditionValue, setConditionValue] = useState<string>('');
  const [timeoutDuration, setTimeoutDuration] = useState<number>(24);
  const [timeoutUnit, setTimeoutUnit] = useState<string>('hours');
  
  const nodeData = node?.data as Record<string, unknown> | undefined;
  const nodeType = nodeData?.type as string;
  const nodeConfig = nodeData?.config as Record<string, unknown> | undefined;

  // Load saved config when node changes
  useEffect(() => {
    if (nodeConfig) {
      setSelectedTemplate((nodeConfig.template as string) || '');
      setMessage((nodeConfig.message as string) || '');
      setSubject((nodeConfig.subject as string) || '');
      setDuration((nodeConfig.duration as number) || 5);
      setDurationUnit((nodeConfig.unit as string) || 'minutes');
      // Condition config
      setConditionField((nodeConfig.field as string) || 'status');
      setConditionOperator((nodeConfig.operator as string) || 'equals');
      setConditionValue((nodeConfig.value as string) || '');
      const timeout = nodeConfig.timeout as Record<string, unknown> | undefined;
      setTimeoutDuration((timeout?.duration as number) || 24);
      setTimeoutUnit((timeout?.unit as string) || 'hours');
    }
  }, [node?.id, nodeConfig]);

  // Load WhatsApp templates when panel opens for WhatsApp node
  useEffect(() => {
    if (nodeType === 'whatsapp') {
      loadTemplates();
    }
  }, [nodeType]);

  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    setTemplateError(null);
    try {
      const data = await whatsappService.getTemplates();
      setTemplates(data);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      console.error('Failed to load templates:', error);
      setTemplateError(err.response?.data?.error || err.message || 'Failed to load templates. Please configure WhatsApp in Settings.');
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleSaveToken = () => {
    // No longer needed - tokens are managed in Settings
    setIsTokenSaved(true);
    loadTemplates();
  };

  const handleTemplateSelect = (templateName: string) => {
    setSelectedTemplate(templateName);
    
    // Find the template and check if it has buttons
    const template = templates.find(t => t.name === templateName);
    
    if (node && template) {
      // Update node config
      onUpdateNode(node.id, {
        ...nodeData,
        config: {
          ...nodeConfig,
          template: templateName,
          templateId: template.id,
          buttons: template.buttons,
        }
      });

      // If template has buttons, offer to add condition node
      if (template.buttons && template.buttons.length > 0) {
        onAddConditionNode(node.id, template.buttons);
      }
    }
  };

  const handleSaveConfig = () => {
    if (!node) return;

    const config: Record<string, unknown> = { ...nodeConfig };

    switch (nodeType) {
      case 'whatsapp':
        config.template = selectedTemplate;
        config.message = message;
        break;
      case 'email':
        config.subject = subject;
        config.body = message;
        break;
      case 'delay':
      case 'wait':
        config.duration = duration;
        config.unit = durationUnit;
        break;
      case 'aiCall':
        config.script = message;
        break;
      case 'condition':
        config.field = conditionField;
        config.operator = conditionOperator;
        config.value = conditionValue;
        break;
      case 'conditionTimeout':
        config.field = conditionField;
        config.operator = conditionOperator;
        config.value = conditionValue;
        config.timeout = {
          duration: timeoutDuration,
          unit: timeoutUnit
        };
        break;
    }

    onUpdateNode(node.id, {
      ...nodeData,
      config
    });
    
    onClose();
  };

  if (!node) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Configure: {nodeData?.label as string}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {/* WhatsApp Config */}
          {nodeType === 'whatsapp' && (
            <div className="space-y-4">
              {/* WhatsApp Setup Status */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-900">WhatsApp Configuration</span>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  Templates are loaded from your saved WhatsApp settings.
                  <br />
                  Go to Settings → WhatsApp to configure your API credentials.
                </p>
              </div>

              {/* Templates Dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message Template
                </label>
                
                {isLoadingTemplates ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading templates...
                  </div>
                ) : templateError ? (
                  <div className="text-sm text-red-500 flex items-center gap-2 py-2">
                    <AlertCircle className="h-4 w-4" />
                    {templateError}
                    <button onClick={loadTemplates} className="text-blue-500 underline ml-2">
                      Retry
                    </button>
                  </div>
                ) : templates.length > 0 ? (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a template...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.name}>
                        {template.name} ({template.status})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm text-gray-500 py-2">
                    {isTokenSaved ? 'No templates found. Create templates in Meta Business Suite.' : 'Save your access token to load templates'}
                  </div>
                )}
              </div>

              {/* Template Preview */}
              {selectedTemplate && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Template Preview</h4>
                  {(() => {
                    const template = templates.find(t => t.name === selectedTemplate);
                    if (!template) return null;
                    
                    return (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-700">
                          {template.components.map((comp, idx) => (
                            <div key={idx} className="mb-1">
                              {comp.type === 'HEADER' && comp.text && (
                                <div className="font-semibold">{comp.text}</div>
                              )}
                              {comp.type === 'BODY' && comp.text && (
                                <div>{comp.text}</div>
                              )}
                              {comp.type === 'FOOTER' && comp.text && (
                                <div className="text-xs text-gray-500">{comp.text}</div>
                              )}
                            </div>
                          ))}
                        </div>
                        
                        {/* Buttons */}
                        {template.buttons.length > 0 && (
                          <div className="border-t pt-2 mt-2">
                            <div className="text-xs font-medium text-gray-600 mb-1">Quick Reply Buttons:</div>
                            <div className="flex flex-wrap gap-2">
                              {template.buttons.map((btn, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                                >
                                  {btn.text}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-green-600 mt-2">
                              ✓ A condition node will be added with these options
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Custom Message (fallback) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Custom Message (if no template)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hi {{name}}, thank you for your interest..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Variables: {'{{name}}'}, {'{{phone}}'}, {'{{budget}}'}, {'{{location}}'}
                </p>
              </div>
            </div>
          )}

          {/* Email Config */}
          {nodeType === 'email' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Welcome to JK Construction!"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Dear {{name}},..."
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Delay Config */}
          {(nodeType === 'delay' || nodeType === 'wait') && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wait Duration</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    min={1}
                    className="w-24"
                  />
                  <select
                    value={durationUnit}
                    onChange={(e) => setDurationUnit(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="seconds">Seconds</option>
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* AI Call Config */}
          {nodeType === 'aiCall' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Call Script/Instructions</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Greet the lead, introduce JK Construction, ask about their property requirements..."
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Condition Config */}
          {(nodeType === 'condition' || nodeType === 'conditionTimeout') && (
            <div className="space-y-4">
              {/* Condition Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Check This Field</label>
                <select
                  value={conditionField}
                  onChange={(e) => {
                    setConditionField(e.target.value);
                    setConditionValue(''); // Reset value when field changes
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="status">Lead Status</option>
                  <option value="callStatus">Call Status</option>
                  <option value="whatsappStatus">WhatsApp Response</option>
                  <option value="budget">Budget</option>
                  <option value="source">Lead Source</option>
                  <option value="propertyType">Property Type</option>
                  <option value="location">Location</option>
                </select>
              </div>

              {/* Operator */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                <select
                  value={conditionOperator}
                  onChange={(e) => setConditionOperator(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="equals">Is Equal To</option>
                  <option value="notEquals">Is Not Equal To</option>
                  <option value="contains">Contains</option>
                  <option value="greaterThan">Greater Than</option>
                  <option value="lessThan">Less Than</option>
                  <option value="isEmpty">Is Empty</option>
                  <option value="isNotEmpty">Is Not Empty</option>
                </select>
              </div>

              {/* Value */}
              {!['isEmpty', 'isNotEmpty'].includes(conditionOperator) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                  
                  {/* Status Field - Simple select */}
                  {conditionField === 'status' && (
                    <select
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select status...</option>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="interested">Interested</option>
                      <option value="not_interested">Not Interested</option>
                      <option value="follow_up">Follow Up Required</option>
                      <option value="qualified">Qualified</option>
                      <option value="converted">Converted</option>
                      <option value="lost">Lost</option>
                    </select>
                  )}

                  {/* Call Status */}
                  {conditionField === 'callStatus' && (
                    <select
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select call status...</option>
                      <option value="not_called">Not Called Yet</option>
                      <option value="answered">Answered</option>
                      <option value="not_answered">Not Answered</option>
                      <option value="busy">Busy</option>
                      <option value="voicemail">Voicemail</option>
                    </select>
                  )}

                  {/* WhatsApp Status */}
                  {conditionField === 'whatsappStatus' && (
                    <select
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select WhatsApp status...</option>
                      <option value="not_sent">Not Sent</option>
                      <option value="sent">Sent</option>
                      <option value="delivered">Delivered</option>
                      <option value="replied">Replied</option>
                      <option value="not_responding">Not Responding</option>
                    </select>
                  )}

                  {/* Budget - Number Input */}
                  {conditionField === 'budget' && (
                    <div className="flex gap-2 items-center">
                      <span className="text-gray-500">₹</span>
                      <Input
                        type="number"
                        value={conditionValue}
                        onChange={(e) => setConditionValue(e.target.value)}
                        placeholder="e.g., 5000000"
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-500">Lakhs</span>
                    </div>
                  )}

                  {/* Text fields */}
                  {['source', 'propertyType', 'location'].includes(conditionField) && (
                    <Input
                      type="text"
                      value={conditionValue}
                      onChange={(e) => setConditionValue(e.target.value)}
                      placeholder={`Enter ${conditionField}...`}
                    />
                  )}
                </div>
              )}

              {/* Preview */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-yellow-800 uppercase mb-2">Condition Preview</h4>
                <p className="text-sm text-yellow-900">
                  If <span className="font-semibold">{conditionField}</span>{' '}
                  <span className="font-medium">{conditionOperator.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>{' '}
                  {!['isEmpty', 'isNotEmpty'].includes(conditionOperator) && (
                    <span className="font-semibold">"{conditionValue || '...'}"</span>
                  )}
                </p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="text-green-600">✓ Yes → continue to next action</span>
                  <span className="text-red-600">✗ No → skip or alternate path</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t bg-gray-50">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSaveConfig}>Save Configuration</Button>
        </div>
      </div>
    </div>
  );
}
