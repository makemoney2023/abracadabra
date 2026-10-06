import { migrate } from "../../db/migrate";
import { d1Sql, type D1Like } from "../../db/sql";
import { consumeIntake } from "./consume";

export type IntakeQueueMessage = {
  body: unknown;
  ack(): void;
  retry(): void;
};

function messageShape(body: unknown): { source: string; payload: unknown } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const source = "source" in body ? body.source : null;
  if (source !== "assessment" && source !== "booking") return null;
  const payload = "payload" in body ? body.payload : null;
  return { source, payload };
}

/** Write one batch. A bad payload is dropped. A database error is tried again. */
export async function handleLeadIntakeBatch(
  messages: IntakeQueueMessage[],
  db: D1Like,
  now = Date.now(),
): Promise<void> {
  const sql = d1Sql(db);
  await migrate(sql);
  for (const message of messages) {
    const shaped = messageShape(message.body);
    if (!shaped) {
      message.ack();
      continue;
    }
    try {
      const result = await consumeIntake(sql, shaped, now);
      if (!result.ok) {
        message.ack();
        continue;
      }
      message.ack();
    } catch {
      message.retry();
    }
  }
}
