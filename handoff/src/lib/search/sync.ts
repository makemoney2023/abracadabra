import { organizationById } from "@/db/crm";
import { migrateSearch } from "@/db/migrate-search";
import { d1Sql, type D1Like, type Sql, type SqlStatement } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { searchConsoleConfig, type SearchConsoleEnv } from "./config";
import { describeSearchError, isSearchApiError, SearchApiError } from "./errors";
import { exportRaw, rawExportKey, writeAnalyticsDay, type RawBucket } from "./facts";
import { sharedTokenProvider } from "./google-auth";
import { createGscClient, type GscClient } from "./gsc";
import { pickInspectionCandidates, recordInspection } from "./inspection";
import { readableSites, searchActivity } from "./properties";
import { runSearchRetention } from "./retention";
import { collectSitemapUrls } from "./sitemap-urls";
import {
  ANALYTICS_REQUESTS,
  backfillDays,
  dailyWindow,
  isFinalDay,
  parseSearchJob,
  utcDay,
  type AnalyticsJob,
  type AnalyticsRequest,
  type InspectJob,
  type PlanJob,
  type SearchJob,
  type SitemapsJob,
} from "./sync-jobs";
import { createGlobalThrottle } from "./throttle";

/**
 * The Search Console sync pipeline (spec section 7).
 * - The daily cron (30 8 * * *) on the handoff Worker and staff "Sync now"/"Backfill" on handoff-hq only enqueue `plan`
 *   messages on the search-sync queue. Nothing here calls Google from a cron or from HQ.
 * - The queue consumer on handoff turns a plan into small jobs and runs them: Search Analytics one day per request,
 *   sitemaps, URL Inspection within the property's daily budget, then retention.
 * - Fail closed: with SEARCH_CONSOLE off or no usable GOOGLE_SA_KEY_JSON, the cron enqueues nothing and the consumer
 *   acknowledges messages without calling Google.
 */

export const SEARCH_SYNC_QUEUE = "search-sync";
export const SEARCH_SYNC_CRON = "30 8 * * *";
/** wrangler.jsonc max_retries is 5, so a message gets 6 attempts before the dead-letter queue. */
export const MAX_ATTEMPTS = 6;
export const INSPECT_PER_MESSAGE = 50;
export const INSPECT_DELAY_SECONDS = 15 * 60;
export const RETENTION_DELAY_SECONDS = 30 * 60;
const SEND_BATCH = 100;
const RUN_INSERT_CHUNK = 500;
const DAILY_PLAN_GUARD_MS = 12 * 3_600_000;
const SYNC_RUNS_KEEP_MS = 180 * 86_400_000;
const DAILY_REQUESTS: AnalyticsRequest[] = ["site", "page", "query", "query_page", "segment", "raw"];
const BACKFILL_REQUESTS: AnalyticsRequest[] = ["site", "page", "query", "query_page", "segment"];

export type SearchQueue = {
  send(body: SearchJob, options?: { delaySeconds?: number }): Promise<unknown>;
  sendBatch(messages: { body: SearchJob; delaySeconds?: number }[]): Promise<unknown>;
};

export type SearchMessage = {
  body: unknown;
  attempts?: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
};

export type SearchSyncEnv = SearchConsoleEnv & {
  /** The handoff database (search_properties, search_sync_runs, activities). */
  DB?: D1Like;
  SEARCH_DB?: D1Like;
  SEARCH_SYNC?: SearchQueue;
  FILES?: RawBucket;
};

async function sendAll(queue: SearchQueue, messages: { body: SearchJob; delaySeconds?: number }[]): Promise<void> {
  for (let index = 0; index < messages.length; index += SEND_BATCH) {
    await queue.sendBatch(messages.slice(index, index + SEND_BATCH));
  }
}

// ---------- Producers: cron and staff (enqueue only) ----------

/**
 * Daily cron: one `plan daily` message per active property, plus `plan backfill` for an active property that was never
 * backfilled. Reads the handoff database only; never calls Google.
 */
export async function enqueueDailySearchSync(input: {
  sql: Sql;
  env: SearchConsoleEnv | undefined | null;
  queue: SearchQueue | undefined;
}): Promise<{ enqueued: number; reason?: string }> {
  const config = searchConsoleConfig(input.env);
  if (!config.ok) return { enqueued: 0, reason: config.reason };
  if (!input.queue) return { enqueued: 0, reason: "no_queue" };
  const properties = await input.sql.all<{ id: string; backfill_state: string }>(
    "SELECT id, backfill_state FROM search_properties WHERE provider = 'gsc' AND status = 'active' ORDER BY created_at",
  );
  const messages: { body: SearchJob }[] = [];
  for (const property of properties) {
    messages.push({ body: { v: 1, kind: "plan", propertyId: property.id, mode: "daily" } });
    if (property.backfill_state === "none") messages.push({ body: { v: 1, kind: "plan", propertyId: property.id, mode: "backfill" } });
  }
  await sendAll(input.queue, messages);
  return { enqueued: messages.length };
}

/** The daily cron entry. Any other cron is a no-op; errors are logged, never thrown into the scheduler. */
export async function runSearchSyncCron(input: {
  sql: Sql;
  env: SearchConsoleEnv | undefined | null;
  queue: SearchQueue | undefined;
  cron: string;
}): Promise<void> {
  if (input.cron !== SEARCH_SYNC_CRON) return;
  try {
    await enqueueDailySearchSync(input);
  } catch (error) {
    console.error(error instanceof Error ? `Search sync enqueue failed: ${error.message}` : "Search sync enqueue failed.");
  }
}

export type RequestSyncError = "missing" | "inactive" | "no_queue" | "running";

/** Staff "Sync now" (last 4 days) or "Backfill" (16 months) from handoff-hq: checks access, then only enqueues. */
export async function requestSearchSync(
  sql: Sql,
  caller: Caller,
  input: { organizationId: string; propertyId: string; mode: "daily" | "backfill"; queue: SearchQueue | undefined },
): Promise<{ ok: true } | { ok: false; error: RequestSyncError }> {
  const organization = await organizationById(sql, caller, input.organizationId);
  if (!organization || !caller.userId) return { ok: false, error: "missing" };
  const property = await sql.get<{ id: string; status: string; backfill_state: string }>(
    "SELECT id, status, backfill_state FROM search_properties WHERE id = ? AND organization_id = ? AND status <> 'removed'",
    [input.propertyId, input.organizationId],
  );
  if (!property) return { ok: false, error: "missing" };
  if (property.status !== "active") return { ok: false, error: "inactive" };
  if (input.mode === "backfill" && property.backfill_state === "running") return { ok: false, error: "running" };
  if (!input.queue) return { ok: false, error: "no_queue" };
  await input.queue.send({ v: 1, kind: "plan", propertyId: property.id, mode: input.mode });
  return { ok: true };
}

// ---------- Consumer ----------

type Property = {
  id: string;
  organization_id: string;
  site_url: string;
  status: string;
  inspect_budget: number;
  backfill_state: string;
};

export type SyncDeps = {
  sql: Sql;
  searchSql: Sql;
  queue?: SearchQueue;
  bucket?: RawBucket;
  /** A Search Console client whose HTTP attempts are counted into `counter.calls` (and throttled). */
  gsc(counter: { calls: number }): GscClient;
  now(): number;
  fetchImpl?: typeof fetch;
  clientEmail: string;
};

let searchSchema: Promise<void> | null = null;

/** Builds the consumer's dependencies from the Worker env, or acknowledges the batch and stops (fail closed). */
export async function runSearchSyncBatch(messages: SearchMessage[], env: SearchSyncEnv): Promise<void> {
  const config = searchConsoleConfig(env);
  if (!config.ok) {
    for (const message of messages) message.ack();
    console.warn(`Search sync skipped ${messages.length} message(s): ${config.reason}.`);
    return;
  }
  if (!env.SEARCH_DB) {
    for (const message of messages) message.ack();
    console.error("Search sync skipped: SEARCH_DB is not bound.");
    return;
  }
  const db = env.DB;
  if (!db) {
    for (const message of messages) message.retry({ delaySeconds: 300 });
    return;
  }
  const searchSql = d1Sql(env.SEARCH_DB);
  searchSchema ??= migrateSearch(searchSql).catch((error: unknown) => {
    searchSchema = null;
    throw error;
  });
  try {
    await searchSchema;
  } catch (error) {
    console.error(error instanceof Error ? `Search DB migration failed: ${error.message}` : "Search DB migration failed.");
    for (const message of messages) message.retry({ delaySeconds: 300 });
    return;
  }
  const tokens = sharedTokenProvider(config.key);
  const throttle = createGlobalThrottle({ sql: searchSql });
  await handleSearchSyncBatch(messages, {
    sql: d1Sql(db),
    searchSql,
    queue: env.SEARCH_SYNC,
    bucket: env.FILES,
    clientEmail: config.key.clientEmail,
    now: Date.now,
    gsc: (counter) =>
      createGscClient({
        tokens,
        maxRetries: 2,
        beforeRequest: async () => {
          await throttle.acquire();
          counter.calls += 1;
        },
      }),
  });
}

/** One message at a time (the global throttle paces Google calls). Never throws: each message is acked or retried. */
export async function handleSearchSyncBatch(messages: SearchMessage[], deps: SyncDeps): Promise<void> {
  for (const message of messages) {
    try {
      await processMessage(message, deps);
    } catch (error) {
      console.error(`Search sync message failed: ${describeSearchError(error)}`);
      message.retry({ delaySeconds: 120 });
    }
  }
}

async function loadProperty(sql: Sql, id: string): Promise<Property | undefined> {
  return sql.get<Property>(
    "SELECT id, organization_id, site_url, status, inspect_budget, backfill_state FROM search_properties WHERE id = ? AND provider = 'gsc'",
    [id],
  );
}

function runIdOf(job: SearchJob): string | null {
  return "runId" in job ? job.runId : null;
}

async function processMessage(message: SearchMessage, deps: SyncDeps): Promise<void> {
  const job = parseSearchJob(message.body);
  if (!job) {
    console.error("Search sync dropped an unreadable message.");
    message.ack();
    return;
  }
  const property = await loadProperty(deps.sql, job.propertyId);
  const runId = runIdOf(job);
  if (!property || property.status !== "active") {
    // Paused, removed, access lost or unknown: stop pulling. The hourly access check restores active properties.
    if (runId) await finishRun(deps.sql, runId, "failed", deps.now(), { error: "property_inactive" });
    if (property && job.kind === "analytics" && job.backfill) await settleBackfill(deps.sql, property, deps.now());
    message.ack();
    return;
  }
  try {
    switch (job.kind) {
      case "plan":
        await runPlan(job, property, deps);
        break;
      case "analytics":
        await runAnalytics(job, property, deps);
        break;
      case "sitemaps":
        await runSitemaps(job, property, deps);
        break;
      case "inspect":
        await runInspect(job, property, deps);
        break;
      case "retention":
        await runSearchRetention({ sql: deps.searchSql, organizationId: property.organization_id, propertyId: property.id, now: deps.now() });
        await deps.sql.run(
          "DELETE FROM search_sync_runs WHERE rowid IN (SELECT rowid FROM search_sync_runs WHERE property_id = ? AND created_at < ? LIMIT 1000)",
          [property.id, deps.now() - SYNC_RUNS_KEEP_MS],
        );
        break;
    }
    message.ack();
  } catch (error) {
    await handleFailure(job, property, message, error, deps);
  }
}

async function handleFailure(job: SearchJob, property: Property, message: SearchMessage, error: unknown, deps: SyncDeps): Promise<void> {
  const now = deps.now();
  const runId = runIdOf(job);
  const text = describeSearchError(error);
  const backfill = job.kind === "analytics" && job.backfill === true;
  if (isSearchApiError(error) && error.kind === "access_lost" && (await accessReallyLost(property, deps))) {
    await markAccessLost(deps.sql, property, deps.clientEmail, now);
    if (runId) await finishRun(deps.sql, runId, "failed", now, { error: text });
    if (backfill) await settleBackfill(deps.sql, property, now);
    message.ack();
    return;
  }
  const permanent = isSearchApiError(error) && (error.kind === "bad_request" || error.kind === "not_found" || error.kind === "not_configured");
  const final = permanent || (message.attempts ?? 1) >= MAX_ATTEMPTS;
  if (runId) await finishRun(deps.sql, runId, final ? "failed" : "queued", now, { error: text });
  await deps.sql.run(
    "UPDATE search_properties SET last_error = ?, consecutive_failures = consecutive_failures + 1, updated_at = ? WHERE id = ?",
    [text, now, property.id],
  );
  if (final && backfill) await settleBackfill(deps.sql, property, now);
  if (permanent) {
    message.ack();
    return;
  }
  const attempts = Math.max(1, message.attempts ?? 1);
  const delaySeconds = isSearchApiError(error) && error.kind === "rate_limited"
    ? Math.max(60, Math.ceil((error.retryAfterMs ?? 0) / 1000))
    : Math.min(60 * 2 ** (attempts - 1), 900);
  message.retry({ delaySeconds });
}

/** A 403 counts as lost access only when sites.list confirms the property is gone; otherwise it is retried. */
async function accessReallyLost(property: Property, deps: SyncDeps): Promise<boolean> {
  try {
    const sites = await deps.gsc({ calls: 0 }).listSites();
    return !readableSites(sites).has(property.site_url);
  } catch {
    return false;
  }
}

async function markAccessLost(sql: Sql, property: Property, clientEmail: string, now: number): Promise<void> {
  const current = await sql.get<{ status: string }>("SELECT status FROM search_properties WHERE id = ?", [property.id]);
  if (current?.status !== "active") return;
  await sql.batch([
    {
      statement: `UPDATE search_properties SET status = 'access_lost', permission_level = NULL, last_checked_at = ?, last_error = 'access_lost',
                  updated_at = ? WHERE id = ? AND status = 'active'`,
      params: [now, now, property.id],
    },
    searchActivity(
      property.organization_id,
      "search.access_lost",
      "system",
      null,
      `HQ lost Search Console access to ${property.site_url}. The client needs to add ${clientEmail} again.`,
      { property_id: property.id, site_url: property.site_url, source: "sync" },
      now,
    ),
  ]);
}

// ---------- Runs (search_sync_runs in the handoff database) ----------

type NewRun = { id: string; kind: "daily" | "backfill" | "inspect" | "sitemaps"; day: string | null };

async function insertRuns(sql: Sql, propertyId: string, runs: NewRun[], now: number): Promise<void> {
  const statements: SqlStatement[] = [];
  for (let index = 0; index < runs.length; index += RUN_INSERT_CHUNK) {
    const chunk = runs.slice(index, index + RUN_INSERT_CHUNK).map((run) => [run.id, run.kind, run.day]);
    statements.push({
      statement: `INSERT INTO search_sync_runs (id, property_id, kind, day, status, created_at)
                  SELECT json_extract(value, '$[0]'), ?, json_extract(value, '$[1]'), json_extract(value, '$[2]'), 'queued', ? FROM json_each(?)`,
      params: [propertyId, now, JSON.stringify(chunk)],
    });
  }
  for (let index = 0; index < statements.length; index += 10) await sql.batch(statements.slice(index, index + 10));
}

async function runStatus(sql: Sql, runId: string): Promise<string | null> {
  const row = await sql.get<{ status: string }>("SELECT status FROM search_sync_runs WHERE id = ?", [runId]);
  return row?.status ?? null;
}

async function startRun(sql: Sql, runId: string, now: number): Promise<void> {
  await sql.run("UPDATE search_sync_runs SET status = 'running', started_at = coalesce(started_at, ?) WHERE id = ?", [now, runId]);
}

async function finishRun(
  sql: Sql,
  runId: string,
  status: "done" | "failed" | "queued",
  now: number,
  options: { rows?: number; calls?: number; error?: string | null } = {},
): Promise<void> {
  await sql.run(
    `UPDATE search_sync_runs SET status = ?, rows_written = rows_written + ?, api_calls = api_calls + ?, error = ?,
       finished_at = CASE WHEN ? = 'queued' THEN finished_at ELSE ? END
     WHERE id = ?`,
    [status, options.rows ?? 0, options.calls ?? 0, options.error ?? null, status, now, runId],
  );
}

async function propertySucceeded(sql: Sql, propertyId: string, now: number, dataThrough?: string): Promise<void> {
  await sql.run(
    `UPDATE search_properties SET last_success_at = ?, last_error = NULL, consecutive_failures = 0, updated_at = ?,
       data_through = CASE WHEN ? IS NOT NULL AND (data_through IS NULL OR data_through < ?) THEN ? ELSE data_through END
     WHERE id = ?`,
    [now, now, dataThrough ?? null, dataThrough ?? null, dataThrough ?? null, propertyId],
  );
}

/** When no backfill run is left queued or running, the property's backfill is done (or failed if any run failed). */
async function settleBackfill(sql: Sql, property: Property, now: number): Promise<void> {
  const open = await sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM search_sync_runs WHERE property_id = ? AND kind = 'backfill' AND status IN ('queued', 'running')",
    [property.id],
  );
  if ((open?.n ?? 0) > 0) return;
  const current = await sql.get<{ backfill_state: string }>("SELECT backfill_state FROM search_properties WHERE id = ?", [property.id]);
  if (current?.backfill_state !== "running") return;
  const failed = await sql.get<{ n: number }>(
    "SELECT count(*) AS n FROM search_sync_runs WHERE property_id = ? AND kind = 'backfill' AND status = 'failed'",
    [property.id],
  );
  const state = (failed?.n ?? 0) > 0 ? "failed" : "done";
  await sql.batch([
    { statement: "UPDATE search_properties SET backfill_state = ?, updated_at = ? WHERE id = ? AND backfill_state = 'running'", params: [state, now, property.id] },
    searchActivity(
      property.organization_id,
      "search.backfill_finished",
      "system",
      null,
      state === "done"
        ? `Search Console history for ${property.site_url} is loaded.`
        : `Search Console history for ${property.site_url} loaded with ${failed?.n ?? 0} failed day request(s).`,
      { property_id: property.id, site_url: property.site_url, failed: failed?.n ?? 0 },
      now,
    ),
  ]);
}

// ---------- Jobs ----------

async function runPlan(job: PlanJob, property: Property, deps: SyncDeps): Promise<void> {
  const now = deps.now();
  if (!deps.queue) throw new SearchApiError("not_configured", 0, "no_queue");
  const runs: NewRun[] = [];
  const messages: { body: SearchJob; delaySeconds?: number }[] = [];
  if (job.mode === "daily") {
    const busy = await deps.sql.get<{ id: string }>(
      "SELECT id FROM search_sync_runs WHERE property_id = ? AND kind = 'daily' AND status IN ('queued', 'running') AND created_at > ? LIMIT 1",
      [property.id, now - DAILY_PLAN_GUARD_MS],
    );
    if (busy) return;
    const sitemapsRun = crypto.randomUUID();
    runs.push({ id: sitemapsRun, kind: "sitemaps", day: null });
    messages.push({ body: { v: 1, kind: "sitemaps", propertyId: property.id, runId: sitemapsRun } });
    const requests = DAILY_REQUESTS.filter((request) => request !== "raw" || deps.bucket);
    for (const day of [...dailyWindow(now)].reverse()) {
      for (const request of requests) {
        const id = crypto.randomUUID();
        runs.push({ id, kind: "daily", day });
        messages.push({ body: { v: 1, kind: "analytics", propertyId: property.id, runId: id, day, request } });
      }
    }
    const inspectRun = crypto.randomUUID();
    runs.push({ id: inspectRun, kind: "inspect", day: utcDay(now) });
    messages.push({ body: { v: 1, kind: "inspect", propertyId: property.id, runId: inspectRun }, delaySeconds: INSPECT_DELAY_SECONDS });
    messages.push({ body: { v: 1, kind: "retention", propertyId: property.id }, delaySeconds: RETENTION_DELAY_SECONDS });
  } else {
    if (property.backfill_state === "running") {
      const open = await deps.sql.get<{ id: string }>(
        "SELECT id FROM search_sync_runs WHERE property_id = ? AND kind = 'backfill' AND status IN ('queued', 'running') LIMIT 1",
        [property.id],
      );
      if (open) return;
    }
    const requests = BACKFILL_REQUESTS.concat(job.includeRaw && deps.bucket ? ["raw"] : []);
    for (const day of backfillDays(now)) {
      for (const request of requests) {
        const id = crypto.randomUUID();
        runs.push({ id, kind: "backfill", day });
        messages.push({ body: { v: 1, kind: "analytics", propertyId: property.id, runId: id, day, request, backfill: true } });
      }
    }
  }
  await insertRuns(deps.sql, property.id, runs, now);
  try {
    await sendAll(deps.queue, messages);
  } catch (error) {
    // Nothing (or only part) was queued: drop the queued rows so the next plan is not blocked, then retry the plan.
    await deps.sql.run("DELETE FROM search_sync_runs WHERE property_id = ? AND status = 'queued' AND created_at = ?", [property.id, now]);
    throw error;
  }
  if (job.mode === "backfill") {
    const days = runs.length / Math.max(1, BACKFILL_REQUESTS.length + (job.includeRaw && deps.bucket ? 1 : 0));
    await deps.sql.batch([
      { statement: "UPDATE search_properties SET backfill_state = 'running', updated_at = ? WHERE id = ?", params: [now, property.id] },
      searchActivity(
        property.organization_id,
        "search.backfill_started",
        "system",
        null,
        `Loading 16 months of Search Console history for ${property.site_url} (${days} days, newest first).`,
        { property_id: property.id, site_url: property.site_url, days, jobs: runs.length },
        now,
      ),
    ]);
  }
}

async function runAnalytics(job: AnalyticsJob, property: Property, deps: SyncDeps): Promise<void> {
  if ((await runStatus(deps.sql, job.runId)) === "done") return; // redelivered after success
  const now = deps.now();
  await startRun(deps.sql, job.runId, now);
  if (job.request === "raw" && !deps.bucket) throw new SearchApiError("not_configured", 0, "no_bucket");
  const counter = { calls: 0 };
  const isFinal = isFinalDay(job.day, now);
  const rows = await deps.gsc(counter).querySearchAnalytics(property.site_url, {
    startDate: job.day,
    endDate: job.day,
    dimensions: [...ANALYTICS_REQUESTS[job.request]],
    type: "web",
    dataState: isFinal ? "final" : "all",
  });
  let written: number;
  if (job.request === "raw") {
    written = await exportRaw({ bucket: deps.bucket!, key: rawExportKey(property.organization_id, property.id, job.day, "raw"), request: "raw", rows });
  } else {
    written = await writeAnalyticsDay({
      sql: deps.searchSql,
      organizationId: property.organization_id,
      propertyId: property.id,
      day: job.day,
      request: job.request,
      rows,
      isFinal,
    });
    if (job.request === "query_page" && deps.bucket) {
      await exportRaw({ bucket: deps.bucket, key: rawExportKey(property.organization_id, property.id, job.day, "query_page"), request: "query_page", rows });
    }
  }
  const finished = deps.now();
  await finishRun(deps.sql, job.runId, "done", finished, { rows: written, calls: counter.calls });
  await propertySucceeded(deps.sql, property.id, finished, job.request === "site" && isFinal ? job.day : undefined);
  if (job.backfill) await settleBackfill(deps.sql, property, finished);
}

async function runSitemaps(job: SitemapsJob, property: Property, deps: SyncDeps): Promise<void> {
  if ((await runStatus(deps.sql, job.runId)) === "done") return;
  const now = deps.now();
  await startRun(deps.sql, job.runId, now);
  const counter = { calls: 0 };
  const sitemaps = await deps.gsc(counter).listSitemaps(property.site_url);
  const listed = sitemaps.filter((entry) => entry.path).map((entry) => [
    entry.path, entry.lastSubmitted, entry.lastDownloaded, entry.isPending ? 1 : 0, entry.errors, entry.warnings, entry.submitted,
  ]);
  await deps.searchSql.batch([
    { statement: "DELETE FROM search_sitemaps WHERE property_id = ?", params: [property.id] },
    ...(listed.length
      ? [{
          statement: `INSERT INTO search_sitemaps (property_id, path, organization_id, last_submitted, last_downloaded, is_pending, errors, warnings,
                        submitted_urls, fetched_at)
                      SELECT ?, json_extract(value, '$[0]'), ?, json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'),
                             json_extract(value, '$[4]'), json_extract(value, '$[5]'), json_extract(value, '$[6]'), ?
                      FROM json_each(?) WHERE true
                      ON CONFLICT (property_id, path) DO NOTHING`,
          params: [property.id, property.organization_id, now, JSON.stringify(listed)],
        }]
      : []),
  ]);
  const collected = await collectSitemapUrls({
    siteUrl: property.site_url,
    sitemapPaths: sitemaps.map((entry) => entry.path).filter(Boolean),
    fetchImpl: deps.fetchImpl,
  });
  const statements: SqlStatement[] = [];
  for (let index = 0; index < collected.urls.length; index += 500) {
    const chunk = collected.urls.slice(index, index + 500).map((entry) => [entry.url, entry.lastmod]);
    statements.push({
      statement: `INSERT INTO search_pages (property_id, url, in_sitemap, sitemap_lastmod, sitemap_seen_at, sitemap_changed_at)
                  SELECT ?, json_extract(value, '$[0]'), 1, json_extract(value, '$[1]'), ?, ? FROM json_each(?) WHERE true
                  ON CONFLICT (property_id, url) DO UPDATE SET
                    sitemap_changed_at = CASE
                      WHEN search_pages.in_sitemap = 0 OR coalesce(search_pages.sitemap_lastmod, '') <> coalesce(excluded.sitemap_lastmod, '')
                      THEN excluded.sitemap_seen_at ELSE search_pages.sitemap_changed_at END,
                    in_sitemap = 1, sitemap_lastmod = excluded.sitemap_lastmod, sitemap_seen_at = excluded.sitemap_seen_at`,
      params: [property.id, now, now, JSON.stringify(chunk)],
    });
  }
  if (collected.complete) {
    // Only a complete read may say a URL left the sitemap.
    statements.push({
      statement: "UPDATE search_pages SET in_sitemap = 0 WHERE property_id = ? AND in_sitemap = 1 AND (sitemap_seen_at IS NULL OR sitemap_seen_at < ?)",
      params: [property.id, now],
    });
  }
  for (let index = 0; index < statements.length; index += 10) await deps.searchSql.batch(statements.slice(index, index + 10));
  const finished = deps.now();
  await finishRun(deps.sql, job.runId, "done", finished, {
    rows: listed.length + collected.urls.length,
    calls: counter.calls,
    error: collected.complete ? null : "sitemap_partial",
  });
  await propertySucceeded(deps.sql, property.id, finished);
}

async function runInspect(job: InspectJob, property: Property, deps: SyncDeps): Promise<void> {
  if ((await runStatus(deps.sql, job.runId)) === "done") return;
  const now = deps.now();
  await startRun(deps.sql, job.runId, now);
  const dayStart = Date.parse(`${utcDay(now)}T00:00:00Z`);
  const used = await deps.sql.get<{ n: number | null }>(
    "SELECT sum(api_calls) AS n FROM search_sync_runs WHERE property_id = ? AND kind = 'inspect' AND created_at >= ?",
    [property.id, dayStart],
  );
  const remaining = property.inspect_budget - (used?.n ?? 0);
  const candidates = remaining > 0
    ? await pickInspectionCandidates({ sql: deps.searchSql, propertyId: property.id, now, limit: Math.min(remaining, INSPECT_PER_MESSAGE) })
    : [];
  const counter = { calls: 0 };
  const gsc = deps.gsc(counter);
  for (const candidate of candidates) {
    const before = counter.calls;
    const result = await gsc.inspectUrl(property.site_url, candidate.url);
    await recordInspection({ sql: deps.searchSql, organizationId: property.organization_id, propertyId: property.id, pageId: candidate.pageId, result, now: deps.now() });
    // Count each inspection as it happens, so a retry after a failure cannot overspend the daily budget.
    await deps.sql.run("UPDATE search_sync_runs SET api_calls = api_calls + ?, rows_written = rows_written + 1 WHERE id = ?", [
      Math.max(1, counter.calls - before),
      job.runId,
    ]);
  }
  const more = candidates.length === INSPECT_PER_MESSAGE && remaining > candidates.length;
  if (more && deps.queue) {
    await deps.queue.send({ v: 1, kind: "inspect", propertyId: property.id, runId: job.runId });
    return;
  }
  await finishRun(deps.sql, job.runId, "done", deps.now());
  await propertySucceeded(deps.sql, property.id, deps.now());
}
