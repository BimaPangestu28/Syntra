'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import {
  Bell,
  Scale,
  RefreshCw,
  RotateCcw,
  Terminal,
  Sparkles,
  AlertCircle,
  Clock,
  GitBranch,
  Server,
  Activity,
} from 'lucide-react';

export interface WorkflowNodeData {
  label: string;
  type: 'trigger' | 'action' | 'condition';
  actionType?: string;
  triggerType?: string;
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

interface WorkflowNodeProps {
  data: WorkflowNodeData;
  selected?: boolean;
}

const triggerIcons: Record<string, typeof AlertCircle> = {
  error_spike: AlertCircle,
  deployment_failed: GitBranch,
  high_latency: Clock,
  cpu_threshold: Server,
  memory_threshold: Activity,
  schedule: Clock,
};

const actionIcons: Record<string, typeof Bell> = {
  notify: Bell,
  scale: Scale,
  restart: RefreshCw,
  rollback: RotateCcw,
  run_command: Terminal,
  ai_analyze: Sparkles,
};

const nodeColors = {
  trigger: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
  action: 'border-green-500 bg-green-50 dark:bg-green-900/20',
  condition: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
};

const headerColors = {
  trigger: 'bg-blue-500 text-white',
  action: 'bg-green-500 text-white',
  condition: 'bg-yellow-500 text-white',
};

export const WorkflowNode = memo(({ data, selected }: WorkflowNodeProps) => {
  const Icon = data.type === 'trigger'
    ? triggerIcons[data.triggerType || ''] || AlertCircle
    : data.type === 'action'
    ? actionIcons[data.actionType || ''] || Bell
    : Clock;

  return (
    <div
      className={cn(
        'min-w-[180px] rounded-lg border-2 shadow-sm',
        nodeColors[data.type],
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      {/* Header */}
      <div className={cn('px-3 py-2 rounded-t-md text-xs font-medium uppercase tracking-wide', headerColors[data.type])}>
        {data.type}
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{data.label}</span>
        </div>
        {data.config && Object.keys(data.config).length > 0 && (
          <div className="mt-2 text-xs text-muted-foreground">
            {Object.entries(data.config).slice(0, 2).map(([key, value]) => (
              <div key={key} className="truncate">
                {key}: {String(value)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Handles */}
      {data.type !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
      />
    </div>
  );
});

WorkflowNode.displayName = 'WorkflowNode';
