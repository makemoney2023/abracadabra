import { describe, expect, it } from "vitest";
import { callerForClientWork, mcpConnectTarget, mcpHttpCaller } from "./mcp-connect";

describe("mcp connect target", () => {
  it("uses the portal and the access headers when the portal is set", () => {
    expect(
      mcpConnectTarget({
        MCP_PORTAL_URL: "https://mcp.abra-ca-dabra.app/mcp",
        HANDOFF_MCP_URL: "https://hq.abra-ca-dabra.app/api/mcp",
        AGENT_MCP_TOKEN: "hk_secret",
        CF_ACCESS_CLIENT_ID: "id",
        CF_ACCESS_CLIENT_SECRET: "secret",
      }),
    ).toEqual({
      url: "https://mcp.abra-ca-dabra.app/mcp",
      headers: {
        "CF-Access-Client-Id": "id",
        "CF-Access-Client-Secret": "secret",
      },
    });
  });

  it("uses the Handoff route and the agent key when the portal is empty", () => {
    expect(
      mcpConnectTarget({
        MCP_PORTAL_URL: "",
        HANDOFF_MCP_URL: "https://hq.abra-ca-dabra.app/api/mcp",
        AGENT_MCP_TOKEN: "hk_secret",
      }),
    ).toEqual({
      url: "https://hq.abra-ca-dabra.app/api/mcp",
      headers: { Authorization: "Bearer hk_secret" },
    });
  });

  it("connects to nothing when neither portal nor key is set", () => {
    expect(mcpConnectTarget({ MCP_PORTAL_URL: "", HANDOFF_MCP_URL: "https://hq.abra-ca-dabra.app/api/mcp" })).toBeNull();
    expect(mcpConnectTarget({})).toBeNull();
  });

  it("calls a tool over JSON-RPC and unwraps the text result", async () => {
    const caller = mcpHttpCaller(
      { MCP_PORTAL_URL: "", HANDOFF_MCP_URL: "https://hq.abra-ca-dabra.app/api/mcp", AGENT_MCP_TOKEN: "hk_secret" },
      (async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; params?: { name?: string } };
        expect(body.method).toBe("tools/call");
        expect(body.params?.name).toBe("client_context");
        return Response.json({ result: { content: [{ type: "text", text: "{\"ok\":true}" }] } });
      }) as typeof fetch,
    );
    expect(caller).not.toBeNull();
    expect(await caller?.("client_context", {})).toEqual({ ok: true });
  });

  it("returns no caller when the route has no key", () => {
    expect(mcpHttpCaller({ MCP_PORTAL_URL: "", HANDOFF_MCP_URL: "https://hq.abra-ca-dabra.app/api/mcp" })).toBeNull();
  });

  it("uses the Handoff route when the portal caller is missing", async () => {
    const http = async () => "http";
    const portal = async () => "portal";
    const handoff = callerForClientWork(null, http);
    const preferred = callerForClientWork(portal, http);
    expect(callerForClientWork(null, null)).toBeNull();
    expect(handoff).not.toBeNull();
    expect(preferred).not.toBeNull();
    expect(await handoff?.("client_context", {})).toBe("http");
    expect(await preferred?.("client_context", {})).toBe("portal");
  });
});
