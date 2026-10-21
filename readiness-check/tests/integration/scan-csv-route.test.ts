import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { memoryCheckDb } from "../helpers/memory-sql";

const holder: { env: CheckBindings } = { env: {} };
const cookieJar = new Map<string, string>();

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: holder.env }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined),
  }),
}));

const TOKEN = "tokCsv1";
const ctx = { params: Promise.resolve({ token: TOKEN }) };

async function seed(source = "public", status = "complete") {
  const db = holder.env.DB!;
  await db
    .prepare(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, score_total, created_at)
       VALUES ('scan-csv', ?, 'acme.example', 'https://acme.example', ?, ?, 50, 1)`,
    )
    .bind(TOKEN, source, status)
    .run();
  for (let i = 0; i < 120; i += 1) {
    await db
      .prepare(
        `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json)
         VALUES (?, 'scan-csv', ?, 'blogPost', ?, 0, '[]', ?)`,
      )
      .bind(crypto.randomUUID(), `https://acme.example/blog/${i}`, i === 7 ? "failed" : "ok", JSON.stringify({ scrapedText: "x".repeat(5000) }))
      .run();
  }
}

describe("GET /api/scans/[token]/csv", () => {
  beforeEach(() => {
    cookieJar.clear();
    holder.env = { DB: memoryCheckDb() };
  });

  it("is closed without the email unlock, like the page matrix", async () => {
    await seed();
    const { GET } = await import("@/app/api/scans/[token]/csv/route");
    expect((await GET(new Request("http://localhost/x"), ctx)).status).toBe(401);
  });

  it("returns every page after the unlock, failures first", async () => {
    await seed();
    cookieJar.set(`scan_unlock_${TOKEN}`, "1");
    const { GET } = await import("@/app/api/scans/[token]/csv/route");
    const res = await GET(new Request("http://localhost/x"), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(121);
    expect(lines[1]).toContain("/blog/7,");
    expect(lines.join("\n")).not.toContain("xxxxx");
  });

  it("is open for a staff (ops) scan, and 409 while a scan runs", async () => {
    await seed("ops", "running");
    const { GET } = await import("@/app/api/scans/[token]/csv/route");
    expect((await GET(new Request("http://localhost/x"), ctx)).status).toBe(409);
  });
});

describe("GET /api/scans/[token] progress", () => {
  beforeEach(() => {
    cookieJar.clear();
    holder.env = { DB: memoryCheckDb() };
  });

  it("reports pages_done / pages_total while a chunked scan runs, without page rows", async () => {
    await seed("public", "running");
    await holder.env.DB!.prepare(
      `INSERT INTO readiness_scan_runs (scan_id, tier, page_limit, pages_total, pages_done, created_at, updated_at)
       VALUES ('scan-csv', 'deep-1000', 1000, 1000, 350, 1, 1)`,
    )
      .bind()
      .run();
    const { GET } = await import("@/app/api/scans/[token]/route");
    const json = (await (await GET(new Request("http://localhost/x"), ctx)).json()) as Record<string, unknown>;
    expect(json.progress).toEqual({ tier: "deep-1000", pagesDone: 350, pagesTotal: 1000, partial: false });
    expect(json.pageCount).toBe(0);
  });

  it("caps the free missing-schema list at 40 and gives the total", async () => {
    await seed();
    const { GET } = await import("@/app/api/scans/[token]/route");
    const json = (await (await GET(new Request("http://localhost/x"), ctx)).json()) as {
      pagesMissingJsonLd: unknown[];
      pagesMissingJsonLdTotal: number;
      unlocked: boolean;
      pages?: unknown[];
    };
    expect(json.unlocked).toBe(false);
    expect(json.pages).toBeUndefined();
    expect(json.pagesMissingJsonLd).toHaveLength(40);
    expect(json.pagesMissingJsonLdTotal).toBe(119);
  });
});
