import { bearerMatches } from "./auth";
import { moduleById, type ConnectorContext, type ConnectorModule } from "./registry";

export type ConnectorDeps = {
  token: string;
  modules: readonly ConnectorModule[];
  grant: ConnectorContext["grant"];
  fetchImpl?: typeof fetch;
  accessToken?: () => Promise<string>;
};

function jsonRpc(id: unknown, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function jsonError(id: unknown, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function handleConnectorRequest(request: Request, deps: ConnectorDeps): Promise<Response> {
  const url = new URL(request.url);
  const match = /^\/mcp\/([a-z0-9-]+)$/.exec(url.pathname);
  if (!match) return new Response("Not found", { status: 404 });
  if (!(await bearerMatches(request.headers.get("authorization"), deps.token))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const mod = moduleById(deps.modules, match[1] ?? "");
  if (!mod) return new Response("Not found", { status: 404 });
  if (request.method !== "POST") return new Response("Use POST with a JSON-RPC body.", { status: 405 });

  let body: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError(null, -32700, "Parse error: invalid JSON.");
  }
  const id = body.id;
  if (body.method === "initialize") {
    return jsonRpc(id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: mod.id, version: "1.0.0" },
    });
  }
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (body.method === "tools/list") {
    return jsonRpc(id, {
      tools: mod.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    });
  }
  if (body.method === "tools/call") {
    const name = body.params?.name ?? "";
    const args = body.params?.arguments ?? {};
    const known = mod.tools.some((tool) => tool.name === name);
    if (!known) return jsonError(id, -32602, `Unknown tool: ${name}`);
    try {
      const text = await mod.call(name, args, {
        grant: deps.grant,
        fetchImpl: deps.fetchImpl ?? fetch,
        accessToken: deps.accessToken ?? (async () => ""),
      });
      return jsonRpc(id, { content: [{ type: "text", text }] });
    } catch (error) {
      return jsonError(id, -32000, error instanceof Error ? error.message : "The connector failed.");
    }
  }
  return jsonError(id, -32601, `Unknown method: ${body.method ?? ""}`);
}
