const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

/** Process env wins when it is set. Otherwise use the Worker binding. */
export function workerEnv(name: string): string {
  const fromProcess = process.env[name]?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: Record<string, unknown> };
  };
  const bound = holder[CLOUDFLARE_CONTEXT]?.env?.[name];
  return typeof bound === "string" ? bound.trim() : "";
}

export function flagEnabled(name: string, explicit?: string): boolean {
  const raw = (explicit !== undefined ? explicit : workerEnv(name)).trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on";
}
