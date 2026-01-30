import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Timer } from 'lucide-react';

interface DelayNodeData {
  label: string;
  type: string;
  color: string;
  config?: {
    duration?: number;
    unit?: string;
  };
}

function DelayNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as DelayNodeData;
  const color = nodeData.color || 'bg-gray-500';
  const duration = nodeData.config?.duration || 1;
  const unit = nodeData.config?.unit || 'hours';

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white min-w-[160px] transition-all ${
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
          <Timer className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Delay</div>
          <div className="text-sm font-medium text-gray-800">{nodeData.label}</div>
        </div>
      </div>

      {/* Delay Value */}
      <div className="mt-2 pl-10">
        <div className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded flex items-center gap-1">
          <Timer className="h-3 w-3" />
          <span className="font-medium">{duration}</span>
          <span>{unit}</span>
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-gray-500 border-2 border-white"
      />
    </div>
  );
}

export default memo(DelayNode);
