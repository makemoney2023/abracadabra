import { unwrapToolResult, type ToolCaller } from "./client-documents";

/** Portal tools when they exist. The Handoff MCP route otherwise. */
export function callerForClientWork(portal: ToolCaller | null, http: ToolCaller | null): ToolCaller | null {
  return portal ?? http;
}

export type McpConnectEnv = {
  MCP_PORTAL_URL?: string;
  HANDOFF_MCP_URL?: string;
  AGENT_MCP_TOKEN?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
};

export type McpConnectTarget = {
  url: string;
  headers: Record<string, string>;
};

/**
 * Portal when Access can open it. A portal URL without those headers stays on the
 * Handoff MCP route so lead swarms can store the portal URL without taking the agent's tools.
 */
export function mcpConnectTarget(env: McpConnectEnv): McpConnectTarget | null {
  const portal = env.MCP_PORTAL_URL?.trim() ?? "";
  const handoff = env.HANDOFF_MCP_URL?.trim() ?? "";
  const accessId = env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
  const accessSecret = env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";
  if (portal.startsWith("https://") && accessId && accessSecret) {
    return {
      url: portal,
      headers: {
        "CF-Access-Client-Id": accessId,
        "CF-Access-Client-Secret": accessSecret,
      },
    };
  }
  const token = env.AGENT_MCP_TOKEN?.trim() ?? "";
  if (!handoff || !token) return null;
  return { url: handoff, headers: { Authorization: `Bearer ${token}` } };
}

/** JSON-RPC tools/call against the Handoff MCP route. Null when no target is configured. */
export function mcpHttpCaller(env: McpConnectEnv, fetchImpl: typeof fetch = fetch): ToolCaller | null {
  const target = mcpConnectTarget(env);
  if (!target) return null;
  return async (name, args) => {
    const response = await fetchImpl(target.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...target.headers },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    if (!response.ok) throw new Error("The knowledge tools did not answer.");
    const payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (payload.error) throw new Error(payload.error.message || "The knowledge tools refused the call.");
    return unwrapToolResult(payload.result);
  };
}
