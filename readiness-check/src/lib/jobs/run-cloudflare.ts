import { createAiSearchProspectFinder } from "@/lib/ai-search/prospect";
import { createAiSearchScanClient } from "@/lib/ai-search/scan-client";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { createD1ProspectStore } from "@/lib/ops/d1-prospect-store";
import { runSchemaCheck } from "@/lib/ops/schema-check";
import { notifyLeadScan } from "@/lib/jobs/scan-ready";
import { createD1ScanRepository } from "@/lib/scan/d1-store";
import { createD1PipelineStore } from "@/lib/scan/d1-pipeline-store";
import {
  finalizeScanJob,
  planScanJob,
  runChunkJob,
  watchdogJob,
  type PipelineDeps,
} from "@/lib/scan/pipeline";

function searchEnv(env: CheckBindings) {
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  };
}

export async function runCloudflareJob(body: unknown, env: CheckBindings): Promise<void> {
  const db = env.DB;
  const queue = env.SCAN_JOBS;
  if (!db || !queue) throw new Error("Cloudflare scan bindings are missing");

  const pipeline = (): PipelineDeps => ({
    site: createAiSearchScanClient({ env: searchEnv(env) }),
    repo: createD1ScanRepository(db),
    store: createD1PipelineStore(db),
    queue,
    onFinished: (scanId) => notifyLeadScan(db, env.LEAD_INTAKE, scanId),
  });

  await dispatchJob(body, env, {
    async runScan(scanId) {
      await planScanJob(scanId, pipeline());
    },
    async runScanStep(job) {
      if (job.type === "scan-chunk") await runChunkJob(job.scanId, job.chunk, pipeline());
      else if (job.type === "scan-finalize") await finalizeScanJob(job.scanId, pipeline());
      else await watchdogJob(job.scanId, pipeline());
    },
    async runProspect(job) {
      await runSchemaCheck(
        db,
        job,
        {
          reviewer: createAiSearchProspectFinder({ env: searchEnv(env) }),
          store: createD1ProspectStore(db),
          enqueueScan: async (scanId) => {
            await queue.send({ type: "scan", scanId });
          },
        },
      );
    },
  });
}
