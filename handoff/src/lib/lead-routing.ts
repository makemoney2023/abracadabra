import type { Sql } from "../db/sql";

/**
 * Schema-check score cutoff. A low schema score means the site needs our work,
 * so score < 70 is ready for outbound (Account Research enriches, then Sales Outbound).
 * Score >= 70 is nurture, shown as "C quality" on the leads board.
 */
export const LEAD_READY_THRESHOLD = 70;

export type RoutingStatus = "ready_for_outbound" | "nurture" | "enriched";

export const ROUTING_LABEL: Record<RoutingStatus, string> = {
  ready_for_outbound: "Ready for outbound",
  nurture: "C quality",
  enriched: "Enriched",
};

export function routingFor(score: number | null | undefined): RoutingStatus | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  return score < LEAD_READY_THRESHOLD ? "ready_for_outbound" : "nurture";
}

export function routingStatusOf(value: string | null | undefined): RoutingStatus | null {
  return value === "ready_for_outbound" || value === "nurture" || value === "enriched" ? value : null;
}

/** Copy the latest complete schema scan score onto the org's open deal. Readiness Check surveys are not used. */
export async function applySchemaScore(
  sql: Sql,
  organizationId: string,
  now: number,
): Promise<{ dealId: string; score: number; status: RoutingStatus } | null> {
  const table = await sql.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'readiness_scans'",
  );
  if (!table) return null;
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
