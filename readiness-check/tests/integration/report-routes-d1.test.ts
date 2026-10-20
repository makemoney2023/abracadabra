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
    set: (name: string, value: string) => cookieJar.set(name, value),
  }),
}));

// Guard against any Supabase use: these routes must run on D1 alone.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("Missing Supabase admin env");
  },
}));

const TOKEN = "tokReport1";
const SCAN_ID = "scan-report-1";
const ctx = { params: Promise.resolve({ token: TOKEN }) };

async function seed(status = "complete") {
  const db = holder.env.DB!;
  await db
    .prepare(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, score_total, score_breakdown_json, created_at, completed_at)
       VALUES (?, ?, 'acme.example', 'https://acme.example', 'public', ?, 42, ?, 1, 2)`,
    )
    .bind(
      SCAN_ID,
      TOKEN,
      status,
      JSON.stringify({ total: 42, pillars: [] }),
    )
    .run();
  for (const [url, type] of [
    ["https://acme.example/", "home"],
    ["https://acme.example/contact", "other"],
  ]) {
    await db
      .prepare(
        `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json)
         VALUES (?, ?, ?, ?, 'ok', 0, '[]', '{}')`,
      )
      .bind(crypto.randomUUID(), SCAN_ID, url, type)
      .run();
  }
  await db
    .prepare(
      `INSERT INTO readiness_scan_findings (id, scan_id, page_url, code, severity, passed, message, evidence_json)
       VALUES (?, ?, NULL, 'SITEMAP_MISSING', 'warn', 0, 'sitemap.xml is missing.', '{}')`,
    )
    .bind(crypto.randomUUID(), SCAN_ID)
    .run();
}

describe("PDF report on D1", () => {
  beforeEach(async () => {
    cookieJar.clear();
    holder.env = { DB: memoryCheckDb() };
    await seed();
  });

  it("returns 401 without the email unlock", async () => {
    const { GET } = await import("@/app/api/scans/[token]/pdf/route");
    const res = await GET(new Request(`http://localhost/api/scans/${TOKEN}/pdf`), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown scan even when unlocked", async () => {
    cookieJar.set("scan_unlock_nope", "1");
    const { GET } = await import("@/app/api/scans/[token]/pdf/route");
    const res = await GET(new Request("http://localhost/api/scans/nope/pdf"), {
      params: Promise.resolve({ token: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  it("renders the PDF from D1 after the email unlock", async () => {
    cookieJar.set(`scan_unlock_${TOKEN}`, "1");
    const { GET } = await import("@/app/api/scans/[token]/pdf/route");
    const res = await GET(new Request(`http://localhost/api/scans/${TOKEN}/pdf`), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("acme.example");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  }, 30_000);

  it("unlock then PDF works end to end on D1", async () => {
    const unlock = await import("@/app/api/scans/[token]/unlock/route");
    const ures = await unlock.POST(
      new Request(`http://localhost/api/scans/${TOKEN}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      }),
      ctx,
    );
    expect(ures.status).toBe(200);
    const { GET } = await import("@/app/api/scans/[token]/pdf/route");
    const res = await GET(new Request(`http://localhost/api/scans/${TOKEN}/pdf`), ctx);
    expect(res.status).toBe(200);
  }, 30_000);
});

describe("refresh facts from site on D1", () => {
  beforeEach(async () => {
    holder.env = { DB: memoryCheckDb() };
  });

  it("returns 409 while the scan is still running", async () => {
    await seed("running");
    const { POST } = await import("@/app/api/scans/[token]/fixes/refresh/route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);
    expect(res.status).toBe(409);
  });

  it("returns 404 for an unknown scan", async () => {
    const { POST } = await import("@/app/api/scans/[token]/fixes/refresh/route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);
    expect(res.status).toBe(404);
  });

  it("fetches pages, persists facts and page type to D1, and returns guidance only", async () => {
    await seed();
    const pages: Record<string, string> = {
      "https://acme.example/": `<html><head><title>Acme Plumbing</title>
        <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme Plumbing"}</script>
        </head><body><h1>Acme Plumbing</h1><a href="mailto:hello@acme.example">Email</a></body></html>`,
      "https://acme.example/contact": `<html><head><title>Contact us</title></head>
        <body><h1>Contact us</h1><a href="tel:+14165550100">Call</a><form><input name="email"/></form></body></html>`,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        pages[url]
          ? new Response(pages[url], { headers: { "content-type": "text/html" } })
          : new Response("nope", { status: 404 }),
      ),
    );
    const { POST } = await import("@/app/api/scans/[token]/fixes/refresh/route");
    const res = await POST(new Request("http://localhost/x", { method: "POST" }), ctx);
    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    const json = (await res.json()) as { refreshedUrls: string[]; options: unknown[]; files?: unknown };
    expect(json.refreshedUrls.sort()).toEqual(["https://acme.example/", "https://acme.example/contact"]);
    expect(json.options.length).toBeGreaterThan(0);
    expect(json.files).toBeUndefined();

    const rows = await holder.env
      .DB!.prepare(
        "SELECT url, page_type, has_json_ld, schema_types_json, evidence_json FROM readiness_scan_pages WHERE scan_id = ? ORDER BY url",
      )
      .bind(SCAN_ID)
      .all<{ url: string; page_type: string; has_json_ld: number; schema_types_json: string; evidence_json: string }>();
    const [home, contact] = rows.results!;
    expect(home!.has_json_ld).toBe(1);
    expect(JSON.parse(home!.schema_types_json)).toContain("Organization");
    expect(JSON.parse(home!.evidence_json).emails).toContain("hello@acme.example");
    expect(contact!.page_type).toBe("contact");
  });
});
