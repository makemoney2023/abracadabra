import { describe, expect, it } from "vitest";
import { allowedMcpIds, mcpServersFor } from "./mcp-catalog";

describe("mcp catalog", () => {
  it("resolves an allowed server on the swarm origin", () => {
    expect(allowedMcpIds(["swarm-demo"])).toEqual(["swarm-demo"]);
    expect(mcpServersFor(["swarm-demo"], "https://swarm.example/")).toEqual([
      { id: "swarm-demo", name: "Swarm demo", url: "https://swarm.example/demo-mcp/mcp" },
    ]);
  });

  it("rejects a server that is not on the list", () => {
    expect(allowedMcpIds(["https://evil.example/mcp"])).toBeNull();
    expect(mcpServersFor(["swarm-demo"], "http://swarm.example")).toBeNull();
    expect(mcpServersFor(["swarm-demo", "swarm-demo"], "https://swarm.example")).toBeNull();
  });

  it("resolves the portal on its own URL and keeps the demo on the swarm origin", () => {
    expect(allowedMcpIds(["portal", "swarm-demo"])).toEqual(["portal", "swarm-demo"]);
    expect(mcpServersFor(["portal", "swarm-demo"], "https://swarm.example", "https://mcp.example/mcp")).toEqual([
      { id: "portal", name: "MCP portal", url: "https://mcp.example/mcp" },
      { id: "swarm-demo", name: "Swarm demo", url: "https://swarm.example/demo-mcp/mcp" },
    ]);
    expect(mcpServersFor(["portal"], "https://swarm.example", "http://mcp.example/mcp")).toBeNull();
  });
});
