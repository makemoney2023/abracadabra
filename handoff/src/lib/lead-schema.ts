import type { Sql } from "../db/sql";
import { recordAgentRun } from "./agent-activity";
import { noteWakeMiss, wakeOrganization, type WakeEnv } from "./agent-wake";
import { ensureClientSpace } from "./scan-context";

export type ScanQueue = {
  send(body: { type: "scan"; scanId: string }): Promise<unknown>;
};

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

type WorkerBindings = {
  SCAN_JOBS?: ScanQueue;
  AGENT_URL?: string;
  AGENT_WAKE_SECRET?: string;
};

/** Scan queue and wake address from the worker bindings. Empty when this process has none. */
export function scanIntakeBindings(): { queue?: ScanQueue; env: WakeEnv } {
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: WorkerBindings };
  };
  const bound = holder[CLOUDFLARE_CONTEXT]?.env;
  return {
    queue: bound?.SCAN_JOBS,
    env: {
      AGENT_URL: bound?.AGENT_URL || process.env.AGENT_URL,
      AGENT_WAKE_SECRET: bound?.AGENT_WAKE_SECRET || process.env.AGENT_WAKE_SECRET,
    },
  };
}

/** A website the schema scan can open. A blank or unusable address returns null. */
export function leadScanTarget(website: string): { domain: string; origin: string } | null {
  const raw = website.trim();
  if (!raw) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (!url.hostname.includes(".")) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return { domain: host, origin: `https://${host}` };
  } catch {
    return null;
  }
}

/** Queue a schema scan for this lead and leave a timestamped activity either way. */
export async function startLeadSchemaScan(input: {
  sql: Sql;
  organizationId: string;
  website: string;
  now: number;
  queue?: ScanQueue | null;
  subject?: string;
}): Promise<{ scanId: string | null; domain: string | null; status: string }> {
  const target = leadScanTarget(input.website);
  const subject = input.subject?.trim() || "lead";
  if (!target) {
    await recordAgentRun(input.sql, {
      organizationId: input.organizationId,
      kind: "schema.scan",
      body: `Schema scan did not start. This ${subject} has no website.`,
      status: "not_started",
      data: {},
      now: input.now,
      actorKind: "system",
      actorId: "schema",
    });
    return { scanId: null, domain: null, status: "not_started" };
  }

  const scanId = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  await input.sql.run(
    `INSERT INTO readiness_scans
      (id, public_token, domain, origin, source, status, organization_id, created_at)
     VALUES (?, ?, ?, ?, 'public', 'queued', ?, ?)`,
    [scanId, token, target.domain, target.origin, input.organizationId, input.now],
  );

  let status = "queued";
  let body = `Schema scan started for ${target.domain}.`;
  if (!input.queue) {
    status = "failed";
    body = `Schema scan for ${target.domain} was saved, but the scan queue is not connected.`;
    await input.sql.run("UPDATE readiness_scans SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?", [
      "The scan queue is not connected.",
      input.now,
      scanId,
    ]);
  } else {
    try {
      await input.queue.send({ type: "scan", scanId });
    } catch (error) {
      status = "failed";
      const message = error instanceof Error ? error.message : "The scan queue did not accept the job.";
      body = `Schema scan for ${target.domain} did not start. ${message}`;
      await input.sql.run(
        "UPDATE readiness_scans SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?",
        [message.slice(0, 300), input.now, scanId],
      );
    }
  }

  await recordAgentRun(input.sql, {
    organizationId: input.organizationId,
    kind: "schema.scan",
    body,
    status,
    data: { scanId, domain: target.domain, publicToken: token },
    now: input.now,
    actorKind: "system",
    actorId: "schema",
  });
  return { scanId, domain: target.domain, status };
}

/** A queued scan waits for scan_ready. A lead with no website, or a scan the queue refused, wakes now. */
export async function finishManualLead(input: {
  sql: Sql;
  organizationId: string;
  website: string;
  now: number;
  queue?: ScanQueue | null;
  env: WakeEnv;
  fetchImpl?: typeof fetch;
  subject?: string;
}): Promise<void> {
  const started = await startLeadSchemaScan({
    sql: input.sql,
    organizationId: input.organizationId,
    website: input.website,
    now: input.now,
    queue: input.queue,
    subject: input.subject,
  });
  if (started.status === "queued") return;
  try {
    const woke = await wakeOrganization(input.env, input.organizationId, "lead_created", input.now, input.fetchImpl);
    if (!woke) await noteWakeMiss(input.sql, input.organizationId, input.now);
  } catch {
    await noteWakeMiss(input.sql, input.organizationId, input.now);
  }
}

/** A client added directly gets the same start as a lead: a file space, then the schema check. */
export async function beginDirectClient(input: {
  sql: Sql;
  organizationId: string;
  website: string;
  now: number;
  queue?: ScanQueue | null;
  env: WakeEnv;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  await ensureClientSpace(input.sql, input.organizationId, input.now);
  await finishManualLead({ ...input, subject: "client" });
}
