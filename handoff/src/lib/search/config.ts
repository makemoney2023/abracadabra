import { flagEnabled } from "@/lib/worker-env";
import { parseServiceAccountKey, type ServiceAccountKey } from "./google-auth";

export type SearchConsoleEnv = { SEARCH_CONSOLE?: unknown; GOOGLE_SA_KEY_JSON?: unknown };

export type SearchConsoleConfig =
  | { ok: true; key: ServiceAccountKey }
  | { ok: false; reason: "off" | "missing_key" | "invalid_key" };

/**
 * Fail closed. Search Console runs only when SEARCH_CONSOLE is 1, true or on AND GOOGLE_SA_KEY_JSON parses as a
 * service-account key. Never throws, never returns the raw secret, so a missing or broken secret cannot take down a route.
 */
export function searchConsoleConfig(env: SearchConsoleEnv | undefined | null): SearchConsoleConfig {
  const flag = typeof env?.SEARCH_CONSOLE === "string" ? env.SEARCH_CONSOLE : "";
  if (!flagEnabled("SEARCH_CONSOLE", flag)) return { ok: false, reason: "off" };
  const raw = env?.GOOGLE_SA_KEY_JSON;
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, reason: "missing_key" };
  const key = parseServiceAccountKey(raw);
  if (!key) return { ok: false, reason: "invalid_key" };
  return { ok: true, key };
}
