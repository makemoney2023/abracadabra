import type { Sql } from "@/db/sql";

/**
 * Pieces an agent approved through POST /api/agent-social/items/<id>/approve (#212) and no person has approved since.
 *
 * An agent approval is recorded as a `social.item.approved` activity (actor_kind 'agent'); there is no approver column
 * on the piece. A piece counts as agent-approved when:
 *   - it is approved now,
 *   - its newest agent approve/unapprove activity for that item and version is an approve, and
 *   - no staff member or client approved that one piece (an item-level `deliverable_feedback` approve) after it.
 * A whole-deliverable approval (feedback with no item) never counts as a person approving the piece, because it only
 * moves pending pieces and must not take over an agent's approval.
 *
 * Whole-deliverable approval, bulk approval and Cadence use this so they never re-approve, take over or schedule a
 * piece an agent approved: scheduling an agent-approved piece stays a separate, explicit plan step.
 */
export async function agentApprovedItemIds(sql: Sql, deliverableId: string, version: number): Promise<Set<string>> {
  const owner = await sql.get<{ organization_id: string }>("SELECT organization_id FROM deliverables WHERE id = ?", [deliverableId]);
  if (!owner) return new Set();
  const approved = await sql.all<{ id: string }>(
    "SELECT id FROM deliverable_items WHERE deliverable_id = ? AND version = ? AND status = 'approved'",
    [deliverableId, version],
  );
  if (approved.length === 0) return new Set();
  const ids = new Set(approved.map((row) => row.id));
  const events = await sql.all<{ kind: string; data_json: string | null; created_at: number }>(
    `SELECT kind, data_json, created_at FROM activities
     WHERE organization_id = ? AND actor_kind = 'agent' AND kind IN ('social.item.approved', 'social.item.unapproved')
     ORDER BY created_at, id`,
    [owner.organization_id],
  );
  const latest = new Map<string, { kind: string; at: number }>();
  for (const event of events) {
    let data: { item_id?: unknown; version?: unknown } = {};
    try {
      data = JSON.parse(event.data_json ?? "{}") as typeof data;
    } catch {
      continue;
    }
    if (typeof data.item_id !== "string" || !ids.has(data.item_id) || data.version !== version) continue;
    latest.set(data.item_id, { kind: event.kind, at: event.created_at });
  }
  const agentApproved = [...latest].filter(([, event]) => event.kind === "social.item.approved");
  if (agentApproved.length === 0) return new Set();
  const people = await sql.all<{ item_id: string; at: number }>(
    `SELECT item_id, MAX(created_at) AS at FROM deliverable_feedback
     WHERE deliverable_id = ? AND version = ? AND decision = 'approve' AND item_id IS NOT NULL
     GROUP BY item_id`,
    [deliverableId, version],
  );
  const personAt = new Map(people.map((row) => [row.item_id, row.at]));
  return new Set(agentApproved.filter(([itemId, event]) => (personAt.get(itemId) ?? -Infinity) <= event.at).map(([itemId]) => itemId));
}
