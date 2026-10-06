import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import { bindWorkerEnv, type WorkerEnv } from "./src/lib/cloudflare";
import { handleScanJob, runAssessmentSweep } from "./src/lib/jobs";

type QueueMessage = { body: unknown; ack(): void; retry(): void };

export default {
  fetch: handler.fetch,
  async queue(batch: { messages: QueueMessage[] }, env: WorkerEnv) {
    bindWorkerEnv(env);
    for (const message of batch.messages) {
      try {
        await handleScanJob(message.body);
        message.ack();
      } catch (err) {
        console.error("scan job failed", err instanceof Error ? err.message : "error");
        message.retry();
      }
    }
  },
  async scheduled(_controller: unknown, env: WorkerEnv) {
    bindWorkerEnv(env);
    await runAssessmentSweep();
  },
};

export { DOQueueHandler, DOShardedTagCache };
