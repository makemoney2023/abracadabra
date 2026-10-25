import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { WakeEnv } from "@/lib/agent-wake";
import type { ScanQueue } from "@/lib/lead-schema";
import { handleGithubBatch, type GithubQueueMessage } from "@/lib/github/queue";
import { handleLeadIntakeBatch, type IntakeQueueMessage } from "@/lib/intake/queue";
import { runSearchSyncBatch, SEARCH_SYNC_QUEUE, type SearchMessage, type SearchSyncEnv } from "@/lib/search/sync";
import { r2ObjectStore, type FilesBucket } from "@/lib/store/objects";

type QueueMessage = { body: unknown; attempts?: number; ack(): void; retry(options?: { delaySeconds?: number }): void };

/**
 * Lead intake, GitHub events and Search Console sync share one worker entry. Each queue has its own handler.
 * Every named queue is matched before the lead-intake default, so a search-sync message never reaches lead intake.
 */
export async function dispatchQueue(
  batch: { queue: string; messages: QueueMessage[] },
  env: {
    DB: D1Like;
    SCAN_JOBS?: ScanQueue;
    FILES?: FilesBucket;
    EMAIL?: { send(message: unknown): Promise<unknown> };
  } & WakeEnv &
    SearchSyncEnv,
  handlers?: {
    lead?: (messages: IntakeQueueMessage[], db: D1Like) => Promise<void>;
    github?: (messages: GithubQueueMessage[], sql: Sql) => Promise<void>;
    search?: (messages: SearchMessage[]) => Promise<void>;
  },
): Promise<void> {
  if (batch.queue === SEARCH_SYNC_QUEUE) {
    if (handlers?.search) {
      await handlers.search(batch.messages);
      return;
    }
    await runSearchSyncBatch(batch.messages, env);
    return;
  }
  if (batch.queue === "github-events") {
    const handle = handlers?.github ?? handleGithubBatch;
    await handle(batch.messages, d1Sql(env.DB));
    return;
  }
  if (handlers?.lead) {
    await handlers.lead(batch.messages, env.DB);
    return;
  }
  await handleLeadIntakeBatch(
    batch.messages,
    env.DB,
    Date.now(),
    env,
    fetch,
    env.FILES ? r2ObjectStore(env.FILES) : undefined,
  );
}
