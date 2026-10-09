import { describe, expect, it } from "vitest";
import { OPENING_PACK_ID } from "./pack-templates";
import { leadBrief, leadPortalAttach, readSwarmRun, runLeadSwarm } from "./lead-swarm";

const template = {
  id: OPENING_PACK_ID,
  name: "Marketing pack",
  nodes: [
    { id: "mkt-r", type: "researcher", name: "Market research", instructions: "Research.", position: { x: 0, y: 0 } },
    { id: "mkt-w", type: "writer", name: "Copy", instructions: "Write.", position: { x: 1, y: 0 } },
  ],
  edges: [{ id: "e1", source: "mkt-r", target: "mkt-w" }],
};

describe("lead swarm", () => {
  it("writes the lead, the site, and the score into the brief", () => {
    expect(leadBrief({ name: "Ada North", website: "northwind.example", score: 42 })).toBe(
      ["Lead: Ada North", "Site: northwind.example", "Readiness score: 42", "Use the schema scan to check AI readiness. The scraped pages are the client's knowledge context."].join("\n"),
    );
    expect(leadBrief({ name: "Ada North", website: "northwind.example", score: 42, packId: "pack-seo" })).toBe(
      ["Lead: Ada North", "Site: northwind.example", "Readiness score: 42", "The scraped pages are available as knowledge context."].join("\n"),
    );
  });

  it("saves the schema readiness pack, starts it, and returns the finished copy", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
      if (href.endsWith(`/api/template?id=${OPENING_PACK_ID}`)) return Response.json(template);
      if (href.endsWith("/api/save")) return Response.json({ success: true });
      if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-1" });
      return Response.json({
        status: "completed",
        results: {
          "mkt-r": { status: "done", output: "They sell foam." },
          "mkt-w": { status: "done", output: "Hello Ada." },
        },
      });
    };
    const result = await runLeadSwarm({
      origin: "https://swarm.example",
      workflowId: "lead-wake-1",
      brief: "Lead: Ada North",
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => {},
    });
    expect(result).toEqual({ executionId: "run-1", status: "completed", output: "They sell foam.\n\nHello Ada." });
    expect(calls.map((call) => call.url)).toEqual([
      `https://swarm.example/api/template?id=${OPENING_PACK_ID}`,
      "https://swarm.example/api/save",
      "https://swarm.example/api/execute",
      "https://swarm.example/api/status?id=run-1",
    ]);
    expect(JSON.parse(calls[2]?.body ?? "{}")).toEqual({ workflowId: "lead-wake-1", input: "Lead: Ada North" });
    expect(JSON.parse(calls[1]?.body ?? "{}").mcpServers).toBeUndefined();
  });

  it("attaches only catalog servers to each step of the saved workflow", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, body: init?.body ? String(init.body) : undefined });
      if (href.includes("/api/template")) return Response.json(template);
      if (href.endsWith("/api/save")) return Response.json({ success: true });
      if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-mcp" });
      return Response.json({ status: "completed", results: { "mkt-r": { status: "done", output: "Time." } } });
    };
    await runLeadSwarm({
      origin: "https://swarm.example",
      workflowId: "client-1",
      brief: "Run the clock.",
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => {},
      mcpServers: [{ id: "swarm-demo", name: "Swarm demo", url: "https://swarm.example/demo-mcp/mcp" }],
    });
    const saved = JSON.parse(calls.find((call) => call.url.endsWith("/api/save"))?.body ?? "{}") as {
      mcpServers?: unknown;
      nodes?: { mcpServerIds?: string[] }[];
    };
    expect(saved.mcpServers).toEqual([{ id: "swarm-demo", name: "Swarm demo", url: "https://swarm.example/demo-mcp/mcp" }]);
    expect(saved.nodes?.map((node) => node.mcpServerIds)).toEqual([["swarm-demo"], ["swarm-demo"]]);
  });

  it("attaches the portal and sends the run secret when the agent has both", () => {
    expect(leadPortalAttach({ origin: "https://swarm.example", portalUrl: "", runSecret: "test-run-secret" })).toEqual({
      mcpServers: [],
      runSecret: "",
    });
    expect(
      leadPortalAttach({
        origin: "https://swarm.example",
        portalUrl: "https://mcp.example/mcp",
        runSecret: "test-run-secret",
      }),
    ).toEqual({
      mcpServers: [{ id: "portal", name: "MCP portal", url: "https://mcp.example/mcp" }],
      runSecret: "test-run-secret",
    });
  });

  it("sends the run secret with the portal on save and execute", async () => {
    const headers: { url: string; authorization?: string }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      headers.push({ url: href, authorization: new Headers(init?.headers).get("authorization") ?? undefined });
      if (href.includes("/api/template")) return Response.json(template);
      if (href.endsWith("/api/save")) return Response.json({ success: true });
      if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-portal" });
      return Response.json({ status: "completed", results: { "mkt-r": { status: "done", output: "Cited." } } });
    };
    const portal = leadPortalAttach({
      origin: "https://swarm.example",
      portalUrl: "https://mcp.example/mcp",
      runSecret: "test-run-secret",
    });
    await runLeadSwarm({
      origin: "https://swarm.example",
      workflowId: "lead-portal",
      brief: "Research the market.",
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => {},
      mcpServers: portal.mcpServers,
      runSecret: portal.runSecret,
    });
    const save = headers.find((call) => call.url.endsWith("/api/save"));
    const execute = headers.find((call) => call.url.endsWith("/api/execute"));
    expect(save?.authorization).toBe("Bearer test-run-secret");
    expect(execute?.authorization).toBe("Bearer test-run-secret");
  });

  it("reads one execution without saving or starting another", async () => {
    const urls: string[] = [];
    const result = await readSwarmRun({
      origin: "https://swarm.example",
      executionId: "run-1",
      templateId: OPENING_PACK_ID,
      fetchImpl: (async (url: string | URL | Request) => {
        const href = String(url);
        urls.push(href);
        if (href.includes("/api/template")) return Response.json(template);
        return Response.json({
          status: "completed",
          results: {
            "mkt-r": { status: "done", output: "They sell foam." },
            "mkt-w": { status: "done", output: "Hello Ada." },
          },
        });
      }) as typeof fetch,
    });
    expect(result).toEqual({ status: "completed", output: "They sell foam.\n\nHello Ada." });
    expect(urls.some((url) => url.includes("/api/execute") || url.includes("/api/save"))).toBe(false);
  });
});
