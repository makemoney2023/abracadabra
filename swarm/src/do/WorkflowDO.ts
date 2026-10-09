import type { Workflow, WorkflowExecution, WSMessage, NodeResult, AgentMemory, MemoryEntry, Artifact, McpServerConfig } from '../types';
import { runAgent } from '../ai/agents';
import { composeNodeInput, loadSkill } from '../ai/skills';
import packTemplates from '../pack-templates.json';
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../types';

const ALL_TEMPLATES: WorkflowTemplate[] = [...WORKFLOW_TEMPLATES, ...(packTemplates as WorkflowTemplate[])];
import { generateReportPdf } from '../pdf/report';
import { McpClient, type McpToolDef } from '../mcp/client';

export class WorkflowDO {
  private state: DurableObjectState;
  private env: any;
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();
  private websockets: Map<string, WebSocket[]> = new Map();
  private memories: Map<string, AgentMemory> = new Map();
  private artifacts: Map<string, Artifact[]> = new Map();
  /** Executions actively driven by this isolate (resume guard). */
  private activeRuns: Set<string> = new Set();

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.list();
      for (const [key, value] of stored) {
        if (key.startsWith('wf:')) {
          this.workflows.set(key.slice(3), value as Workflow);
        } else if (key.startsWith('ex:')) {
          this.executions.set(key.slice(3), value as WorkflowExecution);
        } else if (key.startsWith('mem:')) {
          this.memories.set(key.slice(4), value as AgentMemory);
        } else if (key.startsWith('art:')) {
          this.artifacts.set(key.slice(4), value as Artifact[]);
        }
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Resume executions stranded by isolate eviction (progress is
    // persisted per node, so re-driving is safe and skips finished nodes).
    this.resumeStuck();

    // WebSocket upgrade for live execution
    if (url.pathname === '/ws') {
      return this.handleWebSocket(request);
    }

    // Save workflow
    if (url.pathname === '/save' && request.method === 'POST') {
      const workflow = await request.json() as Workflow;
      if (
        !workflow ||
        typeof workflow.id !== 'string' ||
        !Array.isArray(workflow.nodes) ||
        !Array.isArray(workflow.edges) ||
        workflow.nodes.length === 0 ||
        workflow.nodes.length > 30
      ) {
        return new Response('Invalid workflow', { status: 400 });
      }
      this.workflows.set(workflow.id, workflow);
      await this.state.storage.put(`wf:${workflow.id}`, workflow);
      return Response.json({ success: true });
    }

    // Get workflow
    if (url.pathname === '/get' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const workflow = id ? this.workflows.get(id) : null;
      return Response.json(workflow || { error: 'Not found' });
    }

    // List workflows
    if (url.pathname === '/list' && request.method === 'GET') {
      return Response.json(Array.from(this.workflows.values()));
    }

    // List templates
    if (url.pathname === '/templates' && request.method === 'GET') {
      return Response.json(ALL_TEMPLATES);
    }

    // Get template
    if (url.pathname === '/template' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const template = ALL_TEMPLATES.find((t) => t.id === id);
      return Response.json(template || { error: 'Not found' });
    }

    // Execute workflow
    if (url.pathname === '/execute' && request.method === 'POST') {
      const body = await request.json() as { workflowId: string; input: string };
      if (!body || typeof body.workflowId !== 'string' || typeof body.input !== 'string' || body.input.trim().length === 0 || body.input.length > 8000) {
        return new Response('Invalid execution request', { status: 400 });
      }
      const executionId = crypto.randomUUID();
      const execution: WorkflowExecution = {
        id: executionId,
        workflowId: body.workflowId,
        input: body.input,
        status: 'running',
        results: {},
        startedAt: Date.now(),
      };
      this.executions.set(executionId, execution);
      await this.state.storage.put(`ex:${executionId}`, execution);

      // Start execution asynchronously and keep the Durable Object alive.
      // Progress is persisted per node; resumeStuck() re-drives the run if
      // this isolate is evicted mid-execution.
      this.state.waitUntil(this.executeWorkflow(executionId));

      return Response.json({ executionId });
    }

    // Get execution status
    if (url.pathname === '/status' && request.method === 'GET') {
      const id = url.searchParams.get('id');
      const execution = id ? this.executions.get(id) : null;
      return Response.json(execution || { error: 'Not found' });
    }

    // Get artifacts for an execution
    if (url.pathname === '/artifacts' && request.method === 'GET') {
      const executionId = url.searchParams.get('executionId');
      if (!executionId) {
        return Response.json([]);
      }
      const cached = this.artifacts.get(executionId);
      if (cached) {
        return Response.json(cached);
      }
      try {
        const backup = await this.env.ARTIFACTS.get(`artifacts/${executionId}.json`);
        if (backup) {
          const parsed = JSON.parse(await backup.text());
          const arts = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
          this.artifacts.set(executionId, arts);
          return Response.json(arts);
        }
      } catch {
        // Fall through to empty artifacts below.
      }
      return Response.json([]);
    }

    // Download a finalized PDF report for an execution
    if (url.pathname === '/report' && request.method === 'GET') {
      const executionId = url.searchParams.get('executionId');
      const execution = executionId ? this.executions.get(executionId) : null;
      if (!execution) {
        return new Response('Execution not found', { status: 404 });
      }
      const workflow = this.workflows.get(execution.workflowId);
      if (!workflow) {
        return new Response('Workflow not found', { status: 404 });
      }
      const pdf = await generateReportPdf(execution, workflow);
      try {
        await this.env.ARTIFACTS.put(`reports/${executionId}.pdf`, pdf, {
          httpMetadata: { contentType: 'application/pdf' },
        });
      } catch {
        // R2 backup is best-effort.
      }
      const safeName = (workflow.name || 'swarm').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60);
      return new Response(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${safeName}-report.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Test an MCP server connection (lists its tools)
    if (url.pathname === '/mcp/test' && request.method === 'POST') {
      const body = await request.json() as { url?: string; headers?: Record<string, string> };
      if (!body || typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) {
        return Response.json({ ok: false, error: 'Provide an http(s) MCP server URL.' }, { status: 400 });
      }
      try {
        const client = new McpClient({ id: 'test', name: 'test', url: body.url, headers: body.headers });
        const tools = await client.listTools();
        return Response.json({
          ok: true,
          tools: tools.map((t) => ({ name: t.name, description: t.description })),
        });
      } catch (e: any) {
        return Response.json({ ok: false, error: e?.message || 'Connection failed.' });
      }
    }

    // Get memory for an agent type
    if (url.pathname === '/memory' && request.method === 'GET') {
      const agentType = url.searchParams.get('agentType');
      const mem = agentType ? this.memories.get(agentType) : null;
      return Response.json(mem || { agentType, entries: [] });
    }

    // Clear memory for an agent type
    if (url.pathname === '/memory' && request.method === 'DELETE') {
      const agentType = url.searchParams.get('agentType');
      if (agentType) {
        this.memories.delete(agentType);
        await this.state.storage.delete(`mem:${agentType}`);
      }
      return Response.json({ success: true });
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const executionId = new URL(request.url).searchParams.get('executionId');
    if (!executionId) {
      return new Response('Missing executionId', { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();

    if (!this.websockets.has(executionId)) {
      this.websockets.set(executionId, []);
    }
    this.websockets.get(executionId)!.push(server);

    // Send current state
    const execution = this.executions.get(executionId);
    if (execution) {
      for (const [nodeId, result] of Object.entries(execution.results)) {
        const msg: WSMessage = {
          type: result.status === 'done' ? 'node_done' : result.status === 'error' ? 'node_error' : 'node_output',
          executionId,
          nodeId,
          output: result.output,
          error: result.error,
          timestamp: Date.now(),
        };
        server.send(JSON.stringify(msg));
      }
    }

    server.addEventListener('close', () => {
      const sockets = this.websockets.get(executionId) || [];
      const idx = sockets.indexOf(server);
      if (idx >= 0) sockets.splice(idx, 1);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(executionId: string, message: WSMessage) {
    const sockets = this.websockets.get(executionId) || [];
    const dead: WebSocket[] = [];

    for (const ws of sockets) {
      try {
        ws.send(JSON.stringify(message));
      } catch {
        dead.push(ws);
      }
    }

    for (const ws of dead) {
      const idx = sockets.indexOf(ws);
      if (idx >= 0) sockets.splice(idx, 1);
    }
  }

  private async executeWorkflow(executionId: string) {
    // Single-driver guard: one isolate drives each execution at a time.
    if (this.activeRuns.has(executionId)) return;
    this.activeRuns.add(executionId);
    try {
      await this.driveExecution(executionId);
    } finally {
      this.activeRuns.delete(executionId);
    }
  }

  /** Re-drive executions stranded by isolate eviction. Safe: finished nodes are skipped. */
  private resumeStuck() {
    for (const [id, execution] of this.executions) {
      if (execution.status === 'running' && !this.activeRuns.has(id)) {
        this.state.waitUntil(this.executeWorkflow(id));
      }
    }
  }

  private async saveExecution(execution: WorkflowExecution) {
    this.executions.set(execution.id, execution);
    await this.state.storage.put(`ex:${execution.id}`, execution);
  }

  private async driveExecution(executionId: string) {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') return;

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) {
      execution.status = 'failed';
      execution.finishedAt = Date.now();
      await this.saveExecution(execution);
      this.broadcast(executionId, {
        type: 'workflow_error',
        executionId,
        error: 'Workflow not found',
        timestamp: Date.now(),
      });
      return;
    }

    const input = execution.input;
    const nodeOutputs: Record<string, string> = {};

    try {
      // Build adjacency list
      const adjacency = new Map<string, string[]>();
      const inDegree = new Map<string, number>();

      for (const node of workflow.nodes) {
        adjacency.set(node.id, []);
        inDegree.set(node.id, 0);
      }

      for (const edge of workflow.edges) {
        adjacency.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }

      // Find root nodes (no incoming edges)
      const queue: string[] = [];
      for (const [nodeId, deg] of inDegree) {
        if (deg === 0) queue.push(nodeId);
      }

      // Topological execution with parallel branches
      const completed = new Set<string>();
      const running = new Set<string>();

      // Resume support: finished nodes from a previous isolate keep their
      // results; release their children into the queue. Stale 'running'
      // entries are re-run from scratch below.
      for (const [nodeId, prior] of Object.entries(execution.results)) {
        if (prior.status === 'done') {
          completed.add(nodeId);
          nodeOutputs[nodeId] = prior.output;
        } else if (prior.status === 'error') {
          completed.add(nodeId);
        }
      }
      for (const nodeId of completed) {
        for (const childId of adjacency.get(nodeId) || []) {
          const newDeg = (inDegree.get(childId) || 1) - 1;
          inDegree.set(childId, newDeg);
          if (newDeg === 0) queue.push(childId);
        }
      }

      while (completed.size < workflow.nodes.length) {
        // Start all ready nodes
        const ready = queue.filter((id) => !completed.has(id) && !running.has(id));

        if (ready.length === 0 && running.size === 0) {
          break; // Deadlock or done
        }

        // Execute ready nodes in parallel
        await Promise.all(
          ready.map(async (nodeId) => {
            running.add(nodeId);
            const node = workflow.nodes.find((n) => n.id === nodeId)!;

            // Gather inputs from all parent nodes
            const parentEdges = workflow.edges.filter((e) => e.target === nodeId);
            const parentInputs = parentEdges.map((e) => nodeOutputs[e.source] || '').filter(Boolean);
            const nodeInput = composeNodeInput(input, parentInputs);

            // Retrieve memory for this agent type
            const memory = this.memories.get(node.type);
            const memoryContext = memory && memory.entries.length > 0
              ? `\n\nPrevious context from past runs:\n${memory.entries.slice(-3).map((e) => e.content).join('\n---\n')}`
              : '';

            // Mark as running (persisted so a resume can see it started)
            const startResult: NodeResult = {
              nodeId,
              status: 'running',
              output: '',
              startedAt: Date.now(),
            };
            execution.results[nodeId] = startResult;
            await this.saveExecution(execution);
            this.broadcast(executionId, {
              type: 'node_start',
              executionId,
              nodeId,
              timestamp: Date.now(),
            });

            try {
              let output = '';
              const toolsUsed: { server: string; tool: string }[] = [];

              // Resolve this node's MCP servers (node selection, else all workflow servers).
              const servers = this.resolveNodeServers(workflow, node);
              const mcpTools = await this.collectNodeTools(servers);
              const skill = await loadSkill(this.env.SKILLS, node.instructions);

              const result = await runAgent(
                node.type,
                {
                  input: nodeInput + memoryContext,
                  instructions: node.instructions,
                  name: node.name,
                  skill,
                  mcpTools,
                  executeTool: async (serverId, tool, args) => {
                    const server = servers.find((s) => s.id === serverId);
                    if (!server) throw new Error(`Unknown MCP server: ${serverId}`);
                    return new McpClient(server).callTool(tool, args);
                  },
                  onToken: (token) => {
                    output += token;
                    this.broadcast(executionId, {
                      type: 'node_output',
                      executionId,
                      nodeId,
                      output,
                      timestamp: Date.now(),
                    });
                  },
                  onToolEvent: (e) => {
                    this.broadcast(executionId, {
                      type: 'node_tool',
                      executionId,
                      nodeId,
                      phase: e.phase,
                      server: e.server,
                      tool: e.tool,
                      summary: e.summary,
                      timestamp: Date.now(),
                    });
                  },
                },
                this.env,
              );
              output = result.output;
              toolsUsed.push(...result.toolsUsed);

              const doneResult: NodeResult = {
                nodeId,
                status: 'done',
                output: result.output,
                startedAt: startResult.startedAt,
                finishedAt: Date.now(),
                toolsUsed,
              };
              execution.results[nodeId] = doneResult;
              nodeOutputs[nodeId] = result.output;

              // Store artifact
              const artifact: Artifact = {
                id: crypto.randomUUID(),
                executionId,
                nodeId,
                nodeName: node.name,
                content: result.output,
                timestamp: Date.now(),
              };
              if (!this.artifacts.has(executionId)) {
                this.artifacts.set(executionId, []);
              }
              this.artifacts.get(executionId)!.push(artifact);
              await this.state.storage.put(`art:${executionId}`, this.artifacts.get(executionId));

              // Store memory
              this.addMemory(node.type, result.output, executionId);

              this.broadcast(executionId, {
                type: 'node_done',
                executionId,
                nodeId,
                output: result.output,
                timestamp: Date.now(),
              });
            } catch (error: any) {
              const errorResult: NodeResult = {
                nodeId,
                status: 'error',
                output: '',
                error: error.message || 'Unknown error',
                startedAt: startResult.startedAt,
                finishedAt: Date.now(),
              };
              execution.results[nodeId] = errorResult;

              this.broadcast(executionId, {
                type: 'node_error',
                executionId,
                nodeId,
                error: error.message || 'Unknown error',
                timestamp: Date.now(),
              });
            }

            running.delete(nodeId);
            completed.add(nodeId);

            // Add children to queue
            for (const childId of adjacency.get(nodeId) || []) {
              const newDeg = (inDegree.get(childId) || 1) - 1;
              inDegree.set(childId, newDeg);
              if (newDeg === 0) {
                queue.push(childId);
              }
            }
          })
        );

        // Wait for at least one to finish before checking again
        if (running.size > 0) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      execution.status = 'completed';
      execution.finishedAt = Date.now();
      await this.state.storage.put(`ex:${executionId}`, execution);
      await this.backupArtifactsToR2(executionId);

      this.broadcast(executionId, {
        type: 'workflow_complete',
        executionId,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      execution.status = 'failed';
      execution.finishedAt = Date.now();
      await this.state.storage.put(`ex:${executionId}`, execution);

      this.broadcast(executionId, {
        type: 'workflow_error',
        executionId,
        error: error.message || 'Workflow failed',
        timestamp: Date.now(),
      });
    }
  }

  /** Effective servers for a node: its own servers plus selected workflow servers. */
  private resolveNodeServers(workflow: Workflow, node: { mcpServerIds?: string[]; mcpServers?: McpServerConfig[] }): McpServerConfig[] {
    const all = workflow.mcpServers ?? [];
    const own = node.mcpServers ?? [];
    const shared = !node.mcpServerIds ? all : all.filter((s) => new Set(node.mcpServerIds).has(s.id));
    const seen = new Set<string>();
    return [...own, ...shared].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
  }

  /** Best-effort tool discovery across a node's servers (unreachable = skipped). */
  private async collectNodeTools(servers: McpServerConfig[]): Promise<McpToolDef[]> {
    const tools: McpToolDef[] = [];
    await Promise.all(
      servers.map(async (server) => {
        try {
          tools.push(...(await new McpClient(server).listTools()));
        } catch {
          // Unreachable server: agent proceeds without its tools.
        }
      }),
    );
    return tools;
  }

  private addMemory(agentType: string, content: string, executionId: string) {
    const key = agentType as any;
    if (!this.memories.has(key)) {
      this.memories.set(key, { agentType: key, entries: [] });
    }
    const mem = this.memories.get(key)!;
    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      content: content.slice(0, 500), // Keep memory concise
      timestamp: Date.now(),
      executionId,
    };
    mem.entries.push(entry);
    // Keep only last 10 entries per agent type
    if (mem.entries.length > 10) {
      mem.entries = mem.entries.slice(-10);
    }
    this.state.storage.put(`mem:${key}`, mem);
  }

  private async backupArtifactsToR2(executionId: string) {
    try {
      const artifacts = this.artifacts.get(executionId) || [];
      await this.env.ARTIFACTS.put(
        `artifacts/${executionId}.json`,
        JSON.stringify({ executionId, artifacts, savedAt: Date.now() }),
        { httpMetadata: { contentType: 'application/json' } },
      );
    } catch {
      // R2 backup is best-effort; live artifacts remain in Durable Object storage.
    }
  }
}
