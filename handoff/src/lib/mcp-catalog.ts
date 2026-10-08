/** Servers a workflow step may call. A step cannot name a URL that is not here. */
const MCP_CATALOG = [{ id: "swarm-demo", name: "Swarm demo", path: "/demo-mcp/mcp" }] as const;

export type CatalogServer = { id: string; name: string; url: string };

/** Catalog ids, in the order given. Null when any id is unknown or repeated. */
export function allowedMcpIds(ids: readonly string[]): string[] | null {
  if (new Set(ids).size !== ids.length) return null;
  const known = new Set<string>(MCP_CATALOG.map((server) => server.id));
  if (ids.some((id) => !known.has(id))) return null;
  return [...ids];
}

/** Catalog servers addressed on this swarm. Null when an id is not allowed or the origin is not https. */
export function mcpServersFor(ids: readonly string[], origin: string): CatalogServer[] | null {
  const allowed = allowedMcpIds(ids);
  const base = origin.trim().replace(/\/$/, "");
  if (!allowed || !base.startsWith("https://")) return null;
  return allowed.flatMap((id) => {
    const server = MCP_CATALOG.find((row) => row.id === id);
    return server ? [{ id: server.id, name: server.name, url: `${base}${server.path}` }] : [];
  });
}
