import { DatabaseSync } from "node:sqlite";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { SearchApiError } from "./errors";
import type { GscClient, SearchAnalyticsRequest, SearchAnalyticsRow } from "./gsc";
import {
  enqueueDailySearchSync,
  handleSearchSyncBatch,
  INSPECT_DELAY_SECONDS,
  MAX_ATTEMPTS,
  requestSearchSync,
  RETENTION_DELAY_SECONDS,
  runSearchSyncBatch,
  runSearchSyncCron,
  SEARCH_SYNC_CRON,
  type SearchMessage,
  type SearchQueue,
  type SyncDeps,
} from "./sync";
import type { SearchJob } from "./sync-jobs";
import { throwawayServiceAccount } from "./test-key";

const NOW = Date.UTC(2026, 9, 24, 8, 30);
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const client: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_owner" }] };

async function databases() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  for (const id of ["org-a", "org-b"]) {
    await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, ?, 'client', ?, ?)", [id, id, NOW, NOW]);
  }
  const searchSql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(searchSql);
  return { sql, searchSql };
}

async function property(sql: Sql, id: string, options: { org?: string; site?: string; status?: string; backfill?: string; budget?: number } = {}) {
  await sql.run(
    `INSERT INTO search_properties (id, organization_id, site_url, status, backfill_state, inspect_budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, options.org ?? "org-a", options.site ?? `sc-domain:${id}.com`, options.status ?? "active", options.backfill ?? "done", options.budget ?? 200, NOW, NOW],
  );
}

function fakeQueue() {
  const sent: { body: SearchJob; delaySeconds?: number }[] = [];
  const queue: SearchQueue = {
    async send(body, options) {
      sent.push({ body, ...(options?.delaySeconds ? { delaySeconds: options.delaySeconds } : {}) });
    },
    async sendBatch(messages) {
      sent.push(...messages);
    },
  };
  return { queue, sent };
}

type Outcome = { acked: boolean; retried: boolean; delaySeconds?: number };

function message(body: unknown, attempts = 1): SearchMessage & { outcome: Outcome } {
  const outcome: Outcome = { acked: false, retried: false };
  return {
    body,
    attempts,
    outcome,
    ack() {
      outcome.acked = true;
    },
    retry(options) {
      outcome.retried = true;
      outcome.delaySeconds = options?.delaySeconds;
    },
  };
}

type FakeGoogle = {
  analytics: (siteUrl: string, request: SearchAnalyticsRequest) => SearchAnalyticsRow[];
  sites: { siteUrl: string; permissionLevel: string }[];
  sitemaps: string[];
  inspected: string[];
  requests: SearchAnalyticsRequest[];
  fail?: () => Error | null;
  calls: number;
};

function google(overrides: Partial<FakeGoogle> = {}): FakeGoogle {
  return {
    analytics: (_site, request) => {
      const day = request.startDate;
      const keys = (extra: string[]) => [day, ...extra];
      switch (request.dimensions.length) {
        case 1:
          return [{ keys: keys([]), clicks: 10, impressions: 100, ctr: 0.1, position: 4 }];
        case 2:
          return [
            { keys: keys([request.dimensions[1] === "page" ? "https://prop-a.com/" : "shoes"]), clicks: 6, impressions: 60, ctr: 0.1, position: 3 },
            { keys: keys([request.dimensions[1] === "page" ? "https://prop-a.com/b" : "boots"]), clicks: 4, impressions: 40, ctr: 0.1, position: 5 },
          ];
        case 3:
          return request.dimensions[1] === "query"
            ? [{ keys: keys(["shoes", "https://prop-a.com/"]), clicks: 6, impressions: 60, ctr: 0.1, position: 3 }]
            : [{ keys: keys(["can", "MOBILE"]), clicks: 10, impressions: 100, ctr: 0.1, position: 4 }];
        default:
          return [{ keys: keys(["shoes", "https://prop-a.com/", "can", "MOBILE"]), clicks: 6, impressions: 60, ctr: 0.1, position: 3 }];
      }
    },
    sites: [{ siteUrl: "sc-domain:prop-a.com", permissionLevel: "siteRestrictedUser" }],
    sitemaps: [],
    inspected: [],
    requests: [],
    calls: 0,
    ...overrides,
  };
}

function deps(base: { sql: Sql; searchSql: Sql }, fake: FakeGoogle, extra: Partial<SyncDeps> = {}) {
  const puts = new Map<string, Uint8Array | string>();
  const { queue, sent } = fakeQueue();
  const value: SyncDeps = {
    ...base,
    queue,
    bucket: { put: async (key, body) => void puts.set(key, body) },
    clientEmail: "hq-search-reader@test.iam.gserviceaccount.com",
    now: () => NOW,
    fetchImpl: (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    gsc(counter): GscClient {
      const tick = () => {
        fake.calls += 1;
        counter.calls += 1;
        const failure = fake.fail?.();
        if (failure) throw failure;
      };
      return {
        async listSites() {
          fake.calls += 1;
          return fake.sites;
        },
        async querySearchAnalytics(siteUrl, request) {
          tick();
          fake.requests.push(request);
          return fake.analytics(siteUrl, request);
        },
        async listSitemaps() {
          tick();
          return fake.sitemaps.map((path) => ({ path, lastSubmitted: null, lastDownloaded: null, isPending: false, isSitemapsIndex: false, errors: 0, warnings: 1, submitted: 2 }));
        },
        async inspectUrl(_site, url) {
          tick();
          fake.inspected.push(url);
          return { verdict: "PASS", coverageState: "Submitted and indexed", indexingState: null, robotsTxtState: null, pageFetchState: null, lastCrawlTime: null, googleCanonical: null, userCanonical: null, sitemaps: [] };
        },
      };
    },
    ...extra,
  };
  return { deps: value, sent, puts };
}

/** Runs every message the pipeline queued (ignoring delays) until the queue is empty. */
async function drain(d: SyncDeps, sent: { body: SearchJob }[], limit = 5_000) {
  let handled = 0;
  while (sent.length && handled < limit) {
    const next = sent.splice(0, 5).map((entry) => message(entry.body));
    await handleSearchSyncBatch(next, d);
    handled += next.length;
    for (const entry of next) expect(entry.outcome).toMatchObject({ acked: true, retried: false });
  }
  return handled;
}

async function onEnv() {
  return { SEARCH_CONSOLE: "on", GOOGLE_SA_KEY_JSON: (await throwawayServiceAccount()).json };
}

describe("daily cron (enqueue only)", () => {
  it("fails closed: nothing is queued when Search Console is off or the key is missing", async () => {
    const { sql } = await databases();
    await property(sql, "prop-a");
    const { queue, sent } = fakeQueue();
    expect(await enqueueDailySearchSync({ sql, env: {}, queue })).toEqual({ enqueued: 0, reason: "off" });
    expect(await enqueueDailySearchSync({ sql, env: { SEARCH_CONSOLE: "on" }, queue })).toEqual({ enqueued: 0, reason: "missing_key" });
    expect(await enqueueDailySearchSync({ sql, env: { SEARCH_CONSOLE: "on", GOOGLE_SA_KEY_JSON: "{" }, queue })).toEqual({ enqueued: 0, reason: "invalid_key" });
    expect(await enqueueDailySearchSync({ sql, env: await onEnv(), queue: undefined })).toEqual({ enqueued: 0, reason: "no_queue" });
    expect(sent).toEqual([]);
  });

  it("queues one daily plan per active property, plus a backfill for one never backfilled", async () => {
    const { sql } = await databases();
    await property(sql, "prop-a", { backfill: "none" });
    await property(sql, "prop-b", { org: "org-b" });
    for (const status of ["pending", "paused", "access_lost", "removed"]) await property(sql, `prop-${status}`, { status });
    const { queue, sent } = fakeQueue();
    expect(await enqueueDailySearchSync({ sql, env: await onEnv(), queue })).toEqual({ enqueued: 3 });
    expect(sent.map((entry) => entry.body)).toEqual([
      { v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" },
      { v: 1, kind: "plan", propertyId: "prop-a", mode: "backfill" },
      { v: 1, kind: "plan", propertyId: "prop-b", mode: "daily" },
    ]);
  });

  it("only runs on the 30 8 * * * cron and never throws into the scheduler", async () => {
    const { sql } = await databases();
    await property(sql, "prop-a");
    const { queue, sent } = fakeQueue();
    const env = await onEnv();
    await runSearchSyncCron({ sql, env, queue, cron: "* * * * *" });
    await runSearchSyncCron({ sql, env, queue, cron: "0 * * * *" });
    expect(sent).toEqual([]);
    await runSearchSyncCron({ sql, env, queue, cron: SEARCH_SYNC_CRON });
    expect(sent).toHaveLength(1);
    const broken: SearchQueue = { send: async () => undefined, sendBatch: async () => { throw new Error("queue down"); } };
    await expect(runSearchSyncCron({ sql, env, queue: broken, cron: SEARCH_SYNC_CRON })).resolves.toBeUndefined();
  });
});

describe("staff Sync now / Backfill (handoff-hq, enqueue only)", () => {
  it("queues a plan for staff on an active property and refuses everything else", async () => {
    const { sql } = await databases();
    await property(sql, "prop-a");
    await property(sql, "prop-p", { status: "pending" });
    await property(sql, "prop-r", { backfill: "running" });
    const { queue, sent } = fakeQueue();
    const ask = (caller: Caller, propertyId: string, mode: "daily" | "backfill", q: SearchQueue = queue, organizationId = "org-a") =>
      requestSearchSync(sql, caller, { organizationId, propertyId, mode, queue: q });
    expect(await ask(client, "prop-a", "daily")).toEqual({ ok: false, error: "missing" });
    expect(await ask(staff, "prop-a", "daily", queue, "org-b")).toEqual({ ok: false, error: "missing" });
    expect(await ask(staff, "prop-p", "daily")).toEqual({ ok: false, error: "inactive" });
    expect(await ask(staff, "prop-r", "backfill")).toEqual({ ok: false, error: "running" });
    expect(await requestSearchSync(sql, staff, { organizationId: "org-a", propertyId: "prop-a", mode: "daily", queue: undefined })).toEqual({ ok: false, error: "no_queue" });
    expect(sent).toEqual([]);
    expect(await ask(staff, "prop-a", "daily")).toEqual({ ok: true });
    expect(await ask(staff, "prop-a", "backfill")).toEqual({ ok: true });
    expect(sent.map((entry) => entry.body)).toEqual([
      { v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" },
      { v: 1, kind: "plan", propertyId: "prop-a", mode: "backfill" },
    ]);
  });
});

describe("queue consumer: fail closed", () => {
  it("acknowledges without touching Google when Search Console is off, the key is missing, or SEARCH_DB is not bound", async () => {
    for (const env of [{}, { SEARCH_CONSOLE: "on" }, { ...(await onEnv()) }]) {
      const m = message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" });
      await runSearchSyncBatch([m], env);
      expect(m.outcome).toEqual({ acked: true, retried: false });
    }
  });

  it("drops unreadable messages and skips properties that are not active", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-paused", { status: "paused" });
    const fake = google();
    const { deps: d, sent } = deps({ sql, searchSql }, fake);
    const junk = message({ source: "assessment" });
    const paused = message({ v: 1, kind: "plan", propertyId: "prop-paused", mode: "daily" });
    const unknown = message({ v: 1, kind: "plan", propertyId: "prop-none", mode: "daily" });
    await handleSearchSyncBatch([junk, paused, unknown], d);
    for (const m of [junk, paused, unknown]) expect(m.outcome).toEqual({ acked: true, retried: false });
    expect(fake.calls).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("queue consumer: daily sync", () => {
  it("plans sitemaps, D-4..D-1 for every request, a delayed inspection and a delayed retention pass", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a");
    const { deps: d, sent } = deps({ sql, searchSql }, google());
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    const bodies = sent.map((entry) => entry.body);
    expect(bodies[0]).toMatchObject({ kind: "sitemaps", propertyId: "prop-a" });
    const analytics = bodies.filter((body): body is Extract<SearchJob, { kind: "analytics" }> => body.kind === "analytics");
    expect(new Set(analytics.map((job) => job.day))).toEqual(new Set(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]));
    expect(analytics).toHaveLength(24);
    expect(new Set(analytics.map((job) => job.request))).toEqual(new Set(["site", "page", "query", "query_page", "segment", "raw"]));
    expect(sent.find((entry) => entry.body.kind === "inspect")?.delaySeconds).toBe(INSPECT_DELAY_SECONDS);
    expect(sent.find((entry) => entry.body.kind === "retention")?.delaySeconds).toBe(RETENTION_DELAY_SECONDS);
    expect(await sql.get("SELECT count(*) AS n FROM search_sync_runs WHERE property_id = 'prop-a' AND status = 'queued'")).toEqual({ n: 26 });
    // A second plan while the first is still queued adds nothing.
    sent.length = 0;
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    expect(sent).toEqual([]);
  });

  it("pulls one day per request (final vs all), writes facts and R2, records runs and data_through", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a");
    const fake = google();
    const { deps: d, sent, puts } = deps({ sql, searchSql }, fake);
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    await drain(d, sent);
    for (const request of fake.requests) {
      expect(request.startDate).toBe(request.endDate);
      expect(request.dataState).toBe(request.startDate === "2026-10-20" ? "final" : "all");
    }
    expect(await searchSql.all("SELECT day, clicks, is_final FROM search_daily_site ORDER BY day")).toEqual([
      { day: "2026-10-20", clicks: 10, is_final: 1 },
      { day: "2026-10-21", clicks: 10, is_final: 0 },
      { day: "2026-10-22", clicks: 10, is_final: 0 },
      { day: "2026-10-23", clicks: 10, is_final: 0 },
    ]);
    expect(await searchSql.get("SELECT count(*) AS n FROM search_daily_query_page")).toEqual({ n: 4 });
    expect(await searchSql.get("SELECT count(*) AS n FROM search_daily_segment")).toEqual({ n: 4 });
    expect([...puts.keys()].sort()).toContain("search-raw/org-a/prop-a/2026-10-20.jsonl.gz");
    expect([...puts.keys()].sort()).toContain("search-raw/org-a/prop-a/2026-10-20.query-page.jsonl.gz");
    const raw = gunzipSync(puts.get("search-raw/org-a/prop-a/2026-10-20.jsonl.gz") as Uint8Array).toString("utf8");
    expect(JSON.parse(raw)).toMatchObject({ query: "shoes", country: "can", device: "MOBILE" });
    expect(await sql.get("SELECT data_through, last_error, consecutive_failures FROM search_properties WHERE id = 'prop-a'")).toEqual({
      data_through: "2026-10-20",
      last_error: null,
      consecutive_failures: 0,
    });
    const runs = await sql.all<{ status: string; n: number; calls: number }>(
      "SELECT status, count(*) AS n, sum(api_calls) AS calls FROM search_sync_runs WHERE kind = 'daily' GROUP BY status",
    );
    expect(runs).toEqual([{ status: "done", n: 24, calls: 24 }]);
  });

  it("re-pulling D-4..D-1 the next run is idempotent", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a");
    const { deps: d, sent } = deps({ sql, searchSql }, google());
    const counts = async () => ({
      site: await searchSql.get("SELECT count(*) AS n, sum(clicks) AS c FROM search_daily_site"),
      page: await searchSql.get("SELECT count(*) AS n, sum(clicks) AS c FROM search_daily_page"),
      query: await searchSql.get("SELECT count(*) AS n, sum(clicks) AS c FROM search_daily_query"),
      pages: await searchSql.get("SELECT count(*) AS n FROM search_pages"),
    });
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    await drain(d, sent);
    const first = await counts();
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    expect(sent.length).toBeGreaterThan(0);
    await drain(d, sent);
    expect(await counts()).toEqual(first);
  });

  it("does not call Google again for a run that already finished (redelivery)", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a");
    const fake = google();
    const { deps: d, sent } = deps({ sql, searchSql }, fake);
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    const job = sent.find((entry) => entry.body.kind === "analytics")!.body;
    await handleSearchSyncBatch([message(job)], d);
    const calls = fake.calls;
    const again = message(job);
    await handleSearchSyncBatch([again], d);
    expect(fake.calls).toBe(calls);
    expect(again.outcome).toEqual({ acked: true, retried: false });
  });
});

describe("queue consumer: errors", () => {
  async function oneAnalyticsJob(fake: FakeGoogle, attempts = 1) {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a");
    const { deps: d, sent } = deps({ sql, searchSql }, fake);
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "daily" })], d);
    const job = sent.find((entry) => entry.body.kind === "analytics")!.body as Extract<SearchJob, { kind: "analytics" }>;
    const m = message(job, attempts);
    await handleSearchSyncBatch([m], d);
    return { sql, m, job };
  }

  it("marks access_lost on a 403 that sites.list confirms, stops, and logs it", async () => {
    const fake = google({ sites: [], fail: () => new SearchApiError("access_lost", 403, "PERMISSION_DENIED") });
    const { sql, m, job } = await oneAnalyticsJob(fake);
    expect(m.outcome).toEqual({ acked: true, retried: false });
    expect(await sql.get("SELECT status, last_error FROM search_properties WHERE id = 'prop-a'")).toEqual({ status: "access_lost", last_error: "access_lost" });
    expect(await sql.get("SELECT status FROM search_sync_runs WHERE id = ?", [job.runId])).toEqual({ status: "failed" });
    const activity = await sql.get<{ kind: string; body: string }>("SELECT kind, body FROM activities WHERE organization_id = 'org-a' AND kind = 'search.access_lost'");
    expect(activity?.body).toContain("hq-search-reader@test.iam.gserviceaccount.com");
  });

  it("retries a 403 that sites.list does not confirm (still shared)", async () => {
    const fake = google({ fail: () => new SearchApiError("access_lost", 403) });
    const { sql, m } = await oneAnalyticsJob(fake);
    expect(m.outcome.retried).toBe(true);
    expect(await sql.get("SELECT status FROM search_properties WHERE id = 'prop-a'")).toEqual({ status: "active" });
  });

  it("retries rate limits with Google's delay, keeps the run queued, and fails it on the last attempt", async () => {
    const limited = () => new SearchApiError("rate_limited", 429, "RESOURCE_EXHAUSTED", 90_000);
    const first = await oneAnalyticsJob(google({ fail: limited }));
    expect(first.m.outcome).toEqual({ acked: false, retried: true, delaySeconds: 90 });
    expect(await first.sql.get("SELECT status, error FROM search_sync_runs WHERE id = ?", [first.job.runId])).toEqual({
      status: "queued",
      error: "Search Console rate_limited (HTTP 429: RESOURCE_EXHAUSTED)",
    });
    const last = await oneAnalyticsJob(google({ fail: limited }), MAX_ATTEMPTS);
    expect(last.m.outcome.retried).toBe(true);
    expect(await last.sql.get("SELECT status FROM search_sync_runs WHERE id = ?", [last.job.runId])).toEqual({ status: "failed" });
  });

  it("fails a bad request without retrying, and never stores a token or key in the error", async () => {
    const { sql, m, job } = await oneAnalyticsJob(google({ fail: () => new SearchApiError("bad_request", 400, "INVALID_ARGUMENT") }));
    expect(m.outcome).toEqual({ acked: true, retried: false });
    const run = await sql.get<{ status: string; error: string }>("SELECT status, error FROM search_sync_runs WHERE id = ?", [job.runId]);
    expect(run).toEqual({ status: "failed", error: "Search Console bad_request (HTTP 400: INVALID_ARGUMENT)" });
  });
});

describe("queue consumer: backfill", () => {
  it("plans 16 months newest day first, then marks the backfill done", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a", { backfill: "none" });
    const fake = google();
    const { deps: d, sent } = deps({ sql, searchSql }, fake);
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "backfill" })], d);
    const days = sent.map((entry) => (entry.body as { day: string }).day);
    expect(days[0]).toBe("2026-10-19");
    expect(days.at(-1)).toBe("2025-06-24");
    for (let index = 1; index < days.length; index += 1) expect(days[index]! <= days[index - 1]!).toBe(true);
    expect(sent.every((entry) => entry.body.kind === "analytics" && entry.body.backfill === true && entry.body.request !== "raw")).toBe(true);
    expect(await sql.get("SELECT backfill_state FROM search_properties WHERE id = 'prop-a'")).toEqual({ backfill_state: "running" });
    expect(await sql.get("SELECT count(*) AS n FROM activities WHERE kind = 'search.backfill_started'")).toEqual({ n: 1 });
    // Asking again while it runs adds nothing.
    const planned = sent.length;
    const copy = [...sent];
    await handleSearchSyncBatch([message({ v: 1, kind: "plan", propertyId: "prop-a", mode: "backfill" })], d);
    expect(sent.length).toBe(planned);
    sent.length = 0;
    sent.push(...copy);
    await drain(d, sent, 10_000);
    expect(await sql.get("SELECT backfill_state FROM search_properties WHERE id = 'prop-a'")).toEqual({ backfill_state: "done" });
    expect(await sql.get("SELECT count(*) AS n FROM activities WHERE kind = 'search.backfill_finished'")).toEqual({ n: 1 });
    expect(await searchSql.get("SELECT count(*) AS n FROM search_daily_site")).toEqual({ n: days.length / 5 });
  });
});

describe("queue consumer: sitemaps and URL Inspection", () => {
  it("stores the sitemap list and marks sitemap URLs from the public XML", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a");
    const fake = google({ sitemaps: ["https://prop-a.com/sitemap.xml"] });
    const xml = `<urlset><url><loc>https://prop-a.com/</loc><lastmod>2026-10-01</lastmod></url><url><loc>https://prop-a.com/new</loc></url></urlset>`;
    const { deps: d } = deps({ sql, searchSql }, fake, {
      fetchImpl: (async (url: string) => (String(url) === "https://prop-a.com/sitemap.xml" ? new Response(xml) : new Response("", { status: 404 }))) as unknown as typeof fetch,
    });
    await sql.run("INSERT INTO search_sync_runs (id, property_id, kind, status, created_at) VALUES ('run-s', 'prop-a', 'sitemaps', 'queued', ?)", [NOW]);
    const m = message({ v: 1, kind: "sitemaps", propertyId: "prop-a", runId: "run-s" });
    await handleSearchSyncBatch([m], d);
    expect(m.outcome.acked).toBe(true);
    expect(await searchSql.all("SELECT path, warnings, submitted_urls FROM search_sitemaps")).toEqual([{ path: "https://prop-a.com/sitemap.xml", warnings: 1, submitted_urls: 2 }]);
    expect(await searchSql.all("SELECT url, in_sitemap, sitemap_lastmod, sitemap_changed_at FROM search_pages ORDER BY url")).toEqual([
      { url: "https://prop-a.com/", in_sitemap: 1, sitemap_lastmod: "2026-10-01", sitemap_changed_at: NOW },
      { url: "https://prop-a.com/new", in_sitemap: 1, sitemap_lastmod: null, sitemap_changed_at: NOW },
    ]);
    expect(await sql.get("SELECT status, rows_written, api_calls FROM search_sync_runs WHERE id = 'run-s'")).toEqual({ status: "done", rows_written: 3, api_calls: 1 });
  });

  it("spends at most the property's daily inspection budget", async () => {
    const { sql, searchSql } = await databases();
    await property(sql, "prop-a", { budget: 3 });
    for (let id = 1; id <= 6; id += 1) {
      await searchSql.run("INSERT INTO search_pages (id, property_id, url, in_sitemap, sitemap_changed_at) VALUES (?, 'prop-a', ?, 1, ?)", [id, `https://prop-a.com/${id}`, NOW - id]);
    }
    const fake = google();
    const { deps: d } = deps({ sql, searchSql }, fake);
    for (const id of ["run-1", "run-2"]) {
      await sql.run("INSERT INTO search_sync_runs (id, property_id, kind, status, created_at) VALUES (?, 'prop-a', 'inspect', 'queued', ?)", [id, NOW]);
      await handleSearchSyncBatch([message({ v: 1, kind: "inspect", propertyId: "prop-a", runId: id })], d);
    }
    expect(fake.inspected).toEqual(["https://prop-a.com/1", "https://prop-a.com/2", "https://prop-a.com/3"]);
    expect(await searchSql.get("SELECT count(*) AS n FROM search_url_state")).toEqual({ n: 3 });
    expect(await sql.all("SELECT id, status, api_calls FROM search_sync_runs ORDER BY id")).toEqual([
      { id: "run-1", status: "done", api_calls: 3 },
      { id: "run-2", status: "done", api_calls: 0 },
    ]);
  });
});
