import type { AccessCheck, SearchProperty, SearchPropertyStatus } from "./properties";
import type { SyncRunSummary } from "./sync-status";

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

const BACKFILL: Record<SearchProperty["backfill_state"], string> = {
  none: "History not loaded yet. The next daily run loads 16 months, or use Load history.",
  running: "Loading 16 months of history, newest days first.",
  done: "16 months of history loaded.",
  failed: "History loaded with gaps. Load history again to retry the missing days.",
};

/** One line about the data HQ holds for a property: how fresh, history, and the last day's sync runs. */
export function syncSummary(property: Pick<SearchProperty, "data_through" | "backfill_state">, runs: SyncRunSummary | undefined): string {
  const parts = [property.data_through ? `Final data through ${property.data_through}.` : "No final day stored yet.", BACKFILL[property.backfill_state]];
  if (runs && runs.total > 0) {
    const waiting = runs.queued + runs.running;
    parts.push(
      `Last 24 hours: ${runs.done} of ${runs.total} jobs done${waiting ? `, ${waiting} waiting` : ""}${runs.failed ? `, ${runs.failed} failed` : ""}.`,
    );
  }
  return parts.join(" ");
}
