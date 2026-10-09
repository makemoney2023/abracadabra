import type { ConnectorContext, ConnectorModule } from "./registry";

const SEARCH_ANALYTICS = "search_analytics";
const INSPECT_URL = "inspect_url";

export function searchConsoleRequest(
  tool: string,
  resource: string,
  args: Record<string, unknown>,
  token: string,
): { url: string; init: RequestInit } | null {
  if (tool === SEARCH_ANALYTICS) {
    const body: Record<string, unknown> = {};
    if (typeof args.startDate === "string") body.startDate = args.startDate;
    if (typeof args.endDate === "string") body.endDate = args.endDate;
    if (Array.isArray(args.dimensions)) body.dimensions = args.dimensions;
    return {
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(resource)}/searchAnalytics/query`,
      init: {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    };
  }
  if (tool === INSPECT_URL) {
    const inspectionUrl = typeof args.inspectionUrl === "string" ? args.inspectionUrl : "";
    if (!inspectionUrl) return null;
    return {
      url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      init: {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ inspectionUrl, siteUrl: resource }),
      },
    };
  }
  return null;
}

async function call(tool: string, args: Record<string, unknown>, ctx: ConnectorContext): Promise<string> {
  const organizationId = typeof args.organizationId === "string" ? args.organizationId.trim() : "";
  if (!organizationId) throw new Error("organizationId is required.");
  const resource = await ctx.grant(organizationId, "search-console");
  if (!resource) throw new Error("No Search Console property is set for this client.");
  const request = searchConsoleRequest(tool, resource, args, await ctx.accessToken());
  if (!request) throw new Error(`Unknown tool: ${tool}`);
  const response = await ctx.fetchImpl(request.url, request.init);
  const text = await response.text();
  if (!response.ok) throw new Error(text.slice(0, 300) || "Search Console did not answer.");
  return text.slice(0, 4000);
}

export const searchConsole: ConnectorModule = {
  id: "search-console",
  tools: [
    {
      name: SEARCH_ANALYTICS,
      description: "Search analytics for this client's Search Console property.",
      inputSchema: {
        type: "object",
        properties: {
          organizationId: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          dimensions: { type: "array", items: { type: "string" } },
        },
        required: ["organizationId"],
      },
    },
    {
      name: INSPECT_URL,
      description: "Inspect one URL on this client's Search Console property.",
      inputSchema: {
        type: "object",
        properties: {
          organizationId: { type: "string" },
          inspectionUrl: { type: "string" },
        },
        required: ["organizationId", "inspectionUrl"],
      },
    },
  ],
  call,
};
