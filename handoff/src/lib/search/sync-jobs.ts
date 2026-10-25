import type { SearchDimension } from "./gsc";

/**
 * Messages on the search-sync queue. The daily cron and staff "Sync now"/"Backfill" only send `plan` messages; the
 * consumer on the handoff Worker turns a plan into one message per (day, request), one sitemaps message, one inspect
 * message and one retention message, so each message is small, retried on its own, and idempotent.
 */

export const ANALYTICS_REQUESTS = {
  site: ["date"],
  page: ["date", "page"],
  query: ["date", "query"],
  query_page: ["date", "query", "page"],
  segment: ["date", "country", "device"],
  raw: ["date", "query", "page", "country", "device"],
} as const satisfies Record<string, readonly SearchDimension[]>;

export type AnalyticsRequest = keyof typeof ANALYTICS_REQUESTS;
const REQUESTS = new Set<string>(Object.keys(ANALYTICS_REQUESTS));

export type PlanJob = { v: 1; kind: "plan"; propertyId: string; mode: "daily" | "backfill"; includeRaw?: boolean };
export type AnalyticsJob = { v: 1; kind: "analytics"; propertyId: string; runId: string; day: string; request: AnalyticsRequest; backfill?: boolean };
export type SitemapsJob = { v: 1; kind: "sitemaps"; propertyId: string; runId: string };
export type InspectJob = { v: 1; kind: "inspect"; propertyId: string; runId: string };
export type RetentionJob = { v: 1; kind: "retention"; propertyId: string };
export type SearchJob = PlanJob | AnalyticsJob | SitemapsJob | InspectJob | RetentionJob;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseSearchJob(body: unknown): SearchJob | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  if (raw.v !== 1 || typeof raw.propertyId !== "string" || !ID.test(raw.propertyId)) return null;
  const propertyId = raw.propertyId;
  const runId = typeof raw.runId === "string" && ID.test(raw.runId) ? raw.runId : null;
  switch (raw.kind) {
    case "plan":
      if (raw.mode !== "daily" && raw.mode !== "backfill") return null;
      return { v: 1, kind: "plan", propertyId, mode: raw.mode, ...(raw.includeRaw === true ? { includeRaw: true } : {}) };
    case "analytics":
      if (!runId || typeof raw.day !== "string" || !DAY.test(raw.day) || typeof raw.request !== "string" || !REQUESTS.has(raw.request)) return null;
      return { v: 1, kind: "analytics", propertyId, runId, day: raw.day, request: raw.request as AnalyticsRequest, backfill: raw.backfill === true };
    case "sitemaps":
    case "inspect":
      return runId ? { v: 1, kind: raw.kind, propertyId, runId } : null;
    case "retention":
      return { v: 1, kind: "retention", propertyId };
    default:
      return null;
  }
}

// ---------- Dates (UTC calendar days, 'YYYY-MM-DD') ----------

const DAY_MS = 86_400_000;

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS);
}

/** Same day of the month `months` earlier, clamped to the month's last day. */
export function monthsBefore(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return utcDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(date, last)));
}

/** Google's data lags 2-3 days, so every daily run re-pulls D-4..D-1 and upserts by natural key. */
export const DAILY_WINDOW_DAYS = 4;
/** The last 3 days are pulled with dataState "all" and stored with is_final = 0. */
export const NOT_FINAL_DAYS = 3;
/** Google keeps 16 months of Search Analytics. */
export const HISTORY_MONTHS = 16;

export function dailyWindow(now: number): string[] {
  const today = utcDay(now);
  return Array.from({ length: DAILY_WINDOW_DAYS }, (_, index) => addDays(today, index - DAILY_WINDOW_DAYS));
}

export function isFinalDay(day: string, now: number): boolean {
  return day < addDays(utcDay(now), -NOT_FINAL_DAYS);
}

/** Every day older than the daily window, back 16 months, newest first so recent history fills in first. */
export function backfillDays(now: number): string[] {
  const today = utcDay(now);
  const newest = addDays(today, -DAILY_WINDOW_DAYS - 1);
  const oldest = addDays(monthsBefore(addDays(today, -1), HISTORY_MONTHS), 1);
  const days: string[] = [];
  for (let day = newest; day >= oldest; day = addDays(day, -1)) days.push(day);
  return days;
}
