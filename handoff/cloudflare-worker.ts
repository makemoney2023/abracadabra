import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import { d1Sql, type D1Like } from "./src/db/sql";
import { wakeDueAgents, type WakeEnv } from "./src/lib/agent-wake";
import { defaultBuildDeps, expireCloudRuns, retryCappedBuilds } from "./src/lib/cursor-build";
import type { ScanQueue } from "./src/lib/lead-schema";
import { filePendingScanContexts } from "./src/lib/scan-context";
import { dispatchQueue } from "./src/lib/queue-dispatch";
import { r2ObjectStore, type FilesBucket } from "./src/lib/store/objects";

type QueueEnv = WakeEnv & {
  DB: D1Like;
  SCAN_JOBS?: ScanQueue;
  FILES?: FilesBucket;
  EMAIL?: { send(message: unknown): Promise<unknown> };
};

export default {
  fetch: handler.fetch,
  async queue(batch: { queue: string; messages: { body: unknown; ack(): void; retry(): void }[] }, env: QueueEnv) {
    await dispatchQueue(batch, env);
  },
  async scheduled(event: { cron: string }, env: QueueEnv) {
    const now = Date.now();
    const sql = d1Sql(env.DB);
    if (env.FILES) {
      try {
        await filePendingScanContexts({ sql, store: r2ObjectStore(env.FILES), now });
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Scan filing failed.");
      }
    }
    await wakeDueAgents(sql, env, event.cron, now);
    const deps = defaultBuildDeps(now);
    await expireCloudRuns(sql, deps);
    await retryCappedBuilds(sql, deps);
  },
};

export { DOQueueHandler, DOShardedTagCache };
