import { createAiSearchProspectFinder } from "@/lib/ai-search/prospect";
import { createAiSearchScanClient } from "@/lib/ai-search/scan-client";
import type { CheckBindings } from "@/lib/cloudflare/sql";
import { dispatchJob } from "@/lib/jobs/dispatch";
import { createD1ProspectStore } from "@/lib/ops/d1-prospect-store";
import { runProspecting } from "@/lib/ops/prospect";
import { createD1ScanRepository } from "@/lib/scan/d1-store";
import { runScan } from "@/lib/scan/orchestrator";

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

  await dispatchJob(body, env, {
    async runScan(scanId) {
      await runScan(scanId, {
        site: createAiSearchScanClient({ env: searchEnv(env) }),
        repo: createD1ScanRepository(db),
      });
    },
    async runProspect(objective) {
      await runProspecting(
        {
          finder: createAiSearchProspectFinder({ env: searchEnv(env) }),
          store: createD1ProspectStore(db),
          enqueueScan: async (scanId) => {
            await queue.send({ type: "scan", scanId });
          },
        },
        objective,
      );
    },
  });
}
