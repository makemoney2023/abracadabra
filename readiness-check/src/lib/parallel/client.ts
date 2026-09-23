import "server-only";

import type {
  ParallelClient,
  ParallelExtractResult,
  ParallelLead,
  ParallelSearchResult,
} from "./types";

const BASE_URL = "https://api.parallel.ai";

/** Backoff delays (ms) between retry attempts for transient 5xx/429 responses. */
const RETRY_DELAYS_MS = [100, 400];

function getApiKey(): string {
  const key = process.env.PARALLEL_API_KEY;
  if (!key) {
    throw new Error("Missing PARALLEL_API_KEY environment variable");
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

async function postWithRetry(
  apiKey: string,
  path: string,
  body: Record<string, unknown>
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const isLastAttempt = attempt === RETRY_DELAYS_MS.length;

    let response: Response | undefined;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      lastError = err;
      if (isLastAttempt) throw err;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    const needsRetry = !response.ok && isRetryableStatus(response.status);
    if (!needsRetry) return response;

    lastError = new Error(
      `Parallel API request to ${path} failed with status ${response.status}`
    );
    if (isLastAttempt) throw lastError;
    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError ?? new Error(`Parallel API request to ${path} failed`);
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function parseOkJson(response: Response, context: string): Promise<Record<string, unknown>> {
  const data = await readJsonBody(response);
  if (!response.ok) {
    const detail = typeof data.message === "string" ? data.message : JSON.stringify(data);
    throw new Error(`Parallel API ${context} failed with status ${response.status}: ${detail}`);
  }
  return data;
}

function toStringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Parallel Extract returns `full_content` / `excerpts`, not a `content` field. */
function extractResultContent(raw: Record<string, unknown>): string {
  const full = toStringOrUndefined(raw.full_content);
  if (full?.trim()) return full;

  const legacy = toStringOrUndefined(raw.content);
  if (legacy?.trim()) return legacy;

  if (Array.isArray(raw.excerpts)) {
    const parts = raw.excerpts
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length > 0) return parts.join("\n\n");
  }

  return "";
}

function toNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function toLead(raw: Record<string, unknown>): ParallelLead {
  const domain =
    toStringOrUndefined(raw.domain) ??
    (() => {
      const website = toStringOrUndefined(raw.website);
      if (!website) return "";
      try {
        return new URL(website).hostname;
      } catch {
        return "";
      }
    })();

  const contactsRaw = Array.isArray(raw.contacts) ? raw.contacts : [];

  return {
    name: toStringOrUndefined(raw.name),
    domain,
    website: toStringOrUndefined(raw.website),
    industry: toStringOrUndefined(raw.industry),
    contacts: contactsRaw.map((entry) => {
      const contact = (entry ?? {}) as Record<string, unknown>;
      return {
        name: toStringOrUndefined(contact.name),
        title: toStringOrUndefined(contact.title),
        email: toStringOrUndefined(contact.email),
        phone: toStringOrUndefined(contact.phone),
        confidence: toNumberOrUndefined(contact.confidence),
      };
    }),
    raw,
  };
}

async function extract(
  apiKey: string,
  urls: string[],
  opts?: { objective?: string; fullContent?: boolean }
): Promise<ParallelExtractResult[]> {
  const response = await postWithRetry(apiKey, "/v1beta/extract", {
    urls,
    excerpts: true,
    full_content: opts?.fullContent ?? true,
    objective: opts?.objective,
  });
  const data = await parseOkJson(response, "extract");

  const results = Array.isArray(data.results)
    ? (data.results as Array<Record<string, unknown>>).map((r) => ({
        url: toStringOrUndefined(r.url) ?? "",
        title: toStringOrUndefined(r.title),
        content: extractResultContent(r),
      }))
    : [];

  const errored = Array.isArray(data.errors)
    ? (data.errors as Array<Record<string, unknown>>).map((e) => ({
        url: toStringOrUndefined(e.url) ?? "",
        content: "",
        error:
          toStringOrUndefined(e.message) ?? toStringOrUndefined(e.error) ?? "Unknown extract error",
      }))
    : [];

  return [...results, ...errored];
}

async function search(
  apiKey: string,
  objective: string,
  opts: { includeDomains: string[]; maxResults?: number }
): Promise<ParallelSearchResult[]> {
  const response = await postWithRetry(apiKey, "/v1beta/search", {
    objective,
    include_domains: opts.includeDomains,
    max_results: opts.maxResults,
  });
  const data = await parseOkJson(response, "search");

  if (!Array.isArray(data.results)) return [];

  return (data.results as Array<Record<string, unknown>>).map((r) => ({
    url: toStringOrUndefined(r.url) ?? "",
    title: toStringOrUndefined(r.title),
    excerpt: toStringOrUndefined(r.excerpt),
  }));
}

async function findAllAndEnrich(apiKey: string, objective: string): Promise<ParallelLead[]> {
  const response = await postWithRetry(apiKey, "/v1beta/findall/ingest", {
    query: objective,
  });
  const data = await parseOkJson(response, "findAllAndEnrich");

  if (!Array.isArray(data.results)) return [];

  return (data.results as Array<Record<string, unknown>>).map(toLead);
}

export function createParallelClient(): ParallelClient {
  const apiKey = getApiKey();

  return {
    extract: (urls, opts) => extract(apiKey, urls, opts),
    search: (objective, opts) => search(apiKey, objective, opts),
    findAllAndEnrich: (objective) => findAllAndEnrich(apiKey, objective),
  };
}
