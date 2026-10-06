import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { handleGithubBatch, type GithubQueueMessage } from "@/lib/github/queue";
import { handleLeadIntakeBatch, type IntakeQueueMessage } from "@/lib/intake/queue";

type QueueMessage = { body: unknown; ack(): void; retry(): void };

/** Lead intake and GitHub events share one worker entry. Each queue has its own handler. */
export async function dispatchQueue(
  batch: { queue: string; messages: QueueMessage[] },
  env: { DB: D1Like },
  handlers?: {
    lead?: (messages: IntakeQueueMessage[], db: D1Like) => Promise<void>;
    github?: (messages: GithubQueueMessage[], sql: Sql) => Promise<void>;
  },
): Promise<void> {
  if (batch.queue === "github-events") {
    const handle = handlers?.github ?? handleGithubBatch;
    await handle(batch.messages, d1Sql(env.DB));
    return;
  }
  const handle = handlers?.lead ?? handleLeadIntakeBatch;
  await handle(batch.messages, env.DB);
}
