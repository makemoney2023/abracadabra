import { fullSchemaPackage } from "@/lib/fixes/full-schema";
import { deliverSchemaPackage } from "@/lib/handoff-intake";
import { createParallelClient } from "@/lib/parallel/client";
import { runScan } from "@/lib/scan/orchestrator";
import { createSupabaseScanRepository, loadScanById } from "@/lib/scan/supabase-repository";
import { inngest } from "../client";

async function publishCompletedScan(scanId: string): Promise<{ ok: true; skipped?: boolean }> {
  const loaded = await loadScanById(scanId);
  if (!loaded || loaded.scan.status !== "complete") return { ok: true, skipped: true };
  const businessName = loaded.pages
    .map((page) => {
      const evidence = page.evidence;
      return evidence && typeof evidence.businessName === "string" ? evidence.businessName.trim() : "";
    })
    .find((name) => name.length > 0);
  const pkg = fullSchemaPackage({
    domain: loaded.scan.domain,
    origin: loaded.scan.origin,
    businessName,
    findings: loaded.findings.map((finding) => ({
      code: finding.code,
      passed: finding.passed,
      message: finding.message,
    })),
    pages: loaded.pages.map((page) => ({
      url: page.url,
      pageType: page.pageType,
      fetchStatus: page.fetchStatus,
      hasJsonLd: page.hasJsonLd,
      evidence: page.evidence,
    })),
  });
  return deliverSchemaPackage({
    scanId: loaded.scan.id,
    domain: loaded.scan.domain,
    origin: loaded.scan.origin,
    businessName: businessName ?? loaded.scan.domain,
    files: pkg.files.map((file) => ({ path: file.path, content: file.content })),
  });
}

export const runScanFn = inngest.createFunction(
  {
    id: "run-scan",
    retries: 2,
    triggers: [{ event: "scan/requested" }],
  },
  async ({ event, step }) => {
    const { scanId } = event.data as { scanId: string };
    await step.run("orchestrate", async () => {
      await runScan(scanId, {
        parallel: createParallelClient(),
        repo: createSupabaseScanRepository(),
      });
    });
    await step.run("publish-schema", async () => {
      await publishCompletedScan(scanId);
    });
    return { scanId };
  },
);
