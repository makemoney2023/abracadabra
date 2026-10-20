/**
 * End-to-end file generation on real scans (example.com, abra-ca-dabra.app).
 *
 * Fixtures are the actual D1 rows (scan, pages, findings) the production scanner wrote
 * on 2026-10-20. Access is granted through the preview-only PAYWALL_TEST_BYPASS on a
 * preview host, then the same client flow the page uses runs: GET options → POST zip/json.
 *
 * Set SCHEMA_SAMPLE_OUT=/path to also write the generated files there.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import abra from "../fixtures/real-scans/abra-ca-dabra.app.json";
import example from "../fixtures/real-scans/example.com.json";
import { checkFixFiles, jsonLdTypes, unzipFiles, type GeneratedFile } from "../helpers/fix-file-checks";
import { memoryCheckDb } from "../helpers/memory-sql";

const holder: { env: CheckBindings } = { env: {} };
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: holder.env }),
}));

type Fixture = typeof example;
const PREVIEW = "https://schema-paywall-readiness-check.abracadabra-ai.workers.dev";
const PROD = "https://check.abra-ca-dabra.app";

async function seed(fx: Fixture) {
  const db = holder.env.DB!;
  const s = fx.scan;
  await db
    .prepare(
      `INSERT INTO readiness_scans (id, public_token, domain, origin, source, status, score_total, score_breakdown_json, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(s.id, s.public_token, s.domain, s.origin, s.source, s.status, s.score_total, s.score_breakdown_json, s.created_at, s.completed_at)
    .run();
  for (const p of fx.pages) {
    await db
      .prepare(
        `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, fetch_status, has_json_ld, schema_types_json, evidence_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), s.id, p.url, p.page_type, p.fetch_status, p.has_json_ld, p.schema_types_json, p.evidence_json)
      .run();
  }
  for (const f of fx.findings) {
    await db
      .prepare(
        `INSERT INTO readiness_scan_findings (id, scan_id, page_url, code, severity, passed, message, evidence_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), s.id, f.page_url, f.code, f.severity, f.passed, f.message, f.evidence_json)
      .run();
  }
}

type Options = {
  options: Array<{ id: string; kind: string; url?: string; available?: boolean }>;
  defaultSelection: Record<string, unknown> & { pageUrls: string[] };
  prefills: Record<string, unknown> & { businessName: string; businessType: string; hasSiteSearch: boolean };
};

/** Same body the page builds, with every offered file and page selected. */
function everythingBody(opts: Options, format: "zip" | "json") {
  const pageUrls = opts.options.filter((o) => o.kind === "pageSchema" && o.url).map((o) => o.url!);
  const d = opts.defaultSelection;
  const p = opts.prefills;
  return {
    llmsTxt: true,
    llmsFullTxt: true,
    sitemapXml: true,
    robotsTxt: Boolean(d.robotsTxt) || opts.options.some((o) => o.id === "robotsTxt"),
    faqJsonLd: Boolean(d.faqJsonLd),
    pageUrls: [...new Set([...(d.pageUrls ?? []), ...pageUrls])],
    businessName: p.businessName,
    businessType: p.businessType,
    email: (p.email as string | undefined) || undefined,
    phone: (p.phone as string | undefined) || undefined,
    logoUrl: (p.logoUrl as string | undefined) || undefined,
    includeSearchAction: p.hasSiteSearch,
    sameAs: (p.sameAs as string[] | undefined) ?? [],
    openingHours: (p.openingHours as string[] | undefined) ?? [],
    address: p.address as Record<string, string> | undefined,
    // When the site has no FAQ copy the form asks the visitor for one pair; do the same here.
    faqPairs: d.faqJsonLd
      ? [{ question: `What does ${p.businessName} do?`, answer: `${p.businessName} helps you get found by AI assistants.` }]
      : undefined,
    format,
  };
}

async function generate(fx: Fixture, host = PREVIEW) {
  const route = await import("@/app/api/scans/[token]/fixes/route");
  const token = fx.scan.public_token;
  const ctx = { params: Promise.resolve({ token }) };
  const optsRes = await route.GET(new Request(`${host}/api/scans/${token}/fixes`), ctx);
  expect(optsRes.status).toBe(200);
  const opts = (await optsRes.json()) as Options;
  const post = (format: "zip" | "json") =>
    route.POST(
      new Request(`${host}/api/scans/${token}/fixes`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-paywall-test-bypass": "1" },
        body: JSON.stringify(everythingBody(opts, format)),
      }),
      ctx,
    );
  return { opts, post };
}

function saveSample(domain: string, folder: string, zip: Uint8Array, files: GeneratedFile[], meta: unknown) {
  const out = process.env.SCHEMA_SAMPLE_OUT;
  if (!out) return;
  const dir = path.join(out, domain);
  for (const f of files) {
    const target = path.join(dir, "files", f.path);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, f.content);
  }
  writeFileSync(path.join(dir, `${folder}.zip`), zip);
  writeFileSync(path.join(dir, "package.json"), JSON.stringify(meta, null, 2));
}

describe.each([
  ["example.com", example as Fixture],
  ["abra-ca-dabra.app", abra as Fixture],
])("fix files for a real scan of %s", (domain, fx) => {
  beforeEach(async () => {
    vi.unstubAllEnvs();
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"]) vi.stubEnv(k, "");
    vi.stubEnv("PAYWALL_TEST_BYPASS", "1");
    holder.env = { DB: memoryCheckDb() };
    await seed(fx);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("still refuses on the production host even with the bypass set", async () => {
    const { post } = await generate(fx, PROD);
    const res = await post("zip");
    expect(res.status).toBe(402);
  });

  it("refuses on a preview host when the request doesn't opt in", async () => {
    const route = await import("@/app/api/scans/[token]/fixes/route");
    const res = await route.POST(
      new Request(`${PREVIEW}/api/scans/${fx.scan.public_token}/fixes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ llmsTxt: true }),
      }),
      { params: Promise.resolve({ token: fx.scan.public_token }) },
    );
    expect(res.status).toBe(402);
  });

  it("refuses on a preview host when the bypass is off", async () => {
    vi.stubEnv("PAYWALL_TEST_BYPASS", "");
    const { post } = await generate(fx);
    expect((await post("zip")).status).toBe(402);
  });

  it("generates a valid zip and data export once access is granted", async () => {
    const { post } = await generate(fx);

    const jsonRes = await post("json");
    const body = await jsonRes.json();
    expect(jsonRes.status, JSON.stringify(body).slice(0, 600)).toBe(200);
    const pkg = body as { files: GeneratedFile[]; validation: { ok: boolean; todoCount: number } };
    expect(pkg.validation.ok).toBe(true);
    expect(pkg.validation.todoCount).toBe(0);

    const zipRes = await post("zip");
    expect(zipRes.status).toBe(200);
    expect(zipRes.headers.get("content-type")).toBe("application/zip");
    const bytes = new Uint8Array(await zipRes.arrayBuffer());
    const { folder, files } = await unzipFiles(bytes);
    expect(folder).toMatch(new RegExp(`^aeo-fixes-${domain.replace(/\./g, "\\.")}-\\d{4}-\\d{2}-\\d{2}$`));

    // Zip holds exactly the files the data export lists, byte for byte.
    expect(files.map((f) => f.path).sort()).toEqual(pkg.files.map((f) => f.path).sort());
    for (const f of pkg.files) expect(files.find((z) => z.path === f.path)?.content).toBe(f.content);

    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["llms.txt", "llms-full.txt", "sitemap.xml"]));
    const jsonLd = files.filter((f) => /\.jsonld$/.test(f.path));
    // abra-ca-dabra.app already marks up every page it serves, so it gets site files only.
    if (fx.pages.some((pg) => pg.fetch_status === "ok" && pg.has_json_ld === 0)) {
      expect(jsonLd.length).toBeGreaterThan(0);
    }
    expect(checkFixFiles(files, domain)).toEqual([]);

    const types = new Set(jsonLd.flatMap((f) => jsonLdTypes(JSON.parse(f.content))));
    saveSample(domain, folder, bytes, files, {
      domain,
      scanToken: fx.scan.public_token,
      files: paths,
      schemaTypes: [...types].sort(),
      validation: pkg.validation,
    });
  });
});
