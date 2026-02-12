import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Play, User, Calendar } from 'lucide-react';

interface TriggerNodeData {
  label: string;
  type: string;
  color: string;
  config?: Record<string, unknown>;
}

const iconMap: Record<string, React.ElementType> = {
  newLead: User,
  leadUpdated: User,
  siteVisitScheduled: Calendar,
  appointmentScheduled: Calendar,
};

function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const Icon = iconMap[nodeData.type] || Play;
  const color = nodeData.color || 'bg-green-500';

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white min-w-[180px] transition-all ${
        selected ? 'border-blue-500 shadow-lg' : 'border-gray-200 shadow-sm'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase">Trigger</div>
          <div className="text-sm font-medium text-gray-800">{nodeData.label}</div>
        </div>
      </div>

      {/* Description */}
      <div className="text-xs text-gray-500 pl-10">
        {nodeData.type === 'newLead' && 'When a new lead is created'}
        {nodeData.type === 'leadUpdated' && 'When lead details are updated'}
        {(nodeData.type === 'siteVisitScheduled' || nodeData.type === 'appointmentScheduled') && 'When an appointment is booked'}
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-green-500 border-2 border-white"
      />
    </div>
  );
}

export default memo(TriggerNode);
