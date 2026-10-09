export type PortalEnv = {
  MCP_PORTAL_URL?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
};

export type PortalServer = {
  serverId: string;
  name: string;
  enabled: boolean;
};

export type PortalList =
  | { ok: true; configured: boolean; servers: PortalServer[] }
  | { ok: false; error: string };

const PROTOCOL_VERSION = "2025-06-18";

function configuredTarget(env: PortalEnv): { url: string; headers: Record<string, string> } | null {
  const url = env.MCP_PORTAL_URL?.trim() ?? "";
  const accessId = env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
  const accessSecret = env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";
  if (!url.startsWith("https://") || !accessId || !accessSecret) return null;
  return {
    url,
    headers: {
      "CF-Access-Client-Id": accessId,
      "CF-Access-Client-Secret": accessSecret,
    },
  };
}

function extractSsePayloads(text: string): string[] {
  const payloads: string[] = [];
  for (const chunk of text.split(/\n\n+/)) {
    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data && data !== "[DONE]") payloads.push(data);
    }
  }
  return payloads;
}

function asJsonRpc(body: string): { result?: unknown; error?: { message?: string } } | null {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const candidates = trimmed.startsWith("{") || trimmed.startsWith("[") ? [trimmed] : extractSsePayloads(body);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(candidates[i] ?? "") as { result?: unknown; error?: { message?: string } };
      if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) return parsed;
    } catch {
      // keep scanning
    }
  }
  return null;
}

function resultText(payload: { result?: unknown } | null, raw: string): string {
  const result = payload?.result;
  if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (block && typeof block === "object" && "text" in block && typeof block.text === "string") return block.text;
          return "";
        })
        .join("\n");
    }
  }
  if (typeof result === "string") return result;
  if (result && typeof result === "object") return JSON.stringify(result);
  return raw;
}

function serverRow(value: unknown): PortalServer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { server_id?: unknown; id?: unknown; name?: unknown; enabled?: unknown };
  const serverId = typeof row.server_id === "string" ? row.server_id : typeof row.id === "string" ? row.id : "";
  if (!serverId) return null;
  const name = typeof row.name === "string" && row.name.trim() ? row.name : serverId;
  return { serverId, name, enabled: row.enabled === true };
}

export function parsePortalServers(text: string): PortalServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { servers?: unknown }).servers)
      ? (parsed as { servers: unknown[] }).servers
      : [];
  return rows.flatMap((row) => {
    const server = serverRow(row);
    return server ? [server] : [];
  });
}

class PortalCall {
  private sessionId: string | null = null;
  private ready: Promise<void> | null = null;

  constructor(
    private target: { url: string; headers: Record<string, string> },
    private fetchImpl: typeof fetch,
  ) {}

  private async post(payload: unknown): Promise<{ raw: string; json: { result?: unknown; error?: { message?: string } } | null }> {
    const response = await this.fetchImpl(this.target.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...this.target.headers,
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (!response.ok) throw new Error(raw.slice(0, 200) || "The portal did not answer.");
    return { raw, json: asJsonRpc(raw) };
  }

  private async open(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        try {
          const opened = await this.post({
            jsonrpc: "2.0",
            id: "init-1",
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "handoff-hq", version: "1.0.0" },
            },
          });
          if (opened.json?.error) throw new Error(opened.json.error.message || "initialize failed");
          try {
            await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
          } catch {
            // A server that rejects the notification still accepts tool calls.
          }
        } catch (error) {
          this.ready = null;
          throw error;
        }
      })();
    }
    await this.ready;
  }

  async call(name: string, args: Record<string, unknown>): Promise<{ raw: string; text: string; error?: string }> {
    await this.open();
    const called = await this.post({
      jsonrpc: "2.0",
      id: `call-${name}`,
      method: "tools/call",
      params: { name, arguments: args },
    });
    if (called.json?.error) return { raw: called.raw, text: "", error: called.json.error.message || "The portal refused the call." };
    const text = resultText(called.json, called.raw);
    if (text.includes("/authorize")) return { raw: called.raw, text, error: text };
    return { raw: called.raw, text };
  }
}

/** Servers visible to this service-token grant. An empty portal config does not call the network. */
export async function listPortalServers(env: PortalEnv, fetchImpl: typeof fetch = fetch): Promise<PortalList> {
  const target = configuredTarget(env);
  if (!target) return { ok: true, configured: false, servers: [] };
  try {
    const listed = await new PortalCall(target, fetchImpl).call("portal_list_servers", {});
    if (listed.error) return { ok: false, error: listed.error };
    return { ok: true, configured: true, servers: parsePortalServers(listed.text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The portal did not answer." };
  }
}

/** Turn one linked server on or off for this grant, then read the list again. */
export async function setPortalServer(
  env: PortalEnv,
  input: { serverId: string; enabled: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<PortalList> {
  const serverId = input.serverId.trim();
  if (!serverId) return { ok: false, error: "Name the server." };
  const target = configuredTarget(env);
  if (!target) return { ok: false, error: "The portal URL is empty." };
  try {
    const portal = new PortalCall(target, fetchImpl);
    const toggled = await portal.call("portal_toggle_single_server", {
      server_id: serverId,
      action: input.enabled ? "toggle" : "untoggle",
    });
    if (toggled.error) return { ok: false, error: toggled.error };
    const listed = await portal.call("portal_list_servers", {});
    if (listed.error) return { ok: false, error: listed.error };
    return { ok: true, configured: true, servers: parsePortalServers(listed.text) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The portal did not answer." };
  }
}
