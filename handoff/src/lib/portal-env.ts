import type { PortalEnv } from "./portal-session";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type PortalBindings = PortalEnv & { SWARM_RUN_SECRET?: string };

function binding(name: keyof PortalBindings): string {
  const fromProcess = process.env[name]?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: PortalBindings };
  };
  const value = holder[CLOUDFLARE_CONTEXT]?.env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

/** Portal URL, Access token, and the swarm run bearer. Empty strings mean unset. */
export function portalRuntime(): PortalEnv & { runSecret: string } {
  return {
    MCP_PORTAL_URL: binding("MCP_PORTAL_URL"),
    CF_ACCESS_CLIENT_ID: binding("CF_ACCESS_CLIENT_ID"),
    CF_ACCESS_CLIENT_SECRET: binding("CF_ACCESS_CLIENT_SECRET"),
    runSecret: binding("SWARM_RUN_SECRET"),
  };
}
