import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MessageSquare, Bot, PhoneCall, Mail, Zap, Settings } from 'lucide-react';

interface ActionNodeData {
  label: string;
  type: string;
  color: string;
  config?: {
    template?: string;
    templateId?: string;
    buttons?: Array<{ text: string; payload?: string }>;
    maxDuration?: number;
    priority?: string;
    message?: string;
    subject?: string;
    body?: string;
    script?: string;
    duration?: number;
    unit?: string;
  };
}

const iconMap: Record<string, React.ElementType> = {
  whatsapp: MessageSquare,
  aiCall: Bot,
  humanCall: PhoneCall,
  email: Mail,
};

const descriptionMap: Record<string, string> = {
  whatsapp: 'Send WhatsApp message to lead',
  aiCall: 'Initiate AI-powered phone call',
  humanCall: 'Assign call to human agent',
  email: 'Send email to lead',
};

function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const Icon = iconMap[nodeData.type] || Zap;
  const color = nodeData.color || 'bg-blue-500';
  const description = descriptionMap[nodeData.type] || 'Execute action';
  const hasConfig = nodeData.config && (
    nodeData.config.template || 
    nodeData.config.message || 
    nodeData.config.script ||
    nodeData.config.subject
  );

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white min-w-[180px] transition-all ${
        selected ? 'border-blue-500 shadow-lg' : 'border-gray-200 shadow-sm'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-gray-400 border-2 border-white"
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Action</div>
          <div className="text-sm font-medium text-gray-800">{nodeData.label}</div>
        </div>
      </div>

      {/* Description */}
      <div className="text-xs text-gray-500 pl-10">
        {description}
      </div>

      {/* Config Preview */}
      {nodeData.config && (
        <div className="mt-2 pl-10 space-y-1">
          {nodeData.type === 'whatsapp' && nodeData.config.template && (
            <>
              <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                📄 {nodeData.config.template}
              </div>
              {nodeData.config.buttons && nodeData.config.buttons.length > 0 && (
                <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  {nodeData.config.buttons.length} button{nodeData.config.buttons.length > 1 ? 's' : ''}
                </div>
              )}
            </>
          )}
          {nodeData.type === 'whatsapp' && !nodeData.config.template && nodeData.config.message && (
            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded truncate max-w-[140px]">
              💬 {nodeData.config.message.substring(0, 20)}...
            </div>
          )}
          {nodeData.type === 'aiCall' && (
            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
              Max: {nodeData.config.maxDuration || 300}s
            </div>
          )}
          {nodeData.type === 'humanCall' && (
            <div className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
              Priority: {nodeData.config.priority || 'normal'}
            </div>
          )}
          {nodeData.type === 'email' && nodeData.config.subject && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded truncate max-w-[140px]">
              📧 {nodeData.config.subject.substring(0, 20)}...
            </div>
          )}
        </div>
      )}

      {/* Configure hint */}
      {!hasConfig && (
        <div className="mt-2 pl-10">
          <div className="text-[10px] text-gray-400 flex items-center gap-1">
            <Settings className="h-3 w-3" />
            Double-click to configure
          </div>
        </div>
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-blue-500 border-2 border-white"
      />
    </div>
  );
}

export default memo(ActionNode);
