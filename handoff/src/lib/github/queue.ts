import { migrate } from "@/db/migrate";
import type { Sql } from "@/db/sql";
import { applyGithubDelivery, type GithubDelivery } from "./consume";

export type GithubQueueMessage = {
  body: unknown;
  ack(): void;
  retry(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function githubMessageShape(body: unknown): GithubDelivery | null {
  const record = asRecord(body);
  if (!record || record.source !== "github") return null;
  if (typeof record.deliveryId !== "string" || record.deliveryId.trim().length === 0) return null;
  if (typeof record.event !== "string" || record.event.trim().length === 0) return null;
  return {
    source: "github",
    deliveryId: record.deliveryId.trim(),
    event: record.event.trim(),
    payload: record.payload,
  };
}

/** Write one batch. A bad payload is dropped. A database error is tried again. */
export async function handleGithubBatch(
  messages: GithubQueueMessage[],
  sql: Sql,
  now = Date.now(),
): Promise<void> {
  await migrate(sql);
  for (const message of messages) {
    const shaped = githubMessageShape(message.body);
    if (!shaped) {
      message.ack();
      continue;
    }
    try {
      await applyGithubDelivery(sql, shaped, now);
      message.ack();
    } catch {
      message.retry();
    }
  }
}
