import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { migrateSearch } from "@/db/migrate-search";
import { sqliteSql } from "@/db/sql";
import { agentForToken, registerClientAgent } from "@/lib/agent-work-filing";
import { loadAgentSearch } from "./agent-search";
import { agentSearchIndexing, agentSearchRead, agentSearchRows } from "./agent-search-api";
import { decodeCursor, encodeCursor, MAX_LIMIT, parseIndexingQuery, parseRowsQuery, QUESTION_WORDS } from "./explore";
import { DEFAULT_PERIOD, parsePeriodQuery, resolveWindow, yearBefore } from "./periods";

const NOW = Date.parse("2026-10-25T12:00:00Z");
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const params = (query: string) => new URLSearchParams(query);
const getter = (query: string) => (name: string) => params(query).get(name);

async function setup() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  const searchSql = sqliteSql(new DatabaseSync(":memory:"));
  await migrateSearch(searchSql);
  for (const [id, domain] of [[A, "a.example"], [B, "b.example"]]) {
    await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, id, domain, NOW, NOW]);
  }
  for (const [id, org] of [["prop-a", A], ["prop-b", B]]) {
    await sql.run(
      `INSERT INTO search_properties (id, organization_id, site_url, status, data_through, last_success_at, inspect_budget, created_at, updated_at)
       VALUES (?, ?, ?, 'active', '2026-10-21', ?, 200, ?, ?)`,
      [id, org, `sc-domain:${id}.com`, NOW - 60_000, NOW, NOW],
    );
  }
  const made = await registerClientAgent(sql, { agentId: "a-lead", label: "a-lead", organizationId: A, role: "lead", actor: "t", now: NOW });
  const agent = (await agentForToken(sql, `Bearer ${made.ok ? made.token : ""}`))!;
  const ids = new Map<string, number>();
  const id = async (table: "search_queries" | "search_pages", prop: string, value: string) => {
    const key = `${table}:${prop}:${value}`;
    if (!ids.has(key)) {
      const column = table === "search_queries" ? "text" : "url";
      await searchSql.run(`INSERT OR IGNORE INTO ${table} (property_id, ${column}) VALUES (?, ?)`, [prop, value]);
      ids.set(key, (await searchSql.get<{ id: number }>(`SELECT id FROM ${table} WHERE property_id = ? AND ${column} = ?`, [prop, value]))!.id);
    }
    return ids.get(key)!;
  };
  /** One day of facts for a property: site, one query, one page, one pair, one segment row. */
  const day = async (org: string, prop: string, d: string, final: number, query: string, page: string, clicks: number, impressions: number) => {
    await searchSql.run(
      `INSERT INTO search_daily_site (organization_id, property_id, day, search_type, clicks, impressions, pos_sum, is_final) VALUES (?, ?, ?, 'web', ?, ?, ?, ?)
       ON CONFLICT (property_id, search_type, day) DO UPDATE SET clicks = clicks + excluded.clicks, impressions = impressions + excluded.impressions,
         pos_sum = pos_sum + excluded.pos_sum`,
      [org, prop, d, clicks + 1, impressions + 10, (impressions + 10) * 5, final],
    );
    const q = await id("search_queries", prop, query);
    const p = await id("search_pages", prop, page);
    await searchSql.run("INSERT INTO search_daily_query (organization_id, property_id, day, query_id, clicks, impressions, pos_sum) VALUES (?, ?, ?, ?, ?, ?, ?)", [org, prop, d, q, clicks, impressions, impressions * 5]);
    await searchSql.run("INSERT OR IGNORE INTO search_daily_page (organization_id, property_id, day, page_id, clicks, impressions, pos_sum) VALUES (?, ?, ?, ?, ?, ?, ?)", [org, prop, d, p, clicks, impressions, impressions * 5]);
    await searchSql.run("INSERT INTO search_daily_query_page (organization_id, property_id, day, query_id, page_id, clicks, impressions, pos_sum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [org, prop, d, q, p, clicks, impressions, impressions * 5]);
    await searchSql.run(
      `INSERT INTO search_daily_segment (organization_id, property_id, day, country, device, clicks, impressions, pos_sum) VALUES (?, ?, ?, 'can', 'MOBILE', ?, ?, ?)
       ON CONFLICT (property_id, day, country, device) DO UPDATE SET clicks = clicks + excluded.clicks, impressions = impressions + excluded.impressions`,
      [org, prop, d, clicks, impressions, impressions * 5],
    );
  };
  return { sql, searchSql, agent, day };
}

describe("date windows", () => {
  it("parses presets, custom dates and comparisons, and rejects the rest", () => {
    expect(parsePeriodQuery(getter("range=7d"))).toMatchObject({ ok: true, value: { range: "7d", start: null } });
    expect(parsePeriodQuery(getter("start=2026-10-01&end=2026-10-10&compare=yoy&include_partial=1"))).toMatchObject({
      ok: true,
      value: { start: "2026-10-01", end: "2026-10-10", compare: "yoy", includePartial: true },
    });
    for (const bad of ["range=1y", "start=2026-02-30", "end=2026-10-01", "start=2026-10-05&end=2026-10-01", "range=7d&start=2026-10-01", "compare=mom", "compare_start=2026-01-01", "compare=none&compare_start=2026-01-01&compare_end=2026-01-02", "include_partial=yes"]) {
      expect(parsePeriodQuery(getter(bad)).ok, bad).toBe(false);
    }
  });

  it("clamps custom dates to the 16 months HQ keeps and to the newest day", () => {
    const resolved = resolveWindow({ ...DEFAULT_PERIOD, start: "2024-01-01", end: "2026-12-01" }, "2026-10-21");
    expect(resolved.floor).toBe("2025-06-22");
    expect(resolved.window.current).toEqual({ start: "2025-06-22", end: "2026-10-21", days: 487 });
    expect(resolved.clamped).toBe(true);
    // Previous period would start before the floor: no comparison rather than a wrong one.
    expect(resolved.window.previous).toBeNull();
    const fine = resolveWindow({ ...DEFAULT_PERIOD, start: "2026-10-01", end: "2026-10-10" }, "2026-10-21");
    expect(fine).toMatchObject({ clamped: false, window: { current: { days: 10 }, previous: { start: "2026-09-21", end: "2026-09-30", days: 10 } } });
    expect(resolveWindow({ ...DEFAULT_PERIOD, start: "2026-10-01", end: "2026-10-10", compare: "none" }, "2026-10-21").window.previous).toBeNull();
    expect(resolveWindow({ ...DEFAULT_PERIOD, start: "2026-10-01", end: "2026-10-10", compareStart: "2026-08-01", compareEnd: "2026-08-05" }, "2026-10-21").window.previous)
      .toEqual({ start: "2026-08-01", end: "2026-08-05", days: 5 });
  });

  it("compares year over year within retention", () => {
    expect(yearBefore("2028-02-29")).toBe("2027-02-28");
    const yoy = resolveWindow({ ...DEFAULT_PERIOD, range: "28d", compare: "yoy" }, "2026-10-21");
    expect(yoy.window.previous).toEqual({ start: "2025-09-24", end: "2025-10-21", days: 28 });
    const tooOld = resolveWindow({ ...DEFAULT_PERIOD, start: "2025-08-01", end: "2026-07-01", compare: "yoy" }, "2026-10-21");
    expect(tooOld.window.previous?.start).toBe(tooOld.floor);
    expect(tooOld.clamped).toBe(true);
  });
});

describe("GET /api/agent-search/rows", () => {
  it("validates dimensions, filters, limits and refuses regex", () => {
    expect(parseRowsQuery(getter(""), DEFAULT_PERIOD)).toMatchObject({ ok: true, value: { dimension: "query", sort: "clicks", limit: 100 } });
    expect(parseRowsQuery(getter("limit=1000"), DEFAULT_PERIOD).ok).toBe(true);
    for (const bad of [`limit=${MAX_LIMIT + 1}`, "limit=0", "dimension=appearance", "sort=name", "page=x&page_prefix=y", "query_regex=^how", "dimension=country&page=x", "dimension=page&query_contains=a", "dimension=query&page_prefix=/x", `query_contains=${Array.from({ length: 11 }, (_, i) => `t${i}`).join(",")}`, "query_preset=brand", "max_clicks=-1"]) {
      expect(parseRowsQuery(getter(bad), DEFAULT_PERIOD).ok, bad).toBe(false);
    }
    const preset = parseRowsQuery(getter("query_preset=questions&query_words=near"), DEFAULT_PERIOD);
    expect(preset.ok && preset.value.filters.queryWords).toEqual(["near", ...QUESTION_WORDS]);
  });

  it("rejects a cursor from another query", () => {
    const cursor = encodeCursor(100, "abc");
    expect(decodeCursor(cursor, "abc")).toBe(100);
    expect(decodeCursor(cursor, "xyz")).toBeNull();
    expect(decodeCursor("garbage", "abc")).toBeNull();
    expect(decodeCursor(encodeCursor(60_000, "abc"), "abc")).toBeNull();
  });

  it("returns query x page pairs with filters, previous period, and cursor pages; scoped to the agent's client", async () => {
    const { sql, searchSql, agent, day } = await setup();
    for (const d of ["2026-10-10", "2026-10-15", "2026-10-20"]) {
      await day(A, "prop-a", d, 1, "how to tie shoes", "https://prop-a.com/guides/tie", 3, 100);
      await day(A, "prop-a", d, 1, "shoes vs boots", "https://prop-a.com/guides/vs", 1, 50);
      await day(A, "prop-a", d, 1, "acme shoes", "https://prop-a.com/", 9, 80);
      await day(A, "prop-a", d, 1, "showroom", "https://prop-a.com/visit", 0, 40);
    }
    await day(A, "prop-a", "2026-09-20", 1, "how to tie shoes", "https://prop-a.com/guides/tie", 6, 100);
    await day(A, "prop-a", "2026-10-23", 0, "how to tie shoes", "https://prop-a.com/guides/tie", 50, 500); // partial day
    await day(B, "prop-b", "2026-10-20", 1, "secret", "https://prop-b.com/", 5, 5);
    const read = (query: string) => agentSearchRows(sql, searchSql, agent, { params: params(query), now: NOW });

    expect(await read(`client=${B}`)).toMatchObject({ ok: false, status: 403 });
    expect(await read(`client=${A}&property=prop-b`)).toMatchObject({ ok: false, status: 404 });
    expect(await read(`client=${A}&range=1y`)).toMatchObject({ ok: false, status: 400 });

    const pairs = await read(`org=${A}&dimension=query_page&page_prefix=https://prop-a.com/guides/&query_preset=questions`);
    expect(pairs.ok).toBe(true);
    if (!pairs.ok) return;
    expect(pairs.result).toMatchObject({ state: "ok", data_through: "2026-10-21", property: { id: "prop-a" }, window: { current: { end: "2026-10-20" } } });
    expect(pairs.result.last_sync_at).toBe(new Date(NOW - 60_000).toISOString());
    expect(pairs.result.rows.map((row) => [row.query, row.page, row.clicks])).toEqual([
      ["how to tie shoes", "https://prop-a.com/guides/tie", 9],
      ["shoes vs boots", "https://prop-a.com/guides/vs", 3],
    ]);
    expect(pairs.result.rows[0].previous?.clicks).toBe(6);
    expect(pairs.result.stored_dimensions.ai_overview_or_ai_mode).toBe(false);

    const excluded = await read(`client=a.example&query_exclude=acme,how%20to&sort=impressions`);
    expect(excluded.ok && excluded.result.rows.map((row) => row.query)).toEqual(["shoes vs boots", "showroom"]);
    const contains = await read(`client=a.example&query_contains=sho%25`);
    expect(contains.ok && contains.result.rows).toEqual([]); // % is literal, not a wildcard

    const zero = await read(`client=a.example&dimension=page&max_clicks=0`);
    expect(zero.ok && zero.result.rows.map((row) => row.page)).toEqual(["https://prop-a.com/visit"]);

    const partial = await read(`client=a.example&include_partial=1&range=7d`);
    expect(partial.ok && partial.result.window?.current.end).toBe("2026-10-23");

    const first = await read(`client=a.example&limit=2`);
    expect(first.ok && first.result.rows.map((row) => row.query)).toEqual(["acme shoes", "how to tie shoes"]);
    const cursor = first.ok ? first.result.next_cursor : null;
    expect(cursor).toBeTruthy();
    const second = await read(`client=a.example&limit=2&cursor=${cursor}`);
    expect(second.ok && second.result.rows.map((row) => row.query)).toEqual(["shoes vs boots", "showroom"]);
    expect(second.ok && second.result.next_cursor).toBeNull();
    expect(await read(`client=a.example&limit=2&sort=impressions&cursor=${cursor}`)).toMatchObject({ ok: false, status: 400 });

    const devices = await read(`client=a.example&dimension=country_device`);
    expect(devices.ok && devices.result.rows.map((row) => [row.country, row.device])).toEqual([["can", "MOBILE"]]);
    expect(await agentSearchRows(sql, null, agent, { params: params(`client=${A}`), now: NOW })).toMatchObject({ ok: true, result: { state: "unavailable", reason: "no_db" } });
  });
});

describe("summary: partial days, totals, series", () => {
  it("ends on the newest final day by default, flags partial days, and shows the anonymized-query gap", async () => {
    const { sql, searchSql, agent, day } = await setup();
    await day(A, "prop-a", "2026-10-20", 1, "q", "https://prop-a.com/", 4, 100);
    await day(A, "prop-a", "2026-10-22", 0, "q", "https://prop-a.com/", 4, 100);
    await day(A, "prop-a", "2026-10-23", 0, "q", "https://prop-a.com/", 4, 100);
    const loaded = await loadAgentSearch(sql, searchSql, { organizationId: A, now: NOW });
    const prop = loaded.ok ? loaded.result.properties[0] : null;
    expect(prop?.window?.current.end).toBe("2026-10-20");
    expect(prop?.partial_days).toEqual(["2026-10-22", "2026-10-23"]);
    expect(prop?.includes_partial).toBe(false);
    expect(prop?.totals).toMatchObject({ clicks: 5, impressions: 110 });
    expect(prop?.query_totals).toMatchObject({ clicks: 4, impressions: 100 });
    expect(prop?.query_totals?.anonymized_click_share).toBeCloseTo(0.2);
    expect(prop?.series.at(-1)).toEqual({ day: "2026-10-20", clicks: 5, impressions: 110 });
    expect(loaded.ok && loaded.result.data_through).toBe("2026-10-21");
    const withPartial = await agentSearchRead(sql, searchSql, agent, { client: A, property: null, params: params("include_partial=1&compare=yoy"), now: NOW });
    expect(withPartial.ok && withPartial.result.properties[0].window?.current.end).toBe("2026-10-23");
    const custom = await agentSearchRead(sql, searchSql, agent, { client: A, property: null, params: params("start=2026-10-01&end=2026-10-20"), now: NOW });
    expect(custom.ok && custom.result.range).toBe("custom");
    expect(custom.ok && custom.result.properties[0].window?.current).toEqual({ start: "2026-10-01", end: "2026-10-20", days: 20 });
  });
});

describe("GET /api/agent-search/indexing", () => {
  it("returns stored inspection results with canonicals, coverage history and sitemaps; never another client's", async () => {
    const { sql, searchSql, agent } = await setup();
    await searchSql.run("INSERT INTO search_pages (property_id, url, in_sitemap, sitemap_lastmod) VALUES ('prop-a', 'https://prop-a.com/a', 1, '2026-10-01'), ('prop-a', 'https://prop-a.com/b', 0, NULL), ('prop-b', 'https://prop-b.com/x', 1, NULL)");
    const pid = async (url: string) => (await searchSql.get<{ id: number }>("SELECT id FROM search_pages WHERE url = ?", [url]))!.id;
    const state = async (prop: string, org: string, url: string, verdict: string, google: string | null, user: string | null, at: number) =>
      searchSql.run(
        `INSERT INTO search_url_state (property_id, page_id, organization_id, verdict, coverage_state, google_canonical, user_canonical, last_crawl_at, inspected_at)
         VALUES (?, ?, ?, ?, 'Submitted and indexed', ?, ?, '2026-10-20T10:00:00Z', ?)`,
        [prop, await pid(url), org, verdict, google, user, at],
      );
    await state("prop-a", A, "https://prop-a.com/a", "PASS", "https://prop-a.com/a", "https://prop-a.com/a", NOW - 2000);
    await state("prop-a", A, "https://prop-a.com/b", "NEUTRAL", "https://prop-a.com/", "https://prop-a.com/b", NOW - 1000);
    await state("prop-b", B, "https://prop-b.com/x", "FAIL", null, null, NOW);
    await searchSql.run("INSERT INTO search_url_events (property_id, page_id, organization_id, from_state, to_state, at) VALUES ('prop-a', ?, ?, NULL, 'Submitted and indexed', ?)", [await pid("https://prop-a.com/a"), A, NOW - 5000]);
    await searchSql.run("INSERT INTO search_sitemaps (property_id, path, organization_id, errors, warnings, submitted_urls, is_pending, fetched_at) VALUES ('prop-a', 'https://prop-a.com/sitemap.xml', ?, 0, 1, 2, 0, ?)", [A, NOW]);
    await sql.run("INSERT INTO search_sync_runs (id, property_id, kind, day, status, api_calls, created_at) VALUES ('r1', 'prop-a', 'inspect', '2026-10-25', 'done', 7, ?)", [NOW - 1000]);
    const read = (query: string) => agentSearchIndexing(sql, searchSql, agent, { params: params(query), now: NOW });
    expect(await read(`client=${B}`)).toMatchObject({ ok: false, status: 403 });
    expect(await read(`client=${A}&property=prop-b`)).toMatchObject({ ok: false, status: 404 });
    expect(parseIndexingQuery(getter("url=a&url_prefix=b")).ok).toBe(false);
    expect(parseIndexingQuery(getter("verdict=pass;drop")).ok).toBe(false);
    const all = await read(`client=${A}`);
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.result.inspection).toEqual({ daily_budget: 200, used_today: 7, inspected_urls: 2, last_inspected_at: new Date(NOW - 1000).toISOString(), live_calls_from_this_endpoint: false });
    expect(all.result.urls.map((row) => [row.url, row.canonical_mismatch, row.in_sitemap])).toEqual([
      ["https://prop-a.com/b", true, false],
      ["https://prop-a.com/a", false, true],
    ]);
    expect(all.result.sitemaps).toEqual([
      expect.objectContaining({ path: "https://prop-a.com/sitemap.xml", warnings: 1, is_pending: false }),
    ]);
    expect(all.result.data_through).toBe("2026-10-21");
    const mismatch = await read(`client=${A}&canonical_mismatch=1`);
    expect(mismatch.ok && mismatch.result.urls.map((row) => row.url)).toEqual(["https://prop-a.com/b"]);
    const one = await read(`client=${A}&url=https://prop-a.com/a`);
    expect(one.ok && one.result.events).toEqual([{ from_state: null, to_state: "Submitted and indexed", at: new Date(NOW - 5000).toISOString() }]);
    const page = await read(`client=${A}&limit=1`);
    expect(page.ok && page.result.next_cursor).toBeTruthy();
  });
});

describe("POST /api/agent-search/inspect (re-check asks)", () => {
  it("keeps URLs inside the property", async () => {
    const { urlInProperty } = await import("./agent-inspect");
    expect(urlInProperty("sc-domain:prop-a.com", "https://prop-a.com/x")).toBe(true);
    expect(urlInProperty("sc-domain:prop-a.com", "https://blog.prop-a.com/x")).toBe(true);
    expect(urlInProperty("sc-domain:prop-a.com", "https://evilprop-a.com/x")).toBe(false);
    expect(urlInProperty("sc-domain:prop-a.com", "ftp://prop-a.com/x")).toBe(false);
    expect(urlInProperty("https://www.a.com/shop/", "https://www.a.com/shop/item")).toBe(true);
    expect(urlInProperty("https://www.a.com/shop/", "https://www.a.com/blog")).toBe(false);
  });

  it("records asks as activities, adds unknown URLs to search_pages, and stops at 20 a day per property", async () => {
    const { requestInspection, INSPECT_REQUESTS_PER_DAY } = await import("./agent-inspect");
    const { sql, searchSql, agent } = await setup();
    const ask = (urls: unknown, client: unknown = { organization_id: A }, now = NOW) => requestInspection(sql, searchSql, agent, { client, urls, now });
    expect(await ask(["https://prop-a.com/x"], { organization_id: B })).toMatchObject({ ok: false, status: 403 });
    expect(await ask([])).toMatchObject({ ok: false, status: 400 });
    expect(await ask(Array.from({ length: 21 }, (_, i) => `https://prop-a.com/${i}`))).toMatchObject({ ok: false, status: 400 });
    expect(await requestInspection(sql, null, agent, { client: { organization_id: A }, urls: ["https://prop-a.com/x"], now: NOW })).toMatchObject({ ok: false, status: 503 });
    const first = await ask(["https://prop-a.com/new", "https://prop-b.com/x", "nope", "https://prop-a.com/new"]);
    expect(first).toMatchObject({
      ok: true,
      queued: ["https://prop-a.com/new"],
      rejected: [
        { url: "https://prop-b.com/x", reason: "not_in_property" },
        { url: "nope", reason: "not_in_property" },
        { url: "https://prop-a.com/new", reason: "duplicate" },
      ],
      requests_left_today: INSPECT_REQUESTS_PER_DAY - 1,
      daily_budget: 200,
    });
    expect(await searchSql.get("SELECT count(*) AS n FROM search_pages WHERE url = 'https://prop-a.com/new'")).toEqual({ n: 1 });
    const more = await ask(Array.from({ length: 20 }, (_, i) => `https://prop-a.com/p${i}`));
    expect(more.ok && more.queued).toHaveLength(19);
    expect(more.ok && more.rejected).toEqual([{ url: "https://prop-a.com/p19", reason: "daily_limit" }]);
    // Tomorrow is a new day.
    expect((await ask(["https://prop-a.com/p19"], { organization_id: A }, NOW + 86_400_000)).ok).toBe(true);
  });

  it("asked URLs go first in the inspection picker until inspected after the ask", async () => {
    const { pickInspectionCandidates } = await import("./inspection");
    const { searchSql } = await setup();
    await searchSql.run("INSERT INTO search_pages (property_id, url, in_sitemap) VALUES ('prop-a', 'https://prop-a.com/s', 1), ('prop-a', 'https://prop-a.com/asked', 0)");
    const pick = (at: number) => pickInspectionCandidates({ sql: searchSql, propertyId: "prop-a", now: NOW, limit: 1, requested: [{ url: "https://prop-a.com/asked", at }] });
    expect(await pick(NOW - 10)).toEqual([expect.objectContaining({ url: "https://prop-a.com/asked", reason: "requested" })]);
    const pageId = (await searchSql.get<{ id: number }>("SELECT id FROM search_pages WHERE url = 'https://prop-a.com/asked'"))!.id;
    await searchSql.run("INSERT INTO search_url_state (property_id, page_id, organization_id, verdict, inspected_at) VALUES ('prop-a', ?, ?, 'PASS', ?)", [pageId, A, NOW - 5]);
    expect((await pick(NOW - 10))[0]?.url).toBe("https://prop-a.com/s");
    expect((await pick(NOW - 1))[0]?.reason).toBe("requested");
  });
});
