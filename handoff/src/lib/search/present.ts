import type { AccessCheck, SearchPropertyStatus } from "./properties";

/** Staff-facing words for the Search Console card on a client's Settings tab. */

export const PROPERTY_STATUS: Record<SearchPropertyStatus, { label: string; hint: string; tone: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Waiting for access", hint: "The client still needs to add HQ's service account in Search Console.", tone: "secondary" },
  active: { label: "Connected", hint: "HQ can read this property.", tone: "default" },
  access_lost: { label: "Access lost", hint: "The client removed HQ's service account. Ask them to add it again.", tone: "destructive" },
  paused: { label: "Paused", hint: "Staff paused this property.", tone: "outline" },
  removed: { label: "Removed", hint: "No longer mapped.", tone: "outline" },
};

const REASON: Record<string, string> = {
  off: "Search Console is off. It runs when SEARCH_CONSOLE is on for the handoff Worker.",
  missing_key: "No Google key yet. Christopher stores it as the GOOGLE_SA_KEY_JSON secret on the handoff Worker.",
  invalid_key: "The Google key could not be read. Check the GOOGLE_SA_KEY_JSON secret on the handoff Worker.",
  auth: "Google refused HQ's sign-in. The key may have been deleted or rotated.",
  access_lost: "Google refused access on the last check.",
  rate_limited: "Google asked HQ to slow down. The next hourly check will try again.",
  server: "Google had an error. The next hourly check will try again.",
  network: "HQ could not reach Google. The next hourly check will try again.",
};

export function accessSummary(check: AccessCheck | null): { ok: boolean; text: string } {
  if (!check) return { ok: false, text: "HQ has not checked Google access yet. The handoff Worker checks every hour." };
  if (check.ok) return { ok: true, text: `HQ's Google account can read ${check.sites?.length ?? 0} Search Console ${check.sites?.length === 1 ? "property" : "properties"}.` };
  return { ok: false, text: REASON[check.reason ?? ""] ?? "The last Google access check failed." };
}
