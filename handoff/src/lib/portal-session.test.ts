import { describe, expect, it, vi } from "vitest";
import { listPortalServers, setPortalServer, type PortalEnv } from "./portal-session";

const env: PortalEnv = {
  MCP_PORTAL_URL: "https://mcp.example/mcp",
  CF_ACCESS_CLIENT_ID: "access-id",
  CF_ACCESS_CLIENT_SECRET: "access-secret",
};

function rpc(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toolResult(text: string): Response {
  return rpc({
    jsonrpc: "2.0",
    id: "call",
    result: { content: [{ type: "text", text }] },
  });
}

describe("portal session", () => {
  it("returns no servers when the portal URL is empty and does not call the network", async () => {
    const fetchImpl = vi.fn();
    const result = await listPortalServers({ MCP_PORTAL_URL: "" }, fetchImpl as typeof fetch);
    expect(result).toEqual({ ok: true, configured: false, servers: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses a text content list of servers", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "initialize") return rpc({ jsonrpc: "2.0", id: "init-1", result: {} });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return toolResult(JSON.stringify([{ server_id: "handoff", name: "Handoff", enabled: true }]));
    });
    const result = await listPortalServers(env, fetchImpl as typeof fetch);
    expect(result).toEqual({
      ok: true,
      configured: true,
      servers: [{ serverId: "handoff", name: "Handoff", enabled: true }],
    });
  });

  it("parses a servers object and an id-only row, and drops a row with no id", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "initialize") return rpc({ jsonrpc: "2.0", id: "init-1", result: {} });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return toolResult(
        JSON.stringify({
          servers: [
            { server_id: "handoff", name: "Handoff", enabled: true },
            { id: "search-console", name: "Search Console", enabled: false },
            { name: "Nope", enabled: true },
          ],
        }),
      );
    });
    const result = await listPortalServers(env, fetchImpl as typeof fetch);
    expect(result).toEqual({
      ok: true,
      configured: true,
      servers: [
        { serverId: "handoff", name: "Handoff", enabled: true },
        { serverId: "search-console", name: "Search Console", enabled: false },
      ],
    });
  });

  it("turns a server off, and treats an authorize URL as a failed toggle", async () => {
    const calls: { name?: string; arguments?: unknown }[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        params?: { name?: string; arguments?: unknown };
      };
      if (body.method === "initialize") return rpc({ jsonrpc: "2.0", id: "init-1", result: {} });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      calls.push({ name: body.params?.name, arguments: body.params?.arguments });
      if (body.params?.name === "portal_toggle_single_server") {
        return toolResult("Open https://mcp.example/authorize to continue.");
      }
      return toolResult(JSON.stringify([{ server_id: "handoff", name: "Handoff", enabled: false }]));
    });
    const result = await setPortalServer(env, { serverId: "handoff", enabled: false }, fetchImpl as typeof fetch);
    expect(calls.some((call) => call.name === "portal_toggle_single_server")).toBe(true);
    expect(calls.find((call) => call.name === "portal_toggle_single_server")?.arguments).toEqual({
      server_id: "handoff",
      action: "untoggle",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain('"enabled":false');
  });
});
