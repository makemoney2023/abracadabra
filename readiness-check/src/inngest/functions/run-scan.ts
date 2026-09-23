import { createParallelClient } from "@/lib/parallel/client";
import { runScan } from "@/lib/scan/orchestrator";
import { createSupabaseScanRepository } from "@/lib/scan/supabase-repository";
import { inngest } from "../client";

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
    return { scanId };
  },
);
