import { createHmac, timingSafeEqual } from "node:crypto";
import type { Sql } from "@/db/sql";

const WINDOW_MS = 5 * 60 * 1000;

export type WakeReason =
  | "work"
  | "context_changed"
  | "run_check"
  | "status"
  | "brief_approved"
  | "brief_changed"
  | "lead_created"
  | "scan_ready"
  | "changes_requested"
  | "due";

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
  /** all | no_lead_bot | off (default). Read from here, then process.env, then the Worker bindings. */
  AGENT_WAKES?: string;
};

/**
 * AGENT_WAKES decides whether HQ wakes the per-client HQ agent (handoff-agent ClientAgent) at all.
 * - "off" (default, also when unset or unknown): nothing wakes it. Client bots and Client Services do the work.
 * - "no_lead_bot": only clients with no live lead client bot are woken.
 * - "all": the old behaviour.
 * The staff chat (HqChat) and email intake never go through a wake, so this does not touch them.
 */
export type AgentWakes = "all" | "no_lead_bot" | "off";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

export function agentWakes(env?: { AGENT_WAKES?: unknown }): AgentWakes {
  const read = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");
  const holder = globalThis as typeof globalThis & { [CLOUDFLARE_CONTEXT]?: { env?: Record<string, unknown> } };
  const raw =
    read(env?.AGENT_WAKES) ||
    read(typeof process !== "undefined" ? process.env?.AGENT_WAKES : "") ||
    read(holder[CLOUDFLARE_CONTEXT]?.env?.AGENT_WAKES);
  return raw === "all" || raw === "no_lead_bot" ? raw : "off";
}

async function hasLeadBot(sql: Sql, organizationId: string): Promise<boolean> {
  const row = await sql.get<{ id: string }>(
    `SELECT a.id FROM agent_assignments a JOIN client_agents c ON c.id = a.agent_id
     WHERE a.organization_id = ? AND a.role = 'lead' AND a.ended_at IS NULL AND c.revoked_at IS NULL LIMIT 1`,
    [organizationId],
  );
  return Boolean(row);
}

/** True when AGENT_WAKES lets HQ wake this client's HQ agent. no_lead_bot without a database fails closed. */
export async function wakeAllowed(env: WakeEnv, organizationId: string, sql?: Sql): Promise<boolean> {
  const mode = agentWakes(env);
  if (mode === "all") return true;
  if (mode === "off" || !sql) return false;
  return !(await hasLeadBot(sql, organizationId));
}

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

/** First cron in wrangler.jsonc. Cloudflare's shortest schedule is one minute. */
export const WORK_WAKE_CRON = "* * * * *";

/** Clients this cron should wake. A paused or archived organization is left alone. */
export async function dueOrganizations(sql: Sql, cron: string, now = Date.now()): Promise<WakeTarget[]> {
  if (cron === WORK_WAKE_CRON) {
    const unanswered = `EXISTS (
           SELECT 1 FROM activities flag
           WHERE flag.organization_id = organizations.id
             AND flag.kind = 'context_changed'
             AND NOT EXISTS (
               SELECT 1 FROM activities brief
               WHERE brief.organization_id = organizations.id
                 AND brief.kind = 'agent.brief_drafted'
                 AND brief.created_at >= flag.created_at
             )
         )`;
    const workflowDue = `EXISTS (
           SELECT 1 FROM client_workflows w
           WHERE w.organization_id = organizations.id
             AND w.next_run_at IS NOT NULL
             AND w.next_run_at <= ?
         )`;
    const swarmRunning = `EXISTS (
           SELECT 1 FROM swarm_runs s
           WHERE s.organization_id = organizations.id
             AND s.status = 'running'
         )`;
    const rows = await sql.all<{ id: string; reason: WakeReason }>(
      `SELECT id, CASE
         WHEN ${unanswered} THEN 'context_changed'
         WHEN ${workflowDue} OR ${swarmRunning} THEN 'due'
         ELSE 'work'
       END AS reason
       FROM organizations
       WHERE ${LIVE}
         AND (
           EXISTS (
             SELECT 1 FROM tasks
             WHERE tasks.organization_id = organizations.id
               AND tasks.status != 'done'
               AND tasks.review_requested_at IS NULL
               AND (tasks.due_at IS NULL OR tasks.due_at <= ?)
               AND NOT EXISTS (
                 SELECT 1 FROM client_workflows w
                 WHERE w.task_id = tasks.id AND w.scheduled_at IS NOT NULL
               )
           )
           OR ${unanswered}
           OR ${workflowDue}
           OR ${swarmRunning}
         )
       ORDER BY id`,
      [now, now, now],
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
  // The weekly "0 8 * * 1" status wake is gone: the agent never handled "status", so it did nothing.
  return [];
}

/**
 * "skipped" when AGENT_WAKES rules this client out (log nothing). False when the address or secret is missing, or the
 * agent refuses the wake. A thrown fetch stays thrown so a queue can retry. Pass sql so no_lead_bot can check the client.
 */
export async function wakeOrganization(
  env: WakeEnv,
  organizationId: string,
  reason: WakeReason,
  now: number,
  fetchImpl: typeof fetch = fetch,
  sql?: Sql,
): Promise<boolean | "skipped"> {
  if (!(await wakeAllowed(env, organizationId, sql))) return "skipped";
  const secret = env.AGENT_WAKE_SECRET ?? "";
  const url = env.AGENT_URL?.replace(/\/$/, "");
  if (!url || !secret) return false;
  const body = JSON.stringify({ organizationId, reason, sentAt: now });
  const response = await fetchImpl(`${url}/wake`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-handoff-signature": signWake(secret, body),
    },
    body,
  });
  return response.ok;
}

/** One signed line into the staff member's HQ chat. A refused call returns false. */
export async function postHqNotice(
  env: WakeEnv,
  userId: string,
  text: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const url = env.AGENT_URL?.replace(/\/$/, "");
  const secret = env.AGENT_WAKE_SECRET ?? "";
  if (!url || !secret || !userId.trim() || !text.trim()) return false;
  const body = JSON.stringify({ userId, text, sentAt: now });
  try {
    const response = await fetchImpl(`${url}/hq-notice`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-handoff-signature": signWake(secret, body),
      },
      body,
    });
    return response.ok;
  } catch {
    return false;
  }
}

const WAKE_OK_EVERY_MS = 15 * 60 * 1000;

/**
 * Last delivered wake, so Today can clear a wake-failure alert. Written at most every 15 minutes per client,
 * or right away when a failure is newer than the last success.
 */
export async function noteWakeOk(sql: Sql, organizationId: string, now: number): Promise<void> {
  await sql.run(
    `UPDATE organizations SET agent_wake_ok_at = ?
     WHERE id = ?
       AND (
         agent_wake_ok_at IS NULL
         OR agent_wake_ok_at <= ?
         OR EXISTS (
           SELECT 1 FROM activities a
           WHERE a.organization_id = organizations.id
             AND a.kind = 'agent.wake_failed'
             AND a.created_at > organizations.agent_wake_ok_at
         )
       )`,
    [now, organizationId, now - WAKE_OK_EVERY_MS],
  );
}

export async function noteWakeMiss(sql: Sql, organizationId: string, now: number): Promise<void> {
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'agent.wake_failed', 'system', 'wake', ?, ?, ?)`,
    [
      crypto.randomUUID(),
      organizationId,
      "The agent did not wake. The agent address or wake secret is missing, or the wake was refused.",
      JSON.stringify({ status: "failed" }),
      now,
    ],
  );
}

/** One signed POST per due client. A failed call is an activity and is tried again next cycle. */
export async function wakeDueAgents(
  sql: Sql,
  env: WakeEnv,
  cron: string,
  now: number,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  // AGENT_WAKES=off: nobody is due. The rest of the scheduled job (scan filing, swarm settle, run expiry) still runs.
  if (agentWakes(env) === "off") return;
  const due = await dueOrganizations(sql, cron, now);
  for (const target of due) {
    if (!(await wakeAllowed(env, target.organizationId, sql))) continue;
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
      await noteWakeOk(sql, target.organizationId, now);
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
