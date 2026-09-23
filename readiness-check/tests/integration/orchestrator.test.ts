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
    const parallel = createTestParallel();

    await runScan("s1", { parallel, repo });

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
    const parallel = createTestParallel();

    await runScan("s2", { parallel, repo });

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
