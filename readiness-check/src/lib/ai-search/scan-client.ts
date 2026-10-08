import "server-only";

import type { ParallelExtractResult, ParallelSearchResult } from "@/lib/parallel/types";

const API = "https://api.cloudflare.com/client/v4";
const FETCH_TIMEOUT_MS = 8_000;

export type AiSearchEnv = {
  accountId?: string;
  apiToken?: string;
};

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function apexHost(value: string): string {
  try {
    const href = value.includes("://") ? value : `https://${value}`;
    return new URL(href).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Pages linked from HTML that stay on the scanned site. */
export function sameSiteLinks(html: string, origin: string, limit: number): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const site = apexHost(origin);
  const pattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = pattern.exec(html);
  while (match && found.length < limit) {
    const raw = match[1]?.trim() ?? "";
    match = pattern.exec(html);
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    let absolute: URL;
    try {
      absolute = new URL(raw, origin);
    } catch {
      continue;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
    if (apexHost(absolute.href) !== site) continue;
    absolute.hash = "";
    if (seen.has(absolute.href)) continue;
    seen.add(absolute.href);
    found.push(absolute.href);
  }
  return found;
}

export function instanceIdForDomain(domain: string): string {
  const slug = domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `schema-${slug || "site"}`.slice(0, 64);
}

function instancesUrl(accountId: string): string {
  return `${API}/accounts/${accountId}/ai-search/namespaces/default/instances`;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await response.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function chunkUrls(domain: string, body: Record<string, unknown>): ParallelSearchResult[] {
  const result = body.result;
  if (!result || typeof result !== "object" || Array.isArray(result)) return [];
  const chunks = (result as { chunks?: unknown }).chunks;
  if (!Array.isArray(chunks)) return [];
  const site = apexHost(domain);
  const rows: ParallelSearchResult[] = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const record = chunk as { text?: unknown; item?: { metadata?: { url?: unknown } } };
    const raw = record.item?.metadata?.url;
    if (typeof raw !== "string") continue;
    let href = "";
    try {
      const parsed = new URL(raw);
      parsed.hash = "";
      href = parsed.href;
    } catch {
      continue;
    }
    if (apexHost(href) !== site) continue;
    rows.push({
      url: href,
      excerpt: typeof record.text === "string" ? record.text : undefined,
    });
  }
  return rows;
}

async function indexedPageUrls(input: {
  fetchImpl: FetchImpl;
  accountId: string;
  token: string;
  domain: string;
  homepage: string;
  html: string;
  objective: string;
}): Promise<ParallelSearchResult[]> {
  const { fetchImpl, accountId, token, domain, homepage, html, objective } = input;
  const auth = { Authorization: `Bearer ${token}` };
  const instanceId = instanceIdForDomain(domain);
  const instanceUrl = `${instancesUrl(accountId)}/${instanceId}`;
  const existing = await fetchImpl(instanceUrl, { method: "GET", headers: auth });
  if (!existing.ok) {
    const created = await fetchImpl(instancesUrl(accountId), {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ id: instanceId }),
    });
    if (!created.ok) return [];
  }

  const form = new FormData();
  form.set("file", new File([html], "home.html", { type: "text/html" }));
  form.set("metadata", JSON.stringify({ url: homepage, domain }));
  form.set("wait_for_completion", "true");
  const uploaded = await fetchImpl(`${instanceUrl}/items`, {
    method: "POST",
    headers: auth,
    body: form,
  });
  if (!uploaded.ok) return [];

  const searched = await fetchImpl(`${instanceUrl}/search`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: objective }],
    }),
  });
  if (!searched.ok) return [];
  return chunkUrls(domain, await readJson(searched));
}

/**
 * Schema scans fetch public pages directly. Cloudflare AI Search can only crawl a
 * domain that is on the same account, so this client uploads the homepage into
 * built-in storage and searches that instance for more pages.
 */
export function createAiSearchScanClient(options?: { env?: AiSearchEnv; fetchImpl?: FetchImpl }) {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const env = options?.env ?? {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  };

  return {
    async extract(urls: string[]): Promise<ParallelExtractResult[]> {
      return Promise.all(
        urls.map(async (url) => {
          try {
            const response = await fetchImpl(url, {
              method: "GET",
              redirect: "follow",
              headers: {
                Accept: "text/html,application/xhtml+xml,text/plain,application/xml,text/xml,*/*",
                "User-Agent": "SchemaAEOScanner/1.0",
              },
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) return { url, content: "", error: String(response.status) };
            return { url, content: await response.text() };
          } catch (error) {
            return { url, content: "", error: error instanceof Error ? error.message : "fetch failed" };
          }
        }),
      );
    },

    async search(
      objective: string,
      opts: { includeDomains: string[]; maxResults?: number },
    ): Promise<ParallelSearchResult[]> {
      const domain = opts.includeDomains[0]?.trim() ?? "";
      if (!domain) return [];
      const origin = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
      const homepage = `${origin}/`;
      let html = "";
      try {
        const response = await fetchImpl(homepage, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (response.ok) html = await response.text();
      } catch {
        html = "";
      }
      const limit = opts.maxResults ?? 10;
      const links = sameSiteLinks(html, homepage, limit).map((url) => ({ url }));
      const accountId = env.accountId?.trim() ?? "";
      const token = env.apiToken?.trim() ?? "";
      const indexed =
        accountId && token && html
          ? await indexedPageUrls({ fetchImpl, accountId, token, domain, homepage, html, objective })
          : [];
      const rows: ParallelSearchResult[] = [];
      const seen = new Set<string>();
      for (const row of [...links, ...indexed]) {
        if (seen.has(row.url) || rows.length >= limit) continue;
        seen.add(row.url);
        rows.push(row);
      }
      return rows;
    },
  };
}
