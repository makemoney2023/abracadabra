import { migrate } from "@/db/migrate";
import { openHandoffDb } from "@/db/open";
import { understanderFromRuntime } from "@/lib/ai-gateway";
import { listFileReads, searchSpace, workspaceIdForKnowledgeKey } from "@/lib/knowledge";

const PROTOCOL = "2025-03-26";

type Rpc = {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: { name?: string; arguments?: { query?: string } };
};

function rpcResult(id: unknown, result: unknown, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status });
}

function rpcError(id: unknown, code: number, message: string, status = 200): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

function textResult(text: string): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text }] };
}

function bearer(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? "";
}

const TOOLS = [
  {
    name: "search_files",
    description: "Search the words we read from files in this space.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Words to look for." } },
      required: ["query"],
    },
  },
  {
    name: "list_files",
    description: "List the files we have read in this space.",
    inputSchema: { type: "object", properties: {} },
  },
];

/** Stateless JSON-RPC for one space. A bad key does not say which space it missed. */
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
  const workspaceId = await workspaceIdForKnowledgeKey(sql, bearer(request));
  if (!workspaceId) return rpcError(body.id, -32001, "That project key does not work.", 401);

  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (body.method === "initialize") {
    return rpcResult(body.id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: { name: "handoff", version: "1.0.0" },
    });
  }
  if (body.method === "tools/list") return rpcResult(body.id, { tools: TOOLS });
  if (body.method !== "tools/call") return rpcError(body.id, -32601, "Unknown method.");

  const name = body.params?.name;
  if (name === "list_files") {
    const rows = await listFileReads(sql, workspaceId);
    const text =
      rows.length === 0
        ? "No files have been read yet."
        : rows.map((row) => `${row.name} (${row.status})`).join("\n");
    return rpcResult(body.id, textResult(text));
  }
  if (name === "search_files") {
    const query = body.params?.arguments?.query?.trim() ?? "";
    if (!query) return rpcResult(body.id, textResult("Type a few words to search."));
    const hits = await searchSpace({
      sql,
      workspaceId,
      query,
      understander: understanderFromRuntime(),
    });
    const text =
      hits.length === 0
        ? "No files matched."
        : hits.map((hit) => `${hit.fileName}: ${hit.passage}`).join("\n");
    return rpcResult(body.id, textResult(text));
  }
  return rpcError(body.id, -32602, "Unknown tool.");
}
