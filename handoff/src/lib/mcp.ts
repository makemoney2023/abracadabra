import { AgentWorkError, runAgentWork } from "@/db/agent-work";
import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { clientContext, getBrief, listFeedback, liveOrganization, organizationWorkspaceIds, workspaceInOrganization } from "@/lib/agent-context";
import { understanderFromRuntime } from "@/lib/ai-gateway";
import { listFileReads, principalForKnowledgeKey, searchSpace, type KnowledgePrincipal } from "@/lib/knowledge";
import type { Sql } from "@/db/sql";

const PROTOCOL = "2025-03-26";

type ToolArgs = {
  query?: string;
  organizationId?: string;
  workspaceId?: string;
  tag?: string;
  kind?: string;
  deliverableId?: string;
};

type Rpc = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: ToolArgs };
};

const FILE_TAGS = new Set(["brand", "photo", "copy", "data_export", "reference", "source", "other"]);

const WORK_TOOLS = new Set([
  "save_brief",
  "create_task",
  "update_task",
  "create_deliverable",
  "add_deliverable_item",
  "post_status_update",
  "add_note",
  "save_space_file",
  "store_scan_context",
  "record_swarm_run",
  "ask_staff",
  "list_repos",
]);

const tagField = { type: "string", description: "Limit to one file tag, such as brand or copy." };

const SPACE_TOOLS = [
  {
    name: "search_files",
    description: "Search the words we read from files in this space.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Words to look for." }, tag: tagField },
      required: ["query"],
    },
  },
  {
    name: "list_files",
    description: "List the files we have read in this space.",
    inputSchema: { type: "object", properties: { tag: tagField } },
  },
];

const organizationField = { type: "string", description: "The live organization this call is for." };

const AGENT_TOOLS = [
  ...SPACE_TOOLS.map((tool) => ({
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: { ...tool.inputSchema.properties, organizationId: organizationField, workspaceId: { type: "string" } },
      required: ["organizationId", ...("required" in tool.inputSchema ? (tool.inputSchema.required ?? []) : [])],
    },
  })),
  {
    name: "client_context",
    description: "Read one live client's organization, deal, scores, spaces, and open work.",
    inputSchema: { type: "object", properties: { organizationId: organizationField }, required: ["organizationId"] },
  },
  {
    name: "get_brief",
    description: "Read the current brief or design system and the change requests on it.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: organizationField,
        kind: { type: "string", enum: ["brief", "design_system"] },
      },
      required: ["organizationId", "kind"],
    },
  },
  {
    name: "list_feedback",
    description: "List feedback on one deliverable in this organization.",
    inputSchema: {
      type: "object",
      properties: { organizationId: organizationField, deliverableId: { type: "string" } },
      required: ["organizationId", "deliverableId"],
    },
  },
  {
    name: "store_scan_context",
    description: "Store the latest schema scan's scraped pages as knowledge context in the client space.",
    inputSchema: {
      type: "object",
      properties: { organizationId: organizationField, requestId: { type: "string" } },
      required: ["organizationId", "requestId"],
    },
  },
  {
    name: "record_swarm_run",
    description: "Record one swarm run on the client timeline: pack, status, and saved paths.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: organizationField,
        packId: { type: "string" },
        packName: { type: "string" },
        status: { type: "string" },
        executionId: { type: "string" },
        body: { type: "string" },
        artifacts: { type: "array", items: { type: "string" } },
        requestId: { type: "string" },
        activityKey: { type: "string", description: "Stable activity key. A later call with a new requestId updates this row." },
        trigger: { type: "string" },
      },
      required: ["organizationId", "packName", "status", "requestId"],
    },
  },
  {
    name: "save_space_file",
    description: "Save swarm markdown into the client space under agent/<workflow>/<run>/<node>.md.",
    inputSchema: {
      type: "object",
      properties: {
        organizationId: organizationField,
        workflow: { type: "string" },
        run: { type: "string" },
        node: { type: "string" },
        body: { type: "string" },
        requestId: { type: "string" },
      },
      required: ["organizationId", "workflow", "run", "node", "body", "requestId"],
    },
  },
];

function rpcResult(id: unknown, result: unknown, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status });
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function textResult(text: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text }] };
}

function jsonText(value: unknown): { content: { type: "text"; text: string }[] } {
  return textResult(JSON.stringify(value));
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

function readTag(value: unknown): string | undefined | null {
  if (value == null || value === "") return undefined;
  if (typeof value === "string" && FILE_TAGS.has(value)) return value;
  return null;
}

async function searchWorkspaces(
  sql: Sql,
  workspaceIds: readonly string[],
  query: string,
  tag: string | undefined,
): Promise<unknown[]> {
  const hits = [];
  for (const workspaceId of workspaceIds) {
    const found = await searchSpace({
      sql,
      workspaceId,
      query,
      understander: understanderFromRuntime(),
      tag,
    });
    hits.push(...found);
    if (hits.length >= 8) break;
  }
  return hits.slice(0, 8);
}

async function callTool(sql: Sql, principal: KnowledgePrincipal, name: string, args: ToolArgs, id: unknown): Promise<Response> {
  if (WORK_TOOLS.has(name)) {
    const scopes = principal.kind === "agent" ? principal.scopes : [];
    if (!scopes.includes("work")) return rpcError(id, -32001, "This key cannot change records.", 403);
  }
  const tag = readTag(args.tag);
  if (tag === null) return rpcError(id, -32602, "Unknown file tag.");

  if (principal.kind === "workspace") {
    if (args.organizationId) return rpcError(id, -32001, "A project key stays on its space.", 403);
    if (name === "client_context" || name === "get_brief" || name === "list_feedback") {
      return rpcError(id, -32001, "A project key stays on its space.", 403);
    }
    if (name === "list_files") {
      const rows = await listFileReads(sql, principal.workspaceId, tag);
      const text = rows.length === 0 ? "No files have been read yet." : JSON.stringify(rows);
      return rpcResult(id, textResult(text));
    }
    if (name === "search_files") {
      const query = args.query?.trim() ?? "";
      if (!query) return rpcResult(id, textResult("Type a few words to search."));
      const hits = await searchWorkspaces(sql, [principal.workspaceId], query, tag);
      const text = hits.length === 0 ? "No files matched." : JSON.stringify(hits);
      return rpcResult(id, textResult(text));
    }
    return rpcError(id, -32602, "Unknown tool.");
  }

  const organizationId = args.organizationId?.trim() ?? "";
  if (!organizationId) return rpcError(id, -32602, "Name an organization.");
  if (!(await liveOrganization(sql, organizationId))) return rpcError(id, -32602, "Unknown organization.");
  if (args.workspaceId && !(await workspaceInOrganization(sql, organizationId, args.workspaceId))) {
    return rpcError(id, -32001, "That space is not in this organization.", 403);
  }
  const workspaceIds = args.workspaceId ? [args.workspaceId] : await organizationWorkspaceIds(sql, organizationId);

  if (WORK_TOOLS.has(name)) {
    try {
      const result = await runAgentWork(sql, { keyId: principal.keyId, organizationId }, name, args, Date.now());
      return rpcResult(id, jsonText(result));
    } catch (error) {
      if (error instanceof AgentWorkError) return rpcError(id, -32602, error.message);
      throw error;
    }
  }
  if (name === "client_context") return rpcResult(id, jsonText(await clientContext(sql, organizationId)));
  if (name === "get_brief") {
    if (args.kind !== "brief" && args.kind !== "design_system") return rpcError(id, -32602, "Kind must be brief or design_system.");
    return rpcResult(id, jsonText(await getBrief(sql, organizationId, args.kind)));
  }
  if (name === "list_feedback") {
    const deliverableId = args.deliverableId?.trim() ?? "";
    if (!deliverableId) return rpcError(id, -32602, "Name a deliverable.");
    return rpcResult(id, jsonText(await listFeedback(sql, organizationId, deliverableId)));
  }
  if (name === "list_files") return rpcResult(id, jsonText(await listFileReads(sql, workspaceIds, tag)));
  if (name === "search_files") {
    const query = args.query?.trim() ?? "";
    if (!query) return rpcResult(id, textResult("Type a few words to search."));
    const hits = await searchWorkspaces(sql, workspaceIds, query, tag);
    const text = hits.length === 0 ? "No files matched." : JSON.stringify(hits);
    return rpcResult(id, textResult(text));
  }
  return rpcError(id, -32602, "Unknown tool.");
}

/** Stateless JSON-RPC. A project key sees one space. A deployment key sees one named organization. */
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") return rpcError(null, -32600, "Use POST.", 405);
  let body: Rpc;
  try {
    body = (await request.json()) as Rpc;
  } catch {
    return rpcError(null, -32700, "That was not JSON.", 400);
  }
  const sql = await openHandoffDb();
  await migrate(sql);
  const principal = await principalForKnowledgeKey(sql, bearer(request));
  if (!principal) return rpcError(body.id, -32001, "That project key does not work.", 401);
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (body.method === "initialize") {
    return rpcResult(body.id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "handoff", version: "1.0.0" },
    });
  }
  if (body.method === "tools/list") {
    return rpcResult(body.id, { tools: principal.kind === "agent" ? AGENT_TOOLS : SPACE_TOOLS });
  }
  if (body.method !== "tools/call") return rpcError(body.id, -32601, "Unknown method.");
  return callTool(sql, principal, body.params?.name ?? "", body.params?.arguments ?? {}, body.id);
}
