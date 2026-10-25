import { SearchApiError, safeErrorCode } from "./errors";
import { GSC_READONLY_SCOPE, type TokenProvider } from "./google-auth";

/**
 * Read-only Search Console client: sites list, Search Analytics (with pagination), sitemaps list and URL Inspection.
 * Retries 429 and 5xx with exponential backoff (honours Retry-After, capped), signs in again once after a 401,
 * and turns a 403 into access_lost (the client removed our service account) unless Google says it is a rate limit.
 */

const WEBMASTERS = "https://www.googleapis.com/webmasters/v3";
const INSPECTION = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
/** Google's maximum rows per Search Analytics request. */
export const SEARCH_ANALYTICS_PAGE_SIZE = 25_000;
const MAX_RETRY_AFTER_MS = 60_000;

export type SiteEntry = { siteUrl: string; permissionLevel: string };

export const SEARCH_DIMENSIONS = ["date", "query", "page", "country", "device", "searchAppearance"] as const;
export type SearchDimension = (typeof SEARCH_DIMENSIONS)[number];
const DIMENSION_SET: ReadonlySet<string> = new Set(SEARCH_DIMENSIONS);

export type SearchAnalyticsRequest = {
  startDate: string;
  endDate: string;
  dimensions: SearchDimension[];
  type?: "web" | "image" | "video" | "news" | "discover" | "googleNews";
  dataState?: "final" | "all";
  aggregationType?: "auto" | "byPage" | "byProperty";
  dimensionFilterGroups?: unknown[];
};

export type SearchAnalyticsRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SitemapEntry = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  isSitemapsIndex: boolean;
  errors: number;
  warnings: number;
  submitted: number;
};

export type UrlInspection = {
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  sitemaps: string[];
};

export type GscClient = {
  listSites(): Promise<SiteEntry[]>;
  querySearchAnalytics(siteUrl: string, request: SearchAnalyticsRequest, options?: { maxPages?: number }): Promise<SearchAnalyticsRow[]>;
  listSitemaps(siteUrl: string): Promise<SitemapEntry[]>;
  inspectUrl(siteUrl: string, inspectionUrl: string, languageCode?: string): Promise<UrlInspection>;
};

export function createGscClient(input: {
  tokens: TokenProvider;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  baseDelayMs?: number;
}): GscClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxRetries = input.maxRetries ?? 4;
  const baseDelayMs = input.baseDelayMs ?? 1000;

  async function call(url: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<Record<string, unknown>> {
    let reauthed = false;
    for (let attempt = 0; ; attempt += 1) {
      const token = await input.tokens.token(GSC_READONLY_SCOPE);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: init.method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
        });
      } catch {
        if (attempt < maxRetries) {
          await sleep(backoff(attempt));
          continue;
        }
        throw new SearchApiError("network", 0);
      }
      if (response.ok) return readObject(response);
      const body = await readObject(response);
      const { code, reasons } = googleError(body);
      if (response.status === 401) {
        input.tokens.invalidate(GSC_READONLY_SCOPE);
        if (!reauthed) {
          reauthed = true;
          continue;
        }
        throw new SearchApiError("auth", 401, code);
      }
      const rateLimited = response.status === 429 || (response.status === 403 && reasons.some((reason) => /rate|quota/i.test(reason)));
      if (rateLimited || response.status >= 500) {
        const retryAfter = retryAfterMs(response.headers.get("retry-after"));
        if (attempt < maxRetries) {
          await sleep(retryAfter ?? backoff(attempt));
          continue;
        }
        throw new SearchApiError(rateLimited ? "rate_limited" : "server", response.status, code, retryAfter);
      }
      if (response.status === 403) throw new SearchApiError("access_lost", 403, code);
      if (response.status === 404) throw new SearchApiError("not_found", 404, code);
      throw new SearchApiError("bad_request", response.status, code);
    }
  }

  function backoff(attempt: number): number {
    return Math.min(baseDelayMs * 2 ** attempt, MAX_RETRY_AFTER_MS);
  }

  return {
    async listSites() {
      const body = await call(`${WEBMASTERS}/sites`, { method: "GET" });
      const entries = Array.isArray(body.siteEntry) ? body.siteEntry : [];
      return entries
        .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}))
        .filter((entry) => typeof entry.siteUrl === "string")
        .map((entry) => ({ siteUrl: String(entry.siteUrl), permissionLevel: typeof entry.permissionLevel === "string" ? entry.permissionLevel : "" }));
    },

    async querySearchAnalytics(siteUrl, request, options = {}) {
      validateRequest(request);
      const maxPages = Math.max(1, Math.min(options.maxPages ?? 40, 400));
      const rows: SearchAnalyticsRow[] = [];
      for (let page = 0; page < maxPages; page += 1) {
        const body = await call(`${WEBMASTERS}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
          method: "POST",
          body: { ...request, rowLimit: SEARCH_ANALYTICS_PAGE_SIZE, startRow: page * SEARCH_ANALYTICS_PAGE_SIZE },
        });
        const batch = Array.isArray(body.rows) ? body.rows.map(toRow) : [];
        rows.push(...batch);
        if (batch.length < SEARCH_ANALYTICS_PAGE_SIZE) break;
      }
      return rows;
    },

    async listSitemaps(siteUrl) {
      const body = await call(`${WEBMASTERS}/sites/${encodeURIComponent(siteUrl)}/sitemaps`, { method: "GET" });
      const entries = Array.isArray(body.sitemap) ? body.sitemap : [];
      return entries.map((raw) => {
        const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
        const contents = Array.isArray(entry.contents) ? entry.contents : [];
        const submitted = contents.reduce<number>((sum, item) => {
          const value = item && typeof item === "object" ? Number((item as Record<string, unknown>).submitted ?? 0) : 0;
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0);
        return {
          path: String(entry.path ?? ""),
          lastSubmitted: str(entry.lastSubmitted),
          lastDownloaded: str(entry.lastDownloaded),
          isPending: entry.isPending === true,
          isSitemapsIndex: entry.isSitemapsIndex === true,
          errors: num(entry.errors),
          warnings: num(entry.warnings),
          submitted,
        };
      });
    },

    async inspectUrl(siteUrl, inspectionUrl, languageCode = "en-US") {
      const body = await call(INSPECTION, { method: "POST", body: { inspectionUrl, siteUrl, languageCode } });
      const result = obj(obj(body.inspectionResult).indexStatusResult);
      return {
        verdict: str(result.verdict),
        coverageState: str(result.coverageState),
        indexingState: str(result.indexingState),
        robotsTxtState: str(result.robotsTxtState),
        pageFetchState: str(result.pageFetchState),
        lastCrawlTime: str(result.lastCrawlTime),
        googleCanonical: str(result.googleCanonical),
        userCanonical: str(result.userCanonical),
        sitemaps: Array.isArray(result.sitemap) ? result.sitemap.filter((item): item is string => typeof item === "string") : [],
      };
    },
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validateRequest(request: SearchAnalyticsRequest): void {
  if (!DAY.test(request.startDate) || !DAY.test(request.endDate) || request.startDate > request.endDate) {
    throw new SearchApiError("bad_request", 0, "invalid_date_range");
  }
  if (!request.dimensions.every((dimension) => DIMENSION_SET.has(dimension))) {
    throw new SearchApiError("bad_request", 0, "invalid_dimension");
  }
}

function toRow(raw: unknown): SearchAnalyticsRow {
  const row = obj(raw);
  return {
    keys: Array.isArray(row.keys) ? row.keys.map((key) => String(key)) : [],
    clicks: num(row.clicks),
    impressions: num(row.impressions),
    ctr: num(row.ctr),
    position: num(row.position),
  };
}

async function readObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json();
    return obj(parsed);
  } catch {
    return {};
  }
}

function googleError(body: Record<string, unknown>): { code: string | null; reasons: string[] } {
  const error = obj(body.error);
  const details = Array.isArray(error.errors) ? error.errors : [];
  const reasons = details
    .map((item) => obj(item).reason)
    .filter((reason): reason is string => typeof reason === "string");
  return { code: safeErrorCode(error.status) ?? safeErrorCode(reasons[0]), reasons };
}

/** Retry-After is seconds or an HTTP date. Capped at a minute; anything unreadable means "use our own backoff". */
export function retryAfterMs(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(header);
  if (Number.isFinite(at)) return Math.min(Math.max(at - now, 0), MAX_RETRY_AFTER_MS);
  return null;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
