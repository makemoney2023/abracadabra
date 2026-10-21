import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMockParallel } from "@/lib/parallel/mock";
import { computeOpsPriority } from "@/lib/ops/priority";
import { runScan } from "@/lib/scan/orchestrator";
import { createInMemoryScanRepository } from "@/lib/scan/repository";

const fixturesDir = path.resolve(__dirname, "../../src/fixtures");
const healthyHomeHtml = readFileSync(path.join(fixturesDir, "healthy-home.html"), "utf8");
const sampleLlms = readFileSync(path.join(fixturesDir, "sample-llms.txt"), "utf8");
const sampleSitemap = readFileSync(path.join(fixturesDir, "sample-sitemap.xml"), "utf8");

const ROBOTS_ALLOW_ALL = "User-agent: *\nAllow: /\n";

const missingProbe = async () => ({ exists: false, status: 404, finalUrl: null });

function contentForUrl(url: string): { content: string; error?: string } {
  const pathname = new URL(url).pathname;
  if (pathname === "/robots.txt") return { content: ROBOTS_ALLOW_ALL };
  if (pathname === "/sitemap.xml") return { content: sampleSitemap };
  if (pathname === "/llms.txt") return { content: sampleLlms };
  if (pathname === "/llms-full.txt") return { content: "", error: "Not found" };
  if (pathname === "/" || pathname === "") return { content: healthyHomeHtml };
  return { content: "" };
}

function createTestParallel() {
  return createMockParallel({
    extract: async (urls) =>
      urls.map((url) => {
        const result = contentForUrl(url);
        return { url, content: result.content, error: result.error };
      }),
    search: async () => [{ url: "https://example.com/pricing", title: "Pricing" }],
  });
}

describe("runScan orchestrator", () => {
  it("maps, extracts, scores, and completes a public scan", async () => {
    const repo = createInMemoryScanRepository([
      {
        id: "s1",
        domain: "example.com",
        origin: "https://example.com",
        source: "public",
        status: "queued",
      },
    ]);
    const site = createTestParallel();

    await runScan("s1", { site, repo, probe: missingProbe });

    const scan = await repo.getScan("s1");
    expect(scan?.status).toBe("complete");
    expect(scan?.scoreTotal).toBeGreaterThanOrEqual(70);

    const pages = repo.getPages("s1");
    expect(pages.length).toBeGreaterThanOrEqual(1);
    const home = pages.find((p) => p.pageType === "home" || p.url === "https://example.com/");
    expect(home?.hasJsonLd).toBe(true);

    const findings = repo.getFindings("s1");
    expect(Array.isArray(findings)).toBe(true);
  });

  it("upserts ops queue with priority when source is ops", async () => {
    const repo = createInMemoryScanRepository([
      {
        id: "s2",
        domain: "example.com",
        origin: "https://example.com",
        source: "ops",
        status: "queued",
        leadId: "lead-1",
        hasContact: true,
      },
    ]);
    const site = createTestParallel();

    await runScan("s2", { site, repo, probe: missingProbe });

    const scan = await repo.getScan("s2");
    expect(scan?.status).toBe("complete");
    expect(typeof scan?.scoreTotal).toBe("number");

    const queue = repo.getOpsQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      leadId: "lead-1",
      scanId: "s2",
      missingContact: false,
      priorityScore: computeOpsPriority({
        scoreTotal: scan!.scoreTotal!,
        hasContact: true,
      }),
    });
  });
});

describe("runScan guessed template paths", () => {
  const origin = "https://example.com";
  const sitemap = `<?xml version="1.0"?><urlset>${["/", "/about/", "/services/", "/portfolio/", "/start/"]
    .map((p) => `<url><loc>${origin}${p}</loc></url>`)
    .join("")}</urlset>`;

  function site(extracted: string[]) {
    return createMockParallel({
      extract: async (urls) =>
        urls.map((url) => {
          extracted.push(url);
          const pathname = new URL(url).pathname;
          if (pathname === "/robots.txt") return { url, content: ROBOTS_ALLOW_ALL };
          if (pathname === "/sitemap.xml") return { url, content: sitemap };
          if (pathname === "/llms.txt") return { url, content: sampleLlms };
          if (pathname === "/llms-full.txt") return { url, content: sampleLlms };
          if (pathname === "/" || pathname === "") return { url, content: healthyHomeHtml };
          if (["/about", "/services", "/portfolio", "/start", "/about/", "/services/", "/portfolio/", "/start/"].includes(pathname)) {
            return { url, content: "<html><body>page</body></html>" };
          }
          if (pathname === "/faq") return { url, content: "", error: "extract failed" };
          return { url, content: "", error: "Not found" };
        }),
      search: async () => [],
    });
  }

  it("checks guesses first, extracts only the ones that exist, and never counts a guess as failed", async () => {
    const repo = createInMemoryScanRepository([
      { id: "g1", domain: "example.com", origin, source: "public", status: "queued" },
    ]);
    const extracted: string[] = [];
    const probed: string[] = [];
    const probe = async (url: string) => {
      probed.push(url);
      const pathname = new URL(url).pathname;
      if (pathname === "/faq") return { exists: true, status: 200, finalUrl: url };
      // /contact redirects onto /start/, which the sitemap already lists.
      if (pathname === "/contact") return { exists: true, status: 200, finalUrl: `${origin}/start/` };
      return { exists: false, status: 404, finalUrl: null };
    };

    await runScan("g1", { site: site(extracted), repo, probe });

    expect(probed.map((u) => new URL(u).pathname)).toEqual(expect.arrayContaining(["/contact", "/pricing", "/faq", "/book"]));
    expect(probed.some((u) => /\/(about|services)$/.test(new URL(u).pathname))).toBe(false);
    const extractedPaths = extracted.map((u) => new URL(u).pathname);
    for (const missing of ["/pricing", "/book", "/appointment", "/testimonials", "/reviews", "/contact"]) {
      expect(extractedPaths).not.toContain(missing);
    }
    expect(extractedPaths).toContain("/faq");

    const pages = repo.getPages("g1");
    expect(pages.some((p) => p.fetchStatus === "failed")).toBe(false);
    expect(pages.map((p) => new URL(p.url).pathname)).toEqual(expect.arrayContaining(["/", "/about", "/services", "/portfolio", "/start"]));
    expect(repo.getFindings("g1").some((f) => f.code === "PAGES_FETCH_FAILED")).toBe(false);
  });

  it("still reports real sitemap pages that fail", async () => {
    const repo = createInMemoryScanRepository([
      { id: "g2", domain: "example.com", origin, source: "public", status: "queued" },
    ]);
    const broken = createMockParallel({
      extract: async (urls) =>
        urls.map((url) => {
          const pathname = new URL(url).pathname;
          if (pathname === "/sitemap.xml") return { url, content: sitemap };
          if (pathname === "/" || pathname === "") return { url, content: healthyHomeHtml };
          if (pathname === "/portfolio") return { url, content: "", error: "Not found" };
          if (pathname === "/robots.txt") return { url, content: ROBOTS_ALLOW_ALL };
          return { url, content: "<html>ok</html>" };
        }),
      search: async () => [],
    });
    await runScan("g2", { site: broken, repo, probe: missingProbe });
    const failed = repo.getPages("g2").filter((p) => p.fetchStatus === "failed").map((p) => new URL(p.url).pathname);
    expect(failed).toEqual(["/portfolio"]);
    expect(repo.getFindings("g2").some((f) => f.code === "PAGES_FETCH_FAILED")).toBe(true);
  });
});
