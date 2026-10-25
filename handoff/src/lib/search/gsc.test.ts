import { describe, expect, it, vi } from "vitest";
import { SearchApiError } from "./errors";
import { GSC_READONLY_SCOPE, type TokenProvider } from "./google-auth";
import { createGscClient, retryAfterMs, SEARCH_ANALYTICS_PAGE_SIZE } from "./gsc";

type Call = { url: string; method: string; body: Record<string, unknown> | null; auth: string | null };

function fakeTokens() {
  let issued = 0;
  const scopes: string[] = [];
  const provider: TokenProvider & { invalidations: number } = {
    invalidations: 0,
    async token(scope) {
      scopes.push(scope);
      return `token-${issued || (issued = 1)}`;
    },
    invalidate() {
      provider.invalidations += 1;
      issued += 1;
    },
  };
  return { provider, scopes };
}

function scripted(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
      auth: headers.get("authorization"),
    });
    const next = responses.shift();
    if (!next) throw new Error("no scripted response left");
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function rows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    keys: ["2026-10-20", `query ${offset + index}`],
    clicks: 1,
    impressions: 10,
    ctr: 0.1,
    position: 4.5,
  }));
}

function client(responses: (Response | Error)[], extra: { maxRetries?: number } = {}) {
  const { provider, scopes } = fakeTokens();
  const { fetchImpl, calls } = scripted(responses);
  const sleeps: number[] = [];
  const gsc = createGscClient({
    tokens: provider,
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    baseDelayMs: 1000,
    ...extra,
  });
  return { gsc, calls, sleeps, provider, scopes };
}

describe("Search Console client", () => {
  it("lists the properties the service account can see, with the read-only token", async () => {
    const { gsc, calls, scopes } = client([
      json({ siteEntry: [{ siteUrl: "sc-domain:abra-ca-dabra.app", permissionLevel: "siteRestrictedUser" }, { nope: true }] }),
    ]);
    expect(await gsc.listSites()).toEqual([{ siteUrl: "sc-domain:abra-ca-dabra.app", permissionLevel: "siteRestrictedUser" }]);
    expect(calls[0]).toMatchObject({ url: "https://www.googleapis.com/webmasters/v3/sites", method: "GET", auth: "Bearer token-1" });
    expect(new Set(scopes)).toEqual(new Set([GSC_READONLY_SCOPE]));
    expect(await client([json({})]).gsc.listSites()).toEqual([]);
  });

  it("pages Search Analytics 25,000 rows at a time with startRow until a short page, with the site URL encoded", async () => {
    const { gsc, calls } = client([
      json({ rows: rows(SEARCH_ANALYTICS_PAGE_SIZE) }),
      json({ rows: rows(SEARCH_ANALYTICS_PAGE_SIZE, SEARCH_ANALYTICS_PAGE_SIZE) }),
      json({ rows: rows(3, 2 * SEARCH_ANALYTICS_PAGE_SIZE) }),
    ]);
    const result = await gsc.querySearchAnalytics("sc-domain:abra-ca-dabra.app", {
      startDate: "2026-10-20",
      endDate: "2026-10-20",
      dimensions: ["date", "query"],
      dataState: "all",
    });
    expect(result).toHaveLength(2 * SEARCH_ANALYTICS_PAGE_SIZE + 3);
    expect(result[0]).toEqual({ keys: ["2026-10-20", "query 0"], clicks: 1, impressions: 10, ctr: 0.1, position: 4.5 });
    expect(calls.map((call) => call.body?.startRow)).toEqual([0, 25_000, 50_000]);
    expect(calls.every((call) => call.body?.rowLimit === 25_000)).toBe(true);
    expect(calls[0].url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Aabra-ca-dabra.app/searchAnalytics/query");
    expect(calls[0].body).toMatchObject({ dimensions: ["date", "query"], dataState: "all", startDate: "2026-10-20" });
  });

  it("stops at an empty first page and at maxPages", async () => {
    expect(await client([json({})]).gsc.querySearchAnalytics("sc-domain:a.com", { startDate: "2026-10-01", endDate: "2026-10-01", dimensions: ["page"] })).toEqual([]);
    const capped = client([json({ rows: rows(SEARCH_ANALYTICS_PAGE_SIZE) }), json({ rows: rows(SEARCH_ANALYTICS_PAGE_SIZE) })]);
    const result = await capped.gsc.querySearchAnalytics(
      "sc-domain:a.com",
      { startDate: "2026-10-01", endDate: "2026-10-01", dimensions: ["page"] },
      { maxPages: 2 },
    );
    expect(result).toHaveLength(2 * SEARCH_ANALYTICS_PAGE_SIZE);
    expect(capped.calls).toHaveLength(2);
  });

  it("rejects a bad date range or dimension before calling Google", async () => {
    const { gsc, calls } = client([]);
    await expect(gsc.querySearchAnalytics("sc-domain:a.com", { startDate: "2026-10-05", endDate: "2026-10-01", dimensions: ["date"] })).rejects.toMatchObject({ code: "invalid_date_range" });
    await expect(gsc.querySearchAnalytics("sc-domain:a.com", { startDate: "2026-10-01", endDate: "2026-10-01", dimensions: ["hour" as never] })).rejects.toMatchObject({ code: "invalid_dimension" });
    expect(calls).toHaveLength(0);
  });

  it("lists sitemaps with error, warning and submitted counts", async () => {
    const { gsc, calls } = client([
      json({
        sitemap: [
          {
            path: "https://abra-ca-dabra.app/sitemap.xml",
            lastSubmitted: "2026-10-20T10:00:00Z",
            lastDownloaded: "2026-10-22T03:00:00Z",
            isPending: false,
            isSitemapsIndex: false,
            errors: "0",
            warnings: "2",
            contents: [{ type: "web", submitted: "41", indexed: "0" }],
          },
        ],
      }),
    ]);
    expect(await gsc.listSitemaps("https://abra-ca-dabra.app/")).toEqual([
      {
        path: "https://abra-ca-dabra.app/sitemap.xml",
        lastSubmitted: "2026-10-20T10:00:00Z",
        lastDownloaded: "2026-10-22T03:00:00Z",
        isPending: false,
        isSitemapsIndex: false,
        errors: 0,
        warnings: 2,
        submitted: 41,
      },
    ]);
    expect(calls[0].url).toBe("https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fabra-ca-dabra.app%2F/sitemaps");
  });

  it("inspects one URL and returns the index status fields", async () => {
    const { gsc, calls } = client([
      json({
        inspectionResult: {
          indexStatusResult: {
            verdict: "NEUTRAL",
            coverageState: "Crawled - currently not indexed",
            indexingState: "INDEXING_ALLOWED",
            robotsTxtState: "ALLOWED",
            pageFetchState: "SUCCESSFUL",
            lastCrawlTime: "2026-10-21T08:00:00Z",
            googleCanonical: "https://abra-ca-dabra.app/films/",
            userCanonical: "https://abra-ca-dabra.app/films/",
            sitemap: ["https://abra-ca-dabra.app/sitemap.xml"],
          },
        },
      }),
    ]);
    const result = await gsc.inspectUrl("sc-domain:abra-ca-dabra.app", "https://abra-ca-dabra.app/films/");
    expect(result).toMatchObject({ verdict: "NEUTRAL", coverageState: "Crawled - currently not indexed", sitemaps: ["https://abra-ca-dabra.app/sitemap.xml"] });
    expect(calls[0]).toMatchObject({
      url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      method: "POST",
      body: { inspectionUrl: "https://abra-ca-dabra.app/films/", siteUrl: "sc-domain:abra-ca-dabra.app", languageCode: "en-US" },
    });
    const empty = await client([json({})]).gsc.inspectUrl("sc-domain:a.com", "https://a.com/");
    expect(empty).toMatchObject({ verdict: null, coverageState: null, sitemaps: [] });
  });

  it("backs off on 429 (honouring Retry-After) and on 5xx, then succeeds", async () => {
    const { gsc, sleeps } = client([
      json({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, 429, { "retry-after": "7" }),
      json({ error: { code: 503 } }, 503),
      json({ siteEntry: [] }),
    ]);
    expect(await gsc.listSites()).toEqual([]);
    expect(sleeps).toEqual([7000, 2000]);
  });

  it("gives up after maxRetries with rate_limited, and treats a 403 rate-limit reason as a rate limit", async () => {
    const limited = client(
      [
        json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429),
        json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429),
        json({ error: { status: "RESOURCE_EXHAUSTED" } }, 429),
      ],
      { maxRetries: 2 },
    );
    await expect(limited.gsc.listSites()).rejects.toMatchObject({ kind: "rate_limited", status: 429, code: "RESOURCE_EXHAUSTED" });
    expect(limited.sleeps).toEqual([1000, 2000]);
    const quota = client([json({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }, 403), json({ siteEntry: [] })]);
    expect(await quota.gsc.listSites()).toEqual([]);
  });

  it("signs in again once after a 401, then reports auth", async () => {
    const recovered = client([json({}, 401), json({ siteEntry: [] })]);
    expect(await recovered.gsc.listSites()).toEqual([]);
    expect(recovered.provider.invalidations).toBe(1);
    const failed = client([json({}, 401), json({ error: { status: "UNAUTHENTICATED" } }, 401)]);
    await expect(failed.gsc.listSites()).rejects.toMatchObject({ kind: "auth", status: 401 });
  });

  it("turns a 403 into access_lost when the client removed our service account, without leaking Google's text", async () => {
    const { gsc } = client([
      json({ error: { code: 403, status: "PERMISSION_DENIED", message: "User does not have sufficient permission for site 'sc-domain:secret.example'." } }, 403),
    ]);
    const error = await gsc.listSitemaps("sc-domain:secret.example").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SearchApiError);
    expect(error).toMatchObject({ kind: "access_lost", status: 403, code: "PERMISSION_DENIED" });
    expect((error as Error).message).not.toContain("secret.example");
  });

  it("maps 404 and other 4xx, and retries network errors before reporting network", async () => {
    await expect(client([json({}, 404)]).gsc.listSitemaps("sc-domain:a.com")).rejects.toMatchObject({ kind: "not_found" });
    await expect(client([json({ error: { status: "INVALID_ARGUMENT" } }, 400)]).gsc.listSites()).rejects.toMatchObject({ kind: "bad_request", code: "INVALID_ARGUMENT" });
    const offline = client([new Error("reset"), new Error("reset")], { maxRetries: 1 });
    await expect(offline.gsc.listSites()).rejects.toMatchObject({ kind: "network" });
    expect(offline.sleeps).toEqual([1000]);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates, caps at a minute, and ignores junk", () => {
    expect(retryAfterMs("3")).toBe(3000);
    expect(retryAfterMs("600")).toBe(60_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(retryAfterMs("soon")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});
