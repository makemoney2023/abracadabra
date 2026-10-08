import type { Sql } from "../db/sql";
import { recordAgentRun } from "./agent-activity";
import { noteWakeMiss, wakeOrganization, type WakeEnv } from "./agent-wake";

export type ScanQueue = {
  send(body: { type: "scan"; scanId: string }): Promise<unknown>;
};

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
}): Promise<{ scanId: string | null; domain: string | null; status: string }> {
  const target = leadScanTarget(input.website);
  if (!target) {
    await recordAgentRun(input.sql, {
      organizationId: input.organizationId,
      kind: "schema.scan",
      body: "Schema scan did not start. This lead has no website.",
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
}): Promise<void> {
  const started = await startLeadSchemaScan({
    sql: input.sql,
    organizationId: input.organizationId,
    website: input.website,
    now: input.now,
    queue: input.queue,
  });
  if (started.status === "queued") return;
  try {
    const woke = await wakeOrganization(input.env, input.organizationId, "lead_created", input.now, input.fetchImpl);
    if (!woke) await noteWakeMiss(input.sql, input.organizationId, input.now);
  } catch {
    await noteWakeMiss(input.sql, input.organizationId, input.now);
  }
}
