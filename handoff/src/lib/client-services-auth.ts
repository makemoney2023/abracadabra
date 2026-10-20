import { exportAuthorized } from "@/lib/lead-export";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type Env = Record<string, unknown>;

export function cfEnv(): Env {
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { env?: Env } };
  return holder[CLOUDFLARE_CONTEXT]?.env ?? {};
}

export function envText(name: string): string {
  const fromProcess = process.env[name]?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const value = cfEnv()[name];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Bearer CLIENT_SERVICES_TOKEN. It only opens the /api/client-services/* routes, which can read the
 * update feed and a Space's work, comment, request changes, or approve, and register or assign client agents
 * (/agents mints a filing-only token). Nothing there deploys or deletes.
 */
export function clientServicesAuthorized(request: Request): boolean {
  return exportAuthorized(request.headers.get("authorization"), envText("CLIENT_SERVICES_TOKEN"));
}

export function hqOrigin(request: Request): string {
  return envText("HQ_ORIGIN") || new URL(request.url).origin;
}
