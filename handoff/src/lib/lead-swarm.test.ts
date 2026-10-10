import { describe, expect, it } from "vitest";
import { OPENING_PACK_ID } from "./pack-templates";
import {
  followRunningSwarm,
  leadBrief,
  readSwarmArtifacts,
  readSwarmRun,
  runLeadSwarm,
  swarmArtifactFiles,
  SWARM_REFRESH_LIMIT,
} from "./lead-swarm";

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

  it("saves the client workflow name so a research run is not the pack name", async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push({ url: href, body: init?.body ? String(init.body) : undefined });
      if (href.includes("/api/template")) return Response.json(template);
      if (href.endsWith("/api/save")) return Response.json({ success: true });
      if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-name" });
      return Response.json({ status: "completed", results: { "mkt-r": { status: "done", output: "Audience." } } });
    };
    await runLeadSwarm({
      origin: "https://swarm.example",
      workflowId: "client-research",
      workflowName: "research: audience, competitors, content calendar strategy",
      brief: "For Renew Implants, research the audience.",
      templateId: "pack-marketing",
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => {},
    });
    const saved = JSON.parse(calls.find((call) => call.url.endsWith("/api/save"))?.body ?? "{}") as { name?: string };
    expect(saved.name).toBe("research: audience, competitors, content calendar strategy");
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

  it("reads each node artifact and skips a blank one", async () => {
    const urls: string[] = [];
    const artifacts = await readSwarmArtifacts({
      origin: "https://swarm.example/",
      executionId: "run-1",
      fetchImpl: (async (url: string | URL | Request) => {
        urls.push(String(url));
        return Response.json([
          { id: "a1", executionId: "run-1", nodeId: "mkt-r", nodeName: "Market research", content: "They sell foam.", timestamp: 1 },
          { id: "a2", executionId: "run-1", nodeId: "mkt-w", nodeName: "Copy", content: "   ", timestamp: 2 },
          { nodeId: "mkt-x", nodeName: "Notes", content: "Keep this." },
          "nope",
        ]);
      }) as typeof fetch,
    });
    expect(urls).toEqual(["https://swarm.example/api/artifacts?executionId=run-1"]);
    expect(artifacts).toEqual([
      { nodeId: "mkt-r", nodeName: "Market research", content: "They sell foam." },
      { nodeId: "mkt-x", nodeName: "Notes", content: "Keep this." },
    ]);
    expect(await readSwarmArtifacts({
      origin: "https://swarm.example",
      executionId: "run-2",
      fetchImpl: (async () => Response.json({ status: "completed" })) as typeof fetch,
    })).toEqual([]);
  });

  it("names each node file once and keeps a short body", () => {
    const long = "x".repeat(100_001);
    expect(
      swarmArtifactFiles([
        { nodeId: "mkt-r", nodeName: "Market research", content: "They sell foam." },
        { nodeId: "mkt-r2", nodeName: "Market research", content: "Second pass." },
        { nodeId: "blank", nodeName: "Empty", content: "  " },
        { nodeId: "note-1", nodeName: "", content: long },
      ]),
    ).toEqual([
      { node: "market-research", body: "They sell foam." },
      { node: "market-research-mkt-r2", body: "Second pass." },
      { node: "note-1", body: "x".repeat(100_000) },
    ]);
  });

  it("keeps following a running swarm well past six checks, then hands it back to due", () => {
    expect(followRunningSwarm("running", 6)).toBe("refresh");
    expect(followRunningSwarm("running", SWARM_REFRESH_LIMIT - 1)).toBe("refresh");
    expect(followRunningSwarm("running", SWARM_REFRESH_LIMIT)).toBe("handoff");
    expect(followRunningSwarm("completed", 1)).toBe("stop");
  });
});
