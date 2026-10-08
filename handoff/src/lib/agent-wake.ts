import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "@/db/sql";

const WINDOW_MS = 5 * 60 * 1000;

export type WakeReason = "work" | "context_changed" | "run_check" | "status" | "brief_approved" | "brief_changed";

/** What a client's decision on a brief should wake. Notes wake nothing. */
export function briefWakeReason(input: {
  kind: string;
  status: string;
  decision: string;
  paused: boolean;
  planned: boolean;
}): WakeReason | null {
  if (input.kind !== "brief" || input.paused) return null;
  if (input.decision === "approve" && input.status === "approved") {
    return input.planned ? "brief_changed" : "brief_approved";
  }
  if (input.decision === "changes") return "context_changed";
  return null;
}

export type WakeTarget = { organizationId: string; reason: WakeReason };

export type WakeEnv = {
  AGENT_URL?: string;
  AGENT_WAKE_SECRET?: string;
};

/** HMAC-SHA256 of the raw wake body, hex. */
export function signWake(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** True when the signature matches and sentAt is inside five minutes of now. */
export function verifyWake(secret: string, rawBody: string, signature: string, now: number): boolean {
  const expected = Buffer.from(signWake(secret, rawBody), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  let sentAt: unknown;
  try {
    sentAt = (JSON.parse(rawBody) as { sentAt?: unknown }).sentAt;
  } catch {
    return false;
  }
  return typeof sentAt === "number" && Number.isFinite(sentAt) && Math.abs(now - sentAt) <= WINDOW_MS;
}

const LIVE = "archived_at IS NULL AND agent_paused_at IS NULL";

/** Clients this cron should wake. A paused or archived organization is left alone. */
export async function dueOrganizations(sql: Sql, cron: string): Promise<WakeTarget[]> {
  if (cron === "*/15 * * * *") {
    const rows = await sql.all<{ id: string; reason: WakeReason }>(
      `SELECT id, CASE
         WHEN EXISTS (
           SELECT 1 FROM activities flag
           WHERE flag.organization_id = organizations.id
             AND flag.kind = 'context_changed'
             AND NOT EXISTS (
               SELECT 1 FROM activities brief
               WHERE brief.organization_id = organizations.id
                 AND brief.kind = 'agent.brief_drafted'
                 AND brief.created_at >= flag.created_at
             )
         ) THEN 'context_changed'
         ELSE 'work'
       END AS reason
       FROM organizations
       WHERE ${LIVE}
         AND (
           EXISTS (SELECT 1 FROM tasks WHERE tasks.organization_id = organizations.id AND tasks.status != 'done')
           OR EXISTS (
             SELECT 1 FROM activities flag
             WHERE flag.organization_id = organizations.id
               AND flag.kind = 'context_changed'
               AND NOT EXISTS (
                 SELECT 1 FROM activities brief
                 WHERE brief.organization_id = organizations.id
                   AND brief.kind = 'agent.brief_drafted'
                   AND brief.created_at >= flag.created_at
               )
           )
         )
       ORDER BY id`,
    );
    return rows.map((row) => ({ organizationId: row.id, reason: row.reason }));
  }
  if (cron === "0 * * * *") {
    const rows = await sql.all<{ id: string }>(
      `SELECT id FROM organizations
       WHERE ${LIVE}
         AND EXISTS (
           SELECT 1 FROM cloud_runs
           JOIN tasks ON tasks.id = cloud_runs.task_id
           WHERE tasks.organization_id = organizations.id
             AND cloud_runs.status IN ('started', 'pr_open')
         )
       ORDER BY id`,
    );
    return rows.map((row) => ({ organizationId: row.id, reason: "run_check" }));
  }
  if (cron === "0 8 * * 1") {
    const rows = await sql.all<{ id: string }>(
      `SELECT id FROM organizations WHERE ${LIVE} AND kind = 'client' ORDER BY id`,
    );
    return rows.map((row) => ({ organizationId: row.id, reason: "status" }));
  }
  return [];
}

/** One signed wake. Missing address or secret does nothing so a saved note still stands. */
export async function wakeOrganization(
  env: WakeEnv,
  organizationId: string,
  reason: WakeReason,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const secret = env.AGENT_WAKE_SECRET ?? "";
  const url = env.AGENT_URL?.replace(/\/$/, "");
  if (!url || !secret) return;
  const body = JSON.stringify({ organizationId, reason, sentAt: now });
  await fetchImpl(`${url}/wake`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-handoff-signature": signWake(secret, body),
    },
    body,
  });
}

/** One signed POST per due client. A failed call is an activity and is tried again next cycle. */
export async function wakeDueAgents(
  sql: Sql,
  env: WakeEnv,
  cron: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const due = await dueOrganizations(sql, cron);
  for (const target of due) {
    const body = JSON.stringify({ organizationId: target.organizationId, reason: target.reason, sentAt: now });
    const secret = env.AGENT_WAKE_SECRET ?? "";
    const url = env.AGENT_URL?.replace(/\/$/, "");
    try {
      if (!url || !secret) throw new Error("The agent address is not configured.");
      const response = await fetchImpl(`${url}/wake`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-handoff-signature": signWake(secret, body),
        },
        body,
      });
      if (!response.ok) throw new Error(`Wake returned ${response.status}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Wake failed.";
      await sql.run(
        `INSERT INTO activities (id, organization_id, kind, actor_kind, body, data_json, created_at)
         VALUES (?, ?, 'agent.wake_failed', 'system', ?, ?, ?)`,
        [crypto.randomUUID(), target.organizationId, message, JSON.stringify({ reason: target.reason, cron }), now],
      );
    }
  }
}
