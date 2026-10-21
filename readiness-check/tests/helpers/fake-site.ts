import type { ScanSiteClient } from "@/lib/scan/orchestrator";
import type { ParallelExtractResult } from "@/lib/parallel/types";

export type FakeSiteOptions = {
  origin?: string;
  /** Page paths in the sitemap, e.g. "/blog/post-1". */
  paths: string[];
  /** Paths that answer with an error. */
  failing?: string[];
  /** Paths whose HTML carries Organization JSON-LD. */
  withSchema?: string[];
  /** Split the sitemap into a sitemap index with this many URLs per child sitemap. */
  childSize?: number;
  llmsTxt?: string | null;
};

export type FakeSite = ScanSiteClient & { extracted: string[]; throwOnce: Set<string> };

function pageHtml(path: string, schema: boolean): string {
  const jsonLd = schema
    ? `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>`
    : "";
  return `<!doctype html><html><head><title>${path}</title>${jsonLd}</head><body><h1>Page ${path}</h1><p>${"Acme makes things. ".repeat(200)}</p></body></html>`;
}

/** An in-memory site: sitemap (optionally an index), robots, llms.txt and HTML pages. No network. */
export function fakeSite(options: FakeSiteOptions): FakeSite {
  const origin = options.origin ?? "https://acme.example";
  const failing = new Set(options.failing ?? []);
  const withSchema = new Set(options.withSchema ?? []);
  const urls = options.paths.map((p) => `${origin}${p}`);
  const files = new Map<string, string>();
  const locs = (list: string[]) => list.map((u) => `<url><loc>${u}</loc></url>`).join("");
  if (options.childSize) {
    const children: string[] = [];
    for (let i = 0; i < urls.length; i += options.childSize) {
      const child = `${origin}/sitemap-${children.length + 1}.xml`;
      children.push(child);
      files.set(child, `<?xml version="1.0"?><urlset>${locs(urls.slice(i, i + options.childSize))}</urlset>`);
    }
    files.set(
      `${origin}/sitemap.xml`,
      `<?xml version="1.0"?><sitemapindex>${children.map((c) => `<sitemap><loc>${c}</loc></sitemap>`).join("")}</sitemapindex>`,
    );
  } else {
    files.set(`${origin}/sitemap.xml`, `<?xml version="1.0"?><urlset>${locs(urls)}</urlset>`);
  }
  files.set(`${origin}/robots.txt`, "User-agent: *\nAllow: /\n");
  if (options.llmsTxt !== null) {
    files.set(`${origin}/llms.txt`, options.llmsTxt ?? `# Acme\n\n> We make things.\n\n## Pages\n\n- [Home](${origin}/): start here\n`);
  }

  const extracted: string[] = [];
  const throwOnce = new Set<string>();
  return {
    extracted,
    throwOnce,
    async extract(list: string[]): Promise<ParallelExtractResult[]> {
      for (const url of list) {
        if (throwOnce.has(url)) {
          throwOnce.delete(url);
          throw new Error(`network down for ${url}`);
        }
      }
      extracted.push(...list);
      return list.map((url) => {
        const file = files.get(url);
        if (file) return { url, content: file };
        const path = url.slice(origin.length) || "/";
        const normalized = path === "" ? "/" : path;
        if (failing.has(normalized)) return { url, content: "", error: "500" };
        if (normalized === "/" || options.paths.includes(normalized) || options.paths.includes(normalized.replace(/\/$/, ""))) {
          return { url, content: pageHtml(normalized, withSchema.has(normalized)) };
        }
        return { url, content: "", error: "404" };
      });
    },
    async search() {
      return [];
    },
  };
}

/** A queue that records messages; `drain` hands each one to a handler, like the consumer would. */
export function fakeQueue() {
  const messages: Array<{ body: Record<string, unknown>; delaySeconds?: number }> = [];
  return {
    messages,
    async send(body: unknown, options?: { delaySeconds?: number }) {
      messages.push({ body: body as Record<string, unknown>, delaySeconds: options?.delaySeconds });
    },
    async sendBatch(list: Array<{ body: unknown; delaySeconds?: number }>) {
      for (const item of list) messages.push({ body: item.body as Record<string, unknown>, delaySeconds: item.delaySeconds });
    },
    take(filter: (body: Record<string, unknown>) => boolean) {
      const out = messages.filter((m) => filter(m.body));
      for (const m of out) messages.splice(messages.indexOf(m), 1);
      return out.map((m) => m.body);
    },
  };
}
