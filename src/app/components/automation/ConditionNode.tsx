import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch, Clock, MessageSquare } from 'lucide-react';

interface ConditionNodeData {
  label: string;
  type: string;
  color: string;
  config?: {
    field?: string;
    operator?: string;
    value?: string;
    type?: string;
    options?: string[];
    timeout?: {
      duration?: number;
      unit?: string;
    };
  };
}

function ConditionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const isConditionTimeout = nodeData.type === 'conditionTimeout';
  const isTemplateResponse = nodeData.type === 'templateResponse' || nodeData.config?.type === 'templateResponse';
  const Icon = isTemplateResponse ? MessageSquare : (isConditionTimeout ? Clock : GitBranch);
  const color = nodeData.color || 'bg-yellow-500';
  
  // Template response options (buttons from WhatsApp template)
  const templateOptions = nodeData.config?.options || [];
  const hasTemplateOptions = isTemplateResponse && templateOptions.length > 0;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white min-w-[200px] transition-all ${
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
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase">
            {isTemplateResponse ? 'Response Branch' : 'Condition'}
          </div>
          <div className="text-sm font-medium text-gray-800">{nodeData.label}</div>
        </div>
      </div>

      {/* Condition Preview - Template Response */}
      {hasTemplateOptions && (
        <div className="mt-2 pl-10 space-y-1">
          <div className="text-xs text-gray-500 mb-1">Customer response:</div>
          {templateOptions.map((option, index) => (
            <div 
              key={index}
              className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded flex items-center gap-1"
            >
              <span className="font-medium">{index + 1}.</span>
              <span>{option}</span>
            </div>
          ))}
        </div>
      )}

      {/* Condition Preview - Standard */}
      {!hasTemplateOptions && (
        <div className="mt-2 pl-10 space-y-1">
          {nodeData.config && (
            <>
              <div className="text-xs text-yellow-700 bg-yellow-50 px-2 py-1 rounded flex items-center gap-1">
                <span className="font-medium">If:</span>
                <span>{nodeData.config.field || 'budget'}</span>
                <span>{nodeData.config.operator || '>'}</span>
                <span>{nodeData.config.value || '...'}</span>
              </div>
              {isConditionTimeout && nodeData.config.timeout && (
                <div className="text-xs text-indigo-700 bg-indigo-50 px-2 py-1 rounded flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Timeout: {nodeData.config.timeout.duration || 24} {nodeData.config.timeout.unit || 'hours'}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Output Handles for Template Response - Dynamic based on options */}
      {hasTemplateOptions && (
        <>
          <div className="flex justify-between mt-3 px-1">
            {templateOptions.map((option, index) => (
              <div 
                key={index}
                className="text-[9px] font-semibold text-blue-600 text-center flex-1"
                style={{ maxWidth: `${100 / templateOptions.length}%` }}
              >
                {option.length > 8 ? option.substring(0, 8) + '...' : option}
              </div>
            ))}
          </div>

          {/* Dynamic output handles for each option */}
          {templateOptions.map((option, index) => {
            const position = ((index + 1) / (templateOptions.length + 1)) * 100;
            return (
              <Handle
                key={`option-${index}`}
                type="source"
                position={Position.Bottom}
                id={`option-${index}`}
                className="w-3 h-3 !bg-blue-500 border-2 border-white"
                style={{ left: `${position}%` }}
              />
            );
          })}
        </>
      )}

      {/* Standard Output Handles - Yes/No branches */}
      {!hasTemplateOptions && (
        <>
          <div className="flex justify-between mt-3 px-2">
            <div className="text-[10px] font-semibold text-green-600">Yes ✓</div>
            <div className="text-[10px] font-semibold text-red-600">No ✗</div>
          </div>

          {/* Yes Output Handle (Left) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="yes"
            className="w-3 h-3 !bg-green-500 border-2 border-white"
            style={{ left: '25%' }}
          />

          {/* No Output Handle (Right) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="no"
            className="w-3 h-3 !bg-red-500 border-2 border-white"
            style={{ left: '75%' }}
          />
        </>
      )}
    </div>
  );
}

export default memo(ConditionNode);
