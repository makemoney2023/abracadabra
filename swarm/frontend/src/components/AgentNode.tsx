import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import {
  ChevronDown,
  ChevronUp,
  FileEdit,
  ListCollapse,
  Megaphone,
  PenLine,
  ScanSearch,
  Search,
  Wrench,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AGENT_META, type AgentType, type McpServerConfig, type NodeStatus } from '@/lib/agents';
import { cn } from '@/lib/utils';

const ICONS = {
  Search,
  PenLine,
  FileEdit,
  Megaphone,
  ScanSearch,
  ListCollapse,
} as const;

export interface AgentNodeData {
  agentType: AgentType;
  name: string;
  instructions: string;
  status: NodeStatus;
  output: string;
  /** Workflow-level server IDs enabled for this node. Undefined = all workflow servers. */
  mcpServerIds?: string[];
  /** Servers attached directly to this node. */
  mcpServers?: McpServerConfig[];
  /** Tools called during the last run, as "server/tool". */
  toolsUsed: string[];
}

const STATUS_VARIANT: Record<NodeStatus, 'idle' | 'running' | 'success' | 'error'> = {
  idle: 'idle',
  running: 'running',
  done: 'success',
  error: 'error',
};

function AgentNodeInner({ data, selected }: NodeProps<AgentNodeData>) {
  const [expanded, setExpanded] = useState(false);

  const meta = AGENT_META[data.agentType] ?? AGENT_META.researcher;
  const Icon = ICONS[meta.icon as keyof typeof ICONS] ?? Search;

  return (
    <Card
      className={cn(
        'w-60 overflow-hidden border-border',
        selected && 'ring-2 ring-ring',
        data.status === 'running' && 'ring-2 ring-ring',
        data.status === 'done' && 'border-[hsl(var(--phosphor))]',
        data.status === 'error' && 'border-primary',
      )}
    >
      <Handle type="target" position={Position.Left} />
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-ring">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold leading-none">{data.name}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">{meta.name}</span>
            {(data.toolsUsed?.length ?? 0) > 0 && (
              <Badge
                variant="secondary"
                className="h-4 gap-0.5 px-1 text-[10px]"
                title={'MCP tools used:\n' + (data.toolsUsed ?? []).join('\n')}
              >
                <Wrench className="h-2.5 w-2.5" />
                {(data.toolsUsed ?? []).length}
              </Badge>
            )}
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[data.status]} className="shrink-0 capitalize">
          {data.status === 'running' ? (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              live
            </span>
          ) : (
            data.status
          )}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-3">
        <p className="text-xs leading-relaxed text-muted-foreground">{data.instructions}</p>
        {data.output && (
          <div className="rounded-md border bg-muted/40">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <span>Output · {data.output.length} chars</span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {expanded && (
              <div className="max-h-48 overflow-auto whitespace-pre-wrap px-2.5 pb-2.5 text-xs leading-relaxed">
                {data.output}
              </div>
            )}
          </div>
        )}
      </CardContent>
      <Handle type="source" position={Position.Right} />
    </Card>
  );
}

export const AgentNode = memo(AgentNodeInner);
