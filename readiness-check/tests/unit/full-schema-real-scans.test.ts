/**
 * The complete-graph package (every fetched page) built from real scan rows,
 * covering JSON-LD for each page type the scanner found. Same fixtures as
 * tests/integration/fix-files-real-scans.test.ts. SCHEMA_SAMPLE_OUT writes the files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fullSchemaPackage } from "@/lib/fixes/full-schema";
import type { FixPackageInput } from "@/lib/fixes/generate-package";
import { zipFixFiles } from "@/lib/fixes/zip";
import abra from "../fixtures/real-scans/abra-ca-dabra.app.json";
import example from "../fixtures/real-scans/example.com.json";
import { checkFixFiles, jsonLdTypes, unzipFiles } from "../helpers/fix-file-checks";

type Fixture = typeof example;

function toInput(fx: Fixture): FixPackageInput {
  return {
    domain: fx.scan.domain,
    origin: fx.scan.origin,
    findings: fx.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      passed: f.passed === 1,
      message: f.message,
      pageUrl: f.page_url ?? undefined,
    })),
    pages: fx.pages.map((p) => ({
      url: p.url,
      pageType: p.page_type,
      fetchStatus: p.fetch_status,
      hasJsonLd: p.has_json_ld === 1,
      evidence: JSON.parse(p.evidence_json) as Record<string, unknown>,
    })),
    generatedAt: new Date("2026-10-20T16:00:00Z"),
  };
}

describe.each([
  ["example.com", example as Fixture],
  ["abra-ca-dabra.app", abra as Fixture],
])("complete schema package for %s", (domain, fx) => {
  it("emits valid JSON-LD for every fetched page and a zip that opens", async () => {
    const pkg = fullSchemaPackage(toInput(fx));
    expect(pkg.validation.ok, JSON.stringify(pkg.validation.issues.filter((i) => i.severity === "error"))).toBe(true);
    expect(pkg.validation.todoCount).toBe(0);
    expect(pkg.validation.issues.filter((i) => /Duplicate @id/.test(i.message))).toEqual([]);

    const okPages = fx.pages.filter((p) => p.fetch_status === "ok");
    const jsonLd = pkg.files.filter((f) => f.path.endsWith(".jsonld"));
    // home.jsonld + one file per other fetched page (+ faq when present).
    expect(jsonLd.filter((f) => f.path.startsWith("json-ld/pages/") || f.path === "json-ld/home.jsonld").length).toBe(
      okPages.length,
    );
    expect(checkFixFiles(pkg.files, domain)).toEqual([]);

    // Failed pages never reach the sitemap or llms.txt.
    const sitemap = pkg.files.find((f) => f.path === "sitemap.xml")!.content;
    const llms = pkg.files.find((f) => f.path === "llms.txt")!.content;
    for (const p of fx.pages.filter((x) => x.fetch_status !== "ok")) {
      expect(sitemap).not.toContain(`<loc>${p.url}</loc>`);
      expect(llms).not.toContain(`(${p.url})`);
    }

    const bytes = await zipFixFiles(pkg.files, `aeo-fixes-${domain}-complete`);
    const unzipped = await unzipFiles(bytes);
    expect(unzipped.files.length).toBe(pkg.files.length);

    const types = [...new Set(jsonLd.flatMap((f) => jsonLdTypes(JSON.parse(f.content))))].sort();
    const out = process.env.SCHEMA_SAMPLE_OUT;
    if (out) {
      const dir = path.join(out, domain, "complete-graph");
      for (const f of pkg.files) {
        mkdirSync(path.dirname(path.join(dir, f.path)), { recursive: true });
        writeFileSync(path.join(dir, f.path), f.content);
      }
      writeFileSync(path.join(out, domain, `aeo-fixes-${domain}-complete.zip`), bytes);
      writeFileSync(path.join(dir, "types.json"), JSON.stringify({ files: jsonLd.map((f) => f.path), types }, null, 2));
    }
  });
});
