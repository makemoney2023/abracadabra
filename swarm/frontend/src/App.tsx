import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Bot,
  Eraser,
  FileEdit,
  Info,
  LayoutTemplate,
  ListCollapse,
  Megaphone,
  Package,
  PenLine,
  Play,
  Plug,
  Plus,
  Save,
  ScanSearch,
  Search,
  Trash2,
} from 'lucide-react';

import { AgentNode, type AgentNodeData } from '@/components/AgentNode';
import { AboutDialog } from '@/components/AboutDialog';
import { McpDialog } from '@/components/McpDialog';
import { ArtifactPanel } from '@/components/ArtifactPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Toaster, toast } from '@/components/ui/sonner';
import { Textarea } from '@/components/ui/textarea';
import { AGENT_META, PRESET_GROUPS, TEMPLATES, type AgentPreset, type AgentType, type Artifact, type McpServerConfig, type TemplateMeta } from '@/lib/agents';
import { bridgeEdge, chainOffset } from '@/lib/chain.mjs';
import { executionIdFromSearch } from '@/lib/execution-link.mjs';
import { flowNodeToPayload, templateNodeToFlowData } from '@/lib/workflow-payload.mjs';

const nodeTypes = { agent: AgentNode };

type FlowNode = Node<AgentNodeData>;

interface LoadedWorkflowNode {
  id: string;
  type: AgentType;
  name: string;
  instructions: string;
  position: { x: number; y: number };
  mcpServerIds?: string[];
  mcpServers?: McpServerConfig[];
}

interface WSMessage {
  type: 'node_start' | 'node_output' | 'node_done' | 'node_error' | 'workflow_complete' | 'workflow_error' | 'node_tool';
  executionId: string;
  nodeId?: string;
  output?: string;
  error?: string;
  timestamp: number;
  phase?: 'call' | 'result';
  server?: string;
  tool?: string;
  summary?: string;
  nodeName?: string;
}

type NodeListSetter = Dispatch<SetStateAction<FlowNode[]>>;
type ArtifactSetter = Dispatch<SetStateAction<Artifact[]>>;
type FlagSetter = Dispatch<SetStateAction<boolean>>;

function resultStatus(status: string | undefined): AgentNodeData['status'] {
  if (status === 'done' || status === 'error' || status === 'running') return status;
  return 'idle';
}

function toolsUsedLabels(tools: { server?: string; tool?: string }[] | undefined): string[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => (tool?.server && tool.tool ? [`${tool.server}/${tool.tool}`] : []));
}

function swarmArtifactId(nodeId: string, output: string, timestamp: number | undefined): string {
  return typeof timestamp === 'number' ? `${nodeId}-${timestamp}` : `${nodeId}-${output.length}`;
}

function applySwarmMessage(
  msg: WSMessage,
  eid: string,
  nodesRef: { current: FlowNode[] },
  setNodes: NodeListSetter,
  setArtifacts: ArtifactSetter,
  setIsExecuting: FlagSetter,
  close: () => void,
) {
  if (msg.type === 'node_tool' && msg.nodeId && msg.server && msg.tool) {
    const label = `${msg.server}/${msg.tool}`;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === msg.nodeId && !(n.data.toolsUsed ?? []).includes(label)
          ? { ...n, data: { ...n.data, toolsUsed: [...(n.data.toolsUsed ?? []), label] } }
          : n,
      ),
    );
  }
  if (msg.nodeId && msg.type !== 'node_tool') {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== msg.nodeId) return n;
        const status = msg.type === 'node_done' ? 'done' : msg.type === 'node_error' ? 'error' : 'running';
        return {
          ...n,
          data: {
            ...n.data,
            status,
            output: msg.output !== undefined ? msg.output : n.data.output,
          },
        };
      }),
    );

    if (msg.type === 'node_done' && msg.output) {
      const nodeId = msg.nodeId;
      const output = msg.output;
      const nodeName = msg.nodeName || nodesRef.current.find((node) => node.id === nodeId)?.data.name;
      if (nodeName) {
        const artifactId = swarmArtifactId(nodeId, output, msg.timestamp);
        setArtifacts((prev) =>
          prev.some((artifact) => artifact.id === artifactId)
            ? prev
            : [
                ...prev,
                {
                  id: artifactId,
                  executionId: eid,
                  nodeId,
                  nodeName,
                  content: output,
                  timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
                },
              ],
        );
      }
    }
  }
  if (msg.type === 'workflow_complete') {
    setIsExecuting(false);
    toast.success('Swarm finished');
    close();
    fetch('/api/artifacts?executionId=' + eid)
      .then((r) => r.json())
      .then((arts) => setArtifacts(arts))
      .catch(() => {});
  } else if (msg.type === 'workflow_error') {
    setIsExecuting(false);
    toast.error(msg.error || 'Workflow failed');
    close();
  }
}

function openSwarmSocket(
  eid: string,
  wsRef: { current: WebSocket | null },
  nodesRef: { current: FlowNode[] },
  setNodes: NodeListSetter,
  setArtifacts: ArtifactSetter,
  setIsExecuting: FlagSetter,
) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?executionId=${eid}`);
  wsRef.current?.close();
  wsRef.current = ws;
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as WSMessage;
    applySwarmMessage(msg, eid, nodesRef, setNodes, setArtifacts, setIsExecuting, () => ws.close());
  };
  ws.onerror = () => {
    setIsExecuting(false);
    toast.error('Lost connection to the swarm');
  };
}

const ADD_ICONS = {
  Search,
  PenLine,
  FileEdit,
  Megaphone,
  ScanSearch,
  ListCollapse,
} as const;

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentNodeData>([]);
  const nodesRef = useRef<FlowNode[]>(nodes);
  nodesRef.current = nodes;
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [workflowName, setWorkflowName] = useState('My Agent Swarm');
  const [inputText, setInputText] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateList, setTemplateList] = useState<TemplateMeta[]>(TEMPLATES);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [nodeMcpName, setNodeMcpName] = useState('');
  const [nodeMcpUrl, setNodeMcpUrl] = useState('');
  const [nodeMcpTest, setNodeMcpTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({ status: 'idle' });
  const wsRef = useRef<WebSocket | null>(null);
  const nodeIdCounter = useRef(0);

  useEffect(() => {
    if (!templatesOpen) return;
    let cancelled = false;
    fetch('/api/templates')
      .then((res) => res.json())
      .then((rows: { id?: string; name?: string; description?: string }[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const next = rows.flatMap((row) =>
          row.id && row.name ? [{ id: row.id, name: row.name, desc: row.description ?? '' }] : [],
        );
        if (next.length > 0) setTemplateList(next);
      })
      .catch(() => {
        if (!cancelled) setTemplateList(TEMPLATES);
      });
    return () => {
      cancelled = true;
    };
  }, [templatesOpen]);

  useEffect(() => {
    const storedId = executionIdFromSearch(window.location.search);
    if (!storedId) return;
    let cancelled = false;
    let opened: WebSocket | null = null;
    (async () => {
      let executionStatus: string | undefined;
      try {
        const statusResponse = await fetch('/api/status?id=' + encodeURIComponent(storedId));
        const execution = (await statusResponse.json()) as {
          error?: string;
          workflowId?: string;
          input?: string;
          status?: string;
          results?: Record<string, { status?: string; output?: string; toolsUsed?: { server?: string; tool?: string }[] }>;
        };
        if (cancelled) return;
        if (!statusResponse.ok || execution.error || !execution.workflowId) {
          toast.error('This swarm run is not on the worker anymore.');
          return;
        }
        const workflowResponse = await fetch('/api/get?id=' + encodeURIComponent(execution.workflowId));
        const workflow = (await workflowResponse.json()) as {
          error?: string;
          name?: string;
          nodes?: LoadedWorkflowNode[];
          edges?: { id: string; source: string; target: string }[];
          mcpServers?: McpServerConfig[];
        };
        if (cancelled) return;
        if (!workflowResponse.ok || workflow.error || !workflow.nodes) {
          toast.error('This swarm run is not on the worker anymore.');
          return;
        }
        executionStatus = execution.status;
        const placed: FlowNode[] = workflow.nodes.map((node) => {
          const result = execution.results?.[node.id];
          return {
            id: node.id,
            type: 'agent',
            position: node.position,
            data: {
              agentType: node.type,
              name: node.name,
              instructions: node.instructions,
              status: resultStatus(result?.status),
              output: result?.output || '',
              mcpServerIds: node.mcpServerIds,
              mcpServers: node.mcpServers,
              toolsUsed: toolsUsedLabels(result?.toolsUsed),
            },
          };
        });
        for (const node of placed) {
          const match = /^node-(\d+)$/.exec(node.id);
          if (match) {
            const n = Number(match[1]);
            if (n > nodeIdCounter.current) nodeIdCounter.current = n;
          }
        }
        setWorkflowName(workflow.name || 'Swarm');
        setInputText(execution.input || '');
        setExecutionId(storedId);
        nodesRef.current = placed;
        setNodes(placed);
        setEdges(
          (workflow.edges || []).map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            animated: true,
          })),
        );
        if (Array.isArray(workflow.mcpServers)) setMcpServers(workflow.mcpServers);
        setSelectedNodeId(null);
      } catch {
        if (!cancelled) toast.error('This swarm run is not on the worker anymore.');
        return;
      }

      try {
        const artsResponse = await fetch('/api/artifacts?executionId=' + encodeURIComponent(storedId));
        if (!cancelled && artsResponse.ok) {
          const list = await artsResponse.json();
          if (!cancelled && Array.isArray(list) && list.length > 0) {
            setArtifacts(list);
            setShowArtifacts(true);
          }
        }
      } catch {
        // Artifacts are optional. The graph stays, and a live run still opens its socket.
      }
      if (cancelled) return;
      if (executionStatus === 'running') {
        setIsExecuting(true);
        openSwarmSocket(storedId, wsRef, nodesRef, setNodes, setArtifacts, setIsExecuting);
        opened = wsRef.current;
      }
    })();
    return () => {
      cancelled = true;
      if (opened && wsRef.current === opened) opened.close();
    };
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  const addAgentNode = (agentType: AgentType, preset?: Pick<AgentPreset, 'name' | 'instructions'>) => {
    const meta = AGENT_META[agentType];
    const id = `node-${++nodeIdCounter.current}`;
    const newNode: FlowNode = {
      id,
      type: 'agent',
      position: { x: 80 + Math.random() * 380, y: 80 + Math.random() * 280 },
      data: {
        agentType,
        name: preset?.name ?? meta.name,
        instructions: preset?.instructions ?? meta.instructions,
        status: 'idle',
        output: '',
        mcpServerIds: undefined,
        mcpServers: undefined,
        toolsUsed: [],
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  };

  const loadTemplate = async (templateId: string) => {
    try {
      const res = await fetch('/api/template?id=' + templateId);
      const tmpl = await res.json();
      if (!tmpl.nodes) {
        toast.error('Template not found');
        return;
      }
      const newNodes: FlowNode[] = tmpl.nodes.map(
        (n: { id: string; type: AgentType; name: string; instructions: string; mcpServerIds?: string[]; mcpServers?: McpServerConfig[]; mcpToolNames?: readonly string[]; position: { x: number; y: number } }) => ({
          id: `${n.id}-${++nodeIdCounter.current}`,
          type: 'agent',
          position: n.position,
          data: templateNodeToFlowData(n),
        }),
      );
      const idMap: Record<string, string> = {};
      tmpl.nodes.forEach((n: { id: string }, i: number) => {
        idMap[n.id] = newNodes[i].id;
      });
      const newEdges: Edge[] = tmpl.edges.map(
        (e: { id: string; source: string; target: string }) => ({
          id: `${e.id}-${++nodeIdCounter.current}`,
          source: idMap[e.source],
          target: idMap[e.target],
          animated: true,
        }),
      );
      const offset = chainOffset(nodes);
      const placed = newNodes.map((node) => ({
        ...node,
        position: { x: node.position.x + offset, y: node.position.y },
      }));
      const bridge = bridgeEdge(nodes, placed[0]?.id);
      const link: Edge | null = bridge
        ? { id: `bridge-${placed[0].id}`, source: bridge.source, target: bridge.target, animated: true }
        : null;
      setNodes((current) => (offset === 0 ? placed : [...current, ...placed]));
      setEdges((current) => {
        const base = offset === 0 ? newEdges : [...current, ...newEdges];
        return link ? [...base, link] : base;
      });
      setSelectedNodeId(null);
      if (offset === 0) setWorkflowName(tmpl.name);
      setTemplatesOpen(false);
      toast.success(offset === 0 ? `Loaded "${tmpl.name}"` : `Chained "${tmpl.name}"`);
    } catch {
      toast.error('Failed to load template');
    }
  };

  const updateNodeData = (nodeId: string, updates: Partial<AgentNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n)),
    );
  };

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const buildWorkflowPayload = () => ({
    id: 'wf-' + Date.now(),
    name: workflowName,
    nodes: nodes.map((n) => flowNodeToPayload(n)),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    createdAt: Date.now(),
    mcpServers,
  });

  const saveWorkflow = async () => {
    if (nodes.length === 0) {
      toast.error('Add some agent nodes first');
      return;
    }
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWorkflowPayload()),
      });
      if (!res.ok) throw new Error();
      toast.success('Workflow saved');
    } catch {
      toast.error('Failed to save workflow');
    }
  };

  const executeWorkflow = async () => {
    if (nodes.length === 0) {
      toast.error('Add some agent nodes first');
      return;
    }
    if (!inputText.trim()) {
      toast.error('Enter some input for your swarm');
      return;
    }

    setIsExecuting(true);
    setArtifacts([]);
    setShowArtifacts(true);
    setNodes((nds) =>
      nds.map((n) => ({ ...n, data: { ...n.data, status: 'idle' as const, output: '', toolsUsed: [] } })),
    );

    try {
      const workflow = buildWorkflowPayload();
      const saveRes = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
      });
      if (!saveRes.ok) throw new Error('save failed');

      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId: workflow.id, input: inputText }),
      });
      if (!res.ok) throw new Error('execute failed');
      const { executionId: eid } = await res.json();
      setExecutionId(eid);
      openSwarmSocket(eid, wsRef, nodesRef, setNodes, setArtifacts, setIsExecuting);
    } catch {
      setIsExecuting(false);
      toast.error('Failed to start execution');
    }
  };

  const clearCanvas = () => {
    wsRef.current?.close();
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setExecutionId(null);
    setArtifacts([]);
    setShowArtifacts(false);
  };

  const runningCount = nodes.filter((n) => n.data.status === 'running').length;

  return (
    <div className="flex h-full flex-col">
      <header className="z-10 flex items-center gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="font-heading text-[15px] font-bold tracking-tight">Abracadabra Swarm</div>
            <div className="text-[11px] text-muted-foreground">Build multi-agent workflows visually</div>
          </div>
        </div>
        <Input
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          className="w-48"
        />
        {runningCount > 0 && (
          <Badge variant="running" className="gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {runningCount} running
          </Badge>
        )}
        <div className="flex-1" />
        <Button variant="ghost" size="icon" title="How it's built" onClick={() => setAboutOpen(true)}>
          <Info />
        </Button>
        <Button variant="ghost" size="icon" title="MCP servers" className="relative" onClick={() => setMcpOpen(true)}>
          <Plug />
          {mcpServers.length > 0 && (
            <Badge variant="secondary" className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]">
              {mcpServers.length}
            </Badge>
          )}
        </Button>
        <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary">
              <LayoutTemplate />
              Templates
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Workflow templates</DialogTitle>
              <DialogDescription>
                Add a pack. A second pack chains onto the right and takes the previous output.
              </DialogDescription>
            </DialogHeader>
            <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
              {templateList.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => loadTemplate(tmpl.id)}
                  className="rounded-lg border bg-muted/40 p-3.5 text-left transition-colors hover:border-primary/60 hover:bg-muted"
                >
                  <div className="text-sm font-semibold">{tmpl.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{tmpl.desc}</div>
                  {tmpl.mcpHint && (
                    <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Plug className="h-3 w-3 shrink-0" />
                      {tmpl.mcpHint}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" onClick={() => setShowArtifacts((v) => !v)}>
          <Package />
          Artifacts
          {artifacts.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5">
              {artifacts.length}
            </Badge>
          )}
        </Button>
        <Button variant="ghost" onClick={clearCanvas}>
          <Eraser />
          Clear
        </Button>
        <Button variant="outline" onClick={saveWorkflow}>
          <Save />
          Save
        </Button>
        <Button variant="success" onClick={executeWorkflow} disabled={isExecuting}>
          <Play />
          {isExecuting ? 'Running…' : 'Execute Swarm'}
        </Button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r bg-card p-4">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Swarm input
            </h3>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter the task or topic for your agent swarm…"
              className="h-24 resize-y"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Add agents
            </h3>
            <div className="flex flex-col gap-1.5">
              {(Object.keys(AGENT_META) as AgentType[]).map((type) => {
                const meta = AGENT_META[type];
                const Icon = ADD_ICONS[meta.icon as keyof typeof ADD_ICONS];
                return (
                  <Button
                    key={type}
                    variant="ghost"
                    className="justify-start"
                    onClick={() => addAgentNode(type)}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-border text-ring">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {meta.name}
                    <Plus className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Specialists
            </h3>
            <p className="-mt-1 text-[11px] leading-snug text-muted-foreground">
              Pre-configured roles from the hackathon templates.
            </p>
            {PRESET_GROUPS.map((group) => (
              <div key={group.templateId} className="space-y-1 pt-1">
                <div className="px-1 text-[11px] font-semibold text-muted-foreground">
                  {group.templateName}
                </div>
                <div className="flex flex-col gap-1">
                  {group.presets.map((preset) => {
                    const pMeta = AGENT_META[preset.agentType];
                    const PIcon = ADD_ICONS[pMeta.icon as keyof typeof ADD_ICONS];
                    return (
                      <Button
                        key={preset.id}
                        variant="ghost"
                        size="sm"
                        className="justify-start font-normal"
                        title={preset.instructions}
                        onClick={() =>
                          addAgentNode(preset.agentType, {
                            name: preset.name,
                            instructions: preset.instructions,
                          })
                        }
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded border border-border text-ring">
                          <PIcon className="h-3 w-3" />
                        </span>
                        {preset.name}
                        <Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {selectedNode && (
            <>
              <Separator />
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected agent
                </h3>
                <div className="text-sm font-medium">{selectedNode.data.name}</div>
                <Textarea
                  value={selectedNode.data.instructions}
                  onChange={(e) => updateNodeData(selectedNode.id, { instructions: e.target.value })}
                  className="h-20 resize-y text-xs"
                />
                {mcpServers.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Plug className="h-3 w-3" />
                      Workflow servers
                    </div>
                    {mcpServers.map((s) => {
                      const enabled =
                        !selectedNode.data.mcpServerIds || selectedNode.data.mcpServerIds.includes(s.id);
                      return (
                        <label key={s.id} className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={enabled}
                            className="h-3.5 w-3.5 accent-primary"
                            onChange={() => {
                              const current = selectedNode.data.mcpServerIds;
                              if (!current) {
                                // All enabled → narrow to all-but-this
                                updateNodeData(selectedNode.id, {
                                  mcpServerIds: mcpServers.filter((x) => x.id !== s.id).map((x) => x.id),
                                });
                              } else if (current.includes(s.id)) {
                                updateNodeData(selectedNode.id, {
                                  mcpServerIds: current.filter((id) => id !== s.id),
                                });
                              } else {
                                updateNodeData(selectedNode.id, {
                                  mcpServerIds: [...current, s.id],
                                });
                              }
                            }}
                          />
                          <span className="truncate">{s.name}</span>
                        </label>
                      );
                    })}
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      Uncheck all to run this agent with no tools.
                    </p>
                  </div>
                )}
                <div className="space-y-1.5 rounded-lg border bg-muted/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                    <Plug className="h-3 w-3" />
                    This node's servers
                  </div>
                  <p className="-mt-0.5 text-[10px] leading-snug text-muted-foreground">
                    Independent of workflow servers — only this agent can call them.
                  </p>
                  {(selectedNode.data.mcpServers ?? []).map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{s.name}</div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{s.url}</div>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        title="Remove server from this node"
                        onClick={() =>
                          updateNodeData(selectedNode.id, {
                            mcpServers: (selectedNode.data.mcpServers ?? []).filter((x) => x.id !== s.id),
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Input
                    value={nodeMcpName}
                    onChange={(e) => setNodeMcpName(e.target.value)}
                    placeholder="Name (e.g. node-search)"
                    className="h-7 text-xs"
                  />
                  <Input
                    value={nodeMcpUrl}
                    onChange={(e) => setNodeMcpUrl(e.target.value)}
                    placeholder="https://…/mcp"
                    className="h-7 font-mono text-[11px]"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 flex-1 text-[11px]"
                      disabled={!nodeMcpUrl.trim() || nodeMcpTest.status === 'testing'}
                      onClick={async () => {
                        setNodeMcpTest({ status: 'testing' });
                        try {
                          const res = await fetch('/api/mcp/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: nodeMcpUrl.trim() }),
                          });
                          const data = await res.json();
                          setNodeMcpTest(
                            data.ok
                              ? { status: 'ok', message: `${(data.tools ?? []).length} tools found` }
                              : { status: 'error', message: data.error || 'Connection failed.' },
                          );
                        } catch {
                          setNodeMcpTest({ status: 'error', message: 'Could not reach the test endpoint.' });
                        }
                      }}
                    >
                      Test
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 flex-1 text-[11px]"
                      disabled={!nodeMcpUrl.trim()}
                      onClick={() => {
                        const trimmedUrl = nodeMcpUrl.trim();
                        let label = nodeMcpName.trim();
                        if (!label) {
                          try {
                            label = new URL(trimmedUrl).hostname;
                          } catch {
                            label = 'node-mcp';
                          }
                        }
                        updateNodeData(selectedNode.id, {
                          mcpServers: [
                            ...(selectedNode.data.mcpServers ?? []),
                            { id: `node-${selectedNode.id}-${Date.now()}`, name: label, url: trimmedUrl },
                          ],
                        });
                        setNodeMcpName('');
                        setNodeMcpUrl('');
                        setNodeMcpTest({ status: 'idle' });
                      }}
                    >
                      <Plus className="h-3 w-3" />
                      Add to node
                    </Button>
                  </div>
                  {nodeMcpTest.status === 'ok' && (
                    <p className="text-[11px] text-emerald-600">Connected — {nodeMcpTest.message}.</p>
                  )}
                  {nodeMcpTest.status === 'error' && (
                    <p className="text-[11px] leading-snug text-destructive">{nodeMcpTest.message}</p>
                  )}
                </div>
                <Button variant="destructive" size="sm" className="w-full" onClick={deleteSelected}>
                  <Trash2 />
                  Delete agent
                </Button>
              </div>
            </>
          )}

          <div className="mt-auto">
            <Card className="bg-muted/40">
              <CardHeader className="p-3 pb-1.5">
                <CardTitle className="text-xs">How it works</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 text-[11px] leading-relaxed text-muted-foreground">
                Add agents or load a template, connect them by dragging between handles, enter input
                and execute. Watch your swarm work live.
              </CardContent>
            </Card>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
            className="bg-background"
          >
            <Background color="hsl(var(--border))" gap={24} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const t = (n.data as AgentNodeData | undefined)?.agentType;
                return (t && AGENT_META[t]?.color) || '#64748b';
              }}
              className="!bg-card"
            />
          </ReactFlow>
        </div>

        {showArtifacts && (
          <ArtifactPanel
            artifacts={artifacts}
            executionId={executionId}
            onClose={() => setShowArtifacts(false)}
          />
        )}
      </div>

      <Toaster position="bottom-right" />
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <McpDialog open={mcpOpen} onOpenChange={setMcpOpen} servers={mcpServers} onChange={setMcpServers} />
    </div>
  );
}
