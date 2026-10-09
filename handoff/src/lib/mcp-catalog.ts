/** Servers a workflow step may call. A step cannot name a URL that is not here. */
const MCP_CATALOG = [
  { id: "swarm-demo", name: "Swarm demo", path: "/demo-mcp/mcp" },
  { id: "portal", name: "MCP portal", path: "" },
] as const;

export type CatalogServer = { id: string; name: string; url: string };

/** Catalog ids, in the order given. Null when any id is unknown or repeated. */
export function allowedMcpIds(ids: readonly string[]): string[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const known = new Set<string>(MCP_CATALOG.map((server) => server.id));
  if (ids.some((id) => !known.has(id))) return null;
  return [...ids];
}

/**
 * Catalog servers for a swarm run.
 * `portal` uses the configured portal URL. Every other id is a path on the swarm origin.
 * Null when an id is not allowed, the swarm origin is not https, or `portal` has no https URL.
 */
export function mcpServersFor(ids: readonly string[], origin: string, portalUrl = ""): CatalogServer[] | null {
  const allowed = allowedMcpIds(ids);
  const base = origin.trim().replace(/\/$/, "");
  if (!allowed || !base.startsWith("https://")) return null;
  const portal = portalUrl.trim().replace(/\/$/, "");
  const servers: CatalogServer[] = [];
  for (const id of allowed) {
    if (id === "portal") {
      if (!portal.startsWith("https://")) return null;
      servers.push({ id: "portal", name: "MCP portal", url: portal });
      continue;
    }
    const server = MCP_CATALOG.find((row) => row.id === id);
    if (!server?.path) return null;
    servers.push({ id: server.id, name: server.name, url: `${base}${server.path}` });
  }
  return servers;
}
