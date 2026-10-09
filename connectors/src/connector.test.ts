import { describe, expect, it, vi } from "vitest";
import { handleConnectorRequest } from "./handle";
import type { ConnectorModule } from "./registry";
import { searchConsole } from "./search-console";

const echo: ConnectorModule = {
  id: "echo",
  tools: [
    {
      name: "ping",
      description: "Returns pong.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
  call: async () => "pong",
};

function call(path: string, token: string, body: unknown): Request {
  return new Request(`https://connectors.example${path}`, {
    method: "POST",
    headers: { authorization: token ? `Bearer ${token}` : "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handoff connectors", () => {
  it("rejects a missing or wrong bearer before any vendor call", async () => {
    const fetchImpl = vi.fn();
    const missing = await handleConnectorRequest(call("/mcp/search-console", "", { method: "tools/list" }), {
      token: "connector-token",
      modules: [searchConsole],
      grant: async () => "sc-domain:northwind.example",
      fetchImpl: fetchImpl as typeof fetch,
    });
    const wrong = await handleConnectorRequest(call("/mcp/search-console", "nope", { method: "tools/list" }), {
      token: "connector-token",
      modules: [searchConsole],
      grant: async () => "sc-domain:northwind.example",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown connector", async () => {
    const response = await handleConnectorRequest(call("/mcp/missing", "connector-token", { method: "tools/list" }), {
      token: "connector-token",
      modules: [searchConsole],
      grant: async () => null,
    });
    expect(response.status).toBe(404);
  });

  it("lists the Search Console tools", async () => {
    const response = await handleConnectorRequest(call("/mcp/search-console", "connector-token", { jsonrpc: "2.0", id: 1, method: "tools/list" }), {
      token: "connector-token",
      modules: [searchConsole],
      grant: async () => null,
    });
    const body = (await response.json()) as { result?: { tools?: { name: string }[] } };
    expect(body.result?.tools?.map((tool) => tool.name)).toEqual(["search_analytics", "inspect_url"]);
  });

  it("returns an error and skips Google when the client has no grant", async () => {
    const fetchImpl = vi.fn();
    const response = await handleConnectorRequest(
      call("/mcp/search-console", "connector-token", {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search_analytics", arguments: { organizationId: "org-1", site_url: "https://evil.example/" } },
      }),
      {
        token: "connector-token",
        modules: [searchConsole],
        grant: async () => null,
        fetchImpl: fetchImpl as typeof fetch,
        accessToken: async () => "tok",
      },
    );
    const body = (await response.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/No Search Console property/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("calls Google with the grant resource and ignores a model site url", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    await handleConnectorRequest(
      call("/mcp/search-console", "connector-token", {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "search_analytics",
          arguments: { organizationId: "org-1", site_url: "https://evil.example/", startDate: "2026-10-01", endDate: "2026-10-07" },
        },
      }),
      {
        token: "connector-token",
        modules: [searchConsole],
        grant: async () => "sc-domain:northwind.example",
        fetchImpl: fetchImpl as typeof fetch,
        accessToken: async () => "tok",
      },
    );
    const url = String((fetchImpl.mock.calls as unknown as [string][])[0]?.[0] ?? "");
    expect(url).toContain(encodeURIComponent("sc-domain:northwind.example"));
    expect(url).not.toContain("evil.example");
  });

  it("serves a second module on its own path", async () => {
    const response = await handleConnectorRequest(call("/mcp/echo", "connector-token", { jsonrpc: "2.0", id: 4, method: "tools/list" }), {
      token: "connector-token",
      modules: [searchConsole, echo],
      grant: async () => null,
    });
    const body = (await response.json()) as { result?: { tools?: { name: string }[] } };
    expect(body.result?.tools?.map((tool) => tool.name)).toEqual(["ping"]);
  });
});
