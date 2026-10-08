import { migrate } from "../../db/migrate";
import { d1Sql, type D1Like } from "../../db/sql";
import { noteWakeMiss, wakeOrganization, type WakeEnv } from "../agent-wake";
import { startLeadSchemaScan, type ScanQueue } from "../lead-schema";
import { consumeIntake } from "./consume";
import type { Sql } from "../../db/sql";

type IntakeEnv = WakeEnv & { SCAN_JOBS?: ScanQueue };

export type IntakeQueueMessage = {
  body: unknown;
  ack(): void;
  retry(): void;
};

function scanReady(body: unknown): { organizationId: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (!("source" in body) || body.source !== "scan_ready") return null;
  const organizationId = "organizationId" in body ? body.organizationId : null;
  if (typeof organizationId !== "string" || !organizationId.trim()) return null;
  return { organizationId: organizationId.trim() };
}

function messageShape(body: unknown): { source: string; payload: unknown } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const source = "source" in body ? body.source : null;
  if (source !== "assessment" && source !== "booking" && source !== "schema") return null;
  const payload = "payload" in body ? body.payload : null;
  return { source, payload };
}

/** Write one batch. A bad payload is dropped. A database error is tried again. */
export async function handleLeadIntakeBatch(
  messages: IntakeQueueMessage[],
  db: D1Like,
  now = Date.now(),
  env: IntakeEnv = {},
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const sql = d1Sql(db);
  await migrate(sql);
  for (const message of messages) {
    const ready = scanReady(message.body);
    if (ready) {
      try {
        const woke = await wakeOrganization(env, ready.organizationId, "scan_ready", now, fetchImpl);
        if (!woke) await noteWakeMiss(sql, ready.organizationId, now);
        message.ack();
      } catch {
        message.retry();
      }
      continue;
    }
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
      if (result.leadOrganizationId) {
        const waiting = await queuedSchemaScan(sql, shaped.source, result.leadOrganizationId, env.SCAN_JOBS, now);
        if (!waiting) {
          const woke = await wakeOrganization(env, result.leadOrganizationId, "lead_created", now, fetchImpl);
          if (!woke) await noteWakeMiss(sql, result.leadOrganizationId, now);
        }
      }
      message.ack();
    } catch {
      message.retry();
    }
  }
}

/** A website lead waits for the scan. A schema package, a missing site, or a failed insert wakes now. */
async function queuedSchemaScan(
  sql: Sql,
  source: string,
  organizationId: string,
  queue: ScanQueue | undefined,
  now: number,
): Promise<boolean> {
  if (source === "schema" || !queue) return false;
  const org = await sql.get<{ website: string | null }>("SELECT website FROM organizations WHERE id = ?", [organizationId]);
  if (!org?.website?.trim()) return false;
  try {
    const started = await startLeadSchemaScan({ sql, organizationId, website: org.website, now, queue });
    return started.status === "queued";
  } catch {
    return false;
  }
}
