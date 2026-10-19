import type { Sql } from "../db/sql";

/**
 * Schema-check score cutoff. A low schema score means the site needs our work,
 * so score <= 70 is ready for outbound (Account Research enriches, then Sales Outbound).
 * Score > 70 is nurture, shown as "C quality" on the leads board.
 */
export const LEAD_READY_THRESHOLD = 70;

export type RoutingStatus = "ready_for_outbound" | "nurture" | "enriched" | "scoring_error" | "reply_needed" | "replied";

export const ROUTING_STATUSES: readonly RoutingStatus[] = [
  "ready_for_outbound",
  "enriched",
  "nurture",
  "scoring_error",
  "reply_needed",
  "replied",
];

export const ROUTING_LABEL: Record<RoutingStatus, string> = {
  ready_for_outbound: "Ready for outbound",
  nurture: "C quality",
  enriched: "Enriched",
  scoring_error: "Scoring error",
  reply_needed: "Reply needed",
  replied: "Replied",
};

/**
 * Inbound statuses. A visitor asked us something (Readiness Check or the /start/ form), so Sales Outbound
 * owes them a reply. Schema scoring never overwrites these, or the inbound lead would drop into the BDR flow.
 */
export const INBOUND_STATUSES: readonly RoutingStatus[] = ["reply_needed", "replied"];

export function isInboundStatus(value: string | null | undefined): boolean {
  return value === "reply_needed" || value === "replied";
}

export function routingFor(score: number | null | undefined): RoutingStatus | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return score <= LEAD_READY_THRESHOLD ? "ready_for_outbound" : "nurture";
}

export function routingStatusOf(value: string | null | undefined): RoutingStatus | null {
  return (ROUTING_STATUSES as readonly string[]).includes(value ?? "") ? (value as RoutingStatus) : null;
}

/**
 * Queue an inbound reply on an open deal: routing_status reply_needed, scored_at = now (the export's `since`).
 * Rules:
 * - Only stages new and contacted. call_booked and proposal are already talking to Christopher.
 * - The caller only queues when the submitter gave an email (the reply goes there).
 * - A Readiness Check never takes a deal that is already in the BDR outbound flow
 *   (ready_for_outbound or enriched): Sales Outbound already owns that conversation, usually because
 *   it sent the survey link. A /start/ project inquiry does take it, because a direct ask needs a direct answer,
 *   and moving it out of enriched stops the cold sequence from also emailing them.
 * - replied goes back to reply_needed: every new submission gets a reply.
 * One conditional UPDATE, so it is safe inside a D1 transaction (writes are buffered until COMMIT,
 * and reads inside the transaction would not see a deal inserted earlier in it).
 */
export async function queueReply(
  sql: Sql,
  input: { dealId: string; kind: "readiness_check" | "start_form"; now: number },
): Promise<void> {
  await sql.run(
    `UPDATE deals SET routing_status = 'reply_needed', scored_at = ?, updated_at = ?
     WHERE id = ? AND stage IN ('new', 'contacted')
       AND (? = 'start_form' OR routing_status IS NULL OR routing_status NOT IN ('ready_for_outbound', 'enriched'))`,
    [new Date(input.now).toISOString(), input.now, input.dealId, input.kind],
  );
}

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringError";
  }
}

/** Mark the open deal scoring_error and log lead.scoring_failed once per deal until it scores. */
export async function recordScoringFailure(sql: Sql, organizationId: string, reason: string, now: number): Promise<void> {
  console.error(`lead scoring failed for organization ${organizationId}: ${reason}`);
  const deal = await sql.get<{ id: string; routing_status: string | null }>(
    `SELECT id, routing_status FROM deals WHERE organization_id = ? AND stage NOT IN ('won', 'lost')
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
  if (!deal || deal.routing_status === "scoring_error" || isInboundStatus(deal.routing_status)) return;
  await sql.run("UPDATE deals SET routing_status = 'scoring_error', updated_at = ? WHERE id = ?", [now, deal.id]);
  await sql.run(
    `INSERT INTO activities (id, organization_id, deal_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, 'lead.scoring_failed', 'system', 'schema', ?, ?, ?)`,
    [crypto.randomUUID(), organizationId, deal.id, `Schema score could not be read. ${reason}`.slice(0, 600), JSON.stringify({ reason }), now],
  );
}

/** Copy the latest complete schema scan score onto the org's open deal. Readiness Check surveys are not used. */
export async function applySchemaScore(
  sql: Sql,
  organizationId: string,
  now: number,
): Promise<{ dealId: string; score: number; status: RoutingStatus } | null> {
  const open = await sql.get<{ id: string }>(
    "SELECT id FROM deals WHERE organization_id = ? AND stage NOT IN ('won', 'lost') LIMIT 1",
    [organizationId],
  );
  if (!open) return null;
  const table = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'readiness_scans'",
  );
  if (!table) {
    await recordScoringFailure(sql, organizationId, "readiness_scans table is missing; schema score could not be read.", now);
    throw new ScoringError("readiness_scans table is missing");
  }
  const latest = await sql.get<{ status: string; error_message: string | null }>(
    `SELECT status, error_message FROM readiness_scans
     WHERE status IN ('complete', 'failed')
       AND (organization_id = ? OR domain = (SELECT domain FROM organizations WHERE id = ?))
     ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 1`,
    [organizationId, organizationId],
  );
  if (latest?.status === "failed") {
    const bdr = await sql.get<{ id: string }>(
      "SELECT id FROM deals WHERE organization_id = ? AND source = 'bdr' AND stage NOT IN ('won', 'lost') LIMIT 1",
      [organizationId],
    );
    if (bdr) {
      await recordScoringFailure(sql, organizationId, `Schema scan failed: ${latest.error_message ?? "no reason given"}`.slice(0, 500), now);
    }
    return null;
  }
  const scan = await sql.get<{ score_total: number | null }>(
    `SELECT score_total FROM readiness_scans
     WHERE status = 'complete' AND score_total IS NOT NULL
       AND (organization_id = ? OR domain = (SELECT domain FROM organizations WHERE id = ?))
     ORDER BY COALESCE(completed_at, created_at) DESC LIMIT 1`,
    [organizationId, organizationId],
  );
  const status = routingFor(scan?.score_total);
  if (!scan || scan.score_total == null || !status) return null;
  const deal = await sql.get<{ id: string }>(
    `SELECT id FROM deals WHERE organization_id = ? AND stage NOT IN ('won', 'lost')
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId],
  );
  if (!deal) return null;
  // Inbound deals (reply_needed, replied) keep their status and scored_at; only the score is recorded.
  await sql.run(
    `UPDATE deals SET lead_score = ?,
       scored_at = CASE WHEN routing_status IN ('reply_needed', 'replied') THEN scored_at ELSE ? END,
       routing_status = CASE
         WHEN routing_status IN ('reply_needed', 'replied') THEN routing_status
         WHEN routing_status = 'enriched' AND ? = 'ready_for_outbound' THEN 'enriched'
         ELSE ? END,
       updated_at = ? WHERE id = ?`,
    [scan.score_total, new Date(now).toISOString(), status, status, now, deal.id],
  );
  const after = await sql.get<{ routing_status: string | null }>("SELECT routing_status FROM deals WHERE id = ?", [deal.id]);
  return { dealId: deal.id, score: scan.score_total, status: routingStatusOf(after?.routing_status) ?? status };
}
