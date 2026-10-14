import type { Sql } from "../db/sql";

/**
 * Schema-check score cutoff. A low schema score means the site needs our work,
 * so score <= 70 is ready for outbound (Account Research enriches, then Sales Outbound).
 * Score > 70 is nurture, shown as "C quality" on the leads board.
 */
export const LEAD_READY_THRESHOLD = 70;

export type RoutingStatus = "ready_for_outbound" | "nurture" | "enriched" | "scoring_error";

export const ROUTING_LABEL: Record<RoutingStatus, string> = {
  ready_for_outbound: "Ready for outbound",
  nurture: "C quality",
  enriched: "Enriched",
  scoring_error: "Scoring error",
};

export function routingFor(score: number | null | undefined): RoutingStatus | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return score <= LEAD_READY_THRESHOLD ? "ready_for_outbound" : "nurture";
}

export function routingStatusOf(value: string | null | undefined): RoutingStatus | null {
  return value === "ready_for_outbound" || value === "nurture" || value === "enriched" || value === "scoring_error"
    ? value
    : null;
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
  if (!deal || deal.routing_status === "scoring_error") return;
  await sql.run("UPDATE deals SET routing_status = 'scoring_error', updated_at = ? WHERE id = ?", [now, deal.id]);
  await sql.run(
    `INSERT INTO activities (id, organization_id, deal_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, ?, 'lead.scoring_failed', 'system', 'schema', ?, ?, ?)`,
    [crypto.randomUUID(), organizationId, deal.id, "Schema score could not be read.", JSON.stringify({ reason }), now],
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
  await sql.run(
    `UPDATE deals SET lead_score = ?, scored_at = ?,
       routing_status = CASE WHEN routing_status = 'enriched' AND ? = 'ready_for_outbound' THEN 'enriched' ELSE ? END,
       updated_at = ? WHERE id = ?`,
    [scan.score_total, new Date(now).toISOString(), status, status, now, deal.id],
  );
  return { dealId: deal.id, score: scan.score_total, status };
}
