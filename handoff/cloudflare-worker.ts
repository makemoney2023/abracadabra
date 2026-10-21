import handler, { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
import { d1Sql, type D1Like } from "./src/db/sql";
import { wakeDueAgents, postHqNotice, type WakeEnv } from "./src/lib/agent-wake";
import { defaultBuildDeps, expireCloudRuns, retryCappedBuilds } from "./src/lib/cursor-build";
import type { ScanQueue } from "./src/lib/lead-schema";
import { filePendingScanContexts } from "./src/lib/scan-context";
import { settleRunningSwarms } from "./src/lib/client-workflows";
import { dispatchQueue } from "./src/lib/queue-dispatch";
import { refreshDueSocialPosts } from "./src/lib/social";
import { r2ObjectStore, type FilesBucket } from "./src/lib/store/objects";
import { createZernioClient } from "./src/lib/zernio";

type QueueEnv = WakeEnv & {
  DB: D1Like;
  SCAN_JOBS?: ScanQueue;
  FILES?: FilesBucket;
  EMAIL?: { send(message: unknown): Promise<unknown> };
  SWARM_ORIGIN?: string;
  ZERNIO_API_KEY?: string;
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
    const origin = env.SWARM_ORIGIN?.trim() ?? "";
    if (origin) {
      try {
        await settleRunningSwarms({
          sql,
          store: env.FILES ? r2ObjectStore(env.FILES) : undefined,
          origin,
          now,
          notify: async (notice) => {
            await postHqNotice(env, notice.userId, notice.detail, now);
          },
        });
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Swarm follow failed.");
      }
    }
    const zernioKey = env.ZERNIO_API_KEY?.trim() ?? "";
    if (zernioKey) {
      try {
        await refreshDueSocialPosts(sql, createZernioClient(zernioKey), now);
      } catch (error) {
        console.error(error instanceof Error ? error.message : "Social post refresh failed.");
      }
    }
    await wakeDueAgents(sql, env, event.cron, now);
    const deps = defaultBuildDeps(now);
    await expireCloudRuns(sql, deps);
    await retryCappedBuilds(sql, deps);
  },
};

export { DOQueueHandler, DOShardedTagCache };
