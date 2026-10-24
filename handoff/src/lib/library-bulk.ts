import { recordFeedback } from "@/db/deliverables";
import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { setPieceShelf, SHELF_LIVE } from "./finished-shelf";
import { agentApprovedItemIds } from "./social-approvals";
import { BULK_ACTIONS, BULK_LIMIT, type BulkAction, type BulkOutcome, type BulkPiece, type BulkResult, type BulkScheduler } from "./library-bulk-shared";

export { BULK_ACTIONS, BULK_LIMIT, bulkSummary } from "./library-bulk-shared";
export type { BulkAction, BulkOutcome, BulkPiece, BulkResult, BulkScheduler } from "./library-bulk-shared";

export const BULK_MISSING = "That piece is not in this workspace.";
export const BULK_AGENT_APPROVED = "Already approved by an agent. It keeps that approval and is not scheduled here. Schedule it from Social or with a plan.";
export const BULK_NO_SOCIAL = "Social posting is not set up, so nothing was scheduled. The approved pieces wait on Social.";

type Row = {
  id: string;
  version: number;
  title: string;
  status: string;
  removed_at: number | null;
  deliverable_id: string;
  workspace_id: string;
  kind: string;
  published_version: number | null;
};

function empty(action: BulkAction, error?: string): BulkResult {
  return { ok: false, action, ...(error ? { error } : {}), outcomes: [], applied: 0, skipped: 0, failed: 0, scheduled: 0, scheduleNotes: [] };
}

/** What each action does to a piece in this state, or why it does nothing. Read from the database, never from the page. */
export function bulkSkipReason(action: BulkAction, row: Row): string | null {
  if (row.kind === "brief" || row.kind === "design_system") return "Briefs and design systems are not finished work, so they are not approved or removed here.";
  if (action === "restore") return row.removed_at == null ? "Already in the Library." : null;
  if (action === "remove") return row.removed_at != null ? "Already removed." : null;
  if (row.removed_at != null) return "Removed from the Library. Put it back first.";
  if (row.published_version == null || row.version !== row.published_version) return "Not published to the Library yet, so there is nothing to approve.";
  if (row.status === "approved") return "Already approved.";
  if (row.status === "changes_requested") return "Changes were requested. Open it to approve once they are made.";
  return null;
}

/**
 * Approve, remove or put back many Library pieces. Each piece goes through the same function the single-piece buttons
 * use (`recordFeedback` for approve, `setPieceShelf` for remove and put back), so every existing check still applies.
 * A piece the action does not apply to is skipped with a reason. One piece failing never stops the rest.
 * After approvals, Cadence runs once per deliverable for the pieces just approved, exactly as the single approve does.
 * Pieces that could not be scheduled (no posting time, no connected account, no open slot) are listed in scheduleNotes;
 * they stay approved. A piece that is already approved, including one an agent approved, is skipped untouched.
 */
export async function bulkLibraryAction(
  sql: Sql,
  caller: Caller,
  input: { workspaceId: string; action: BulkAction; pieces: readonly BulkPiece[] },
  now: number,
  schedule: BulkScheduler | null,
): Promise<BulkResult> {
  const { action } = input;
  if (!caller.userId || !caller.staff) return empty(action, "Only staff can change many pieces at once.");
  if (!BULK_ACTIONS.includes(action)) return empty(action, "That choice is not valid.");
  const seen = new Set<string>();
  const pieces = input.pieces.filter((piece) => {
    const key = `${piece.itemId}:${piece.version}`;
    if (seen.has(key) || typeof piece.itemId !== "string" || !Number.isInteger(piece.version)) return false;
    seen.add(key);
    return true;
  });
  if (pieces.length === 0) return empty(action, "Pick at least one piece.");
  if (pieces.length > BULK_LIMIT) return empty(action, `Pick ${BULK_LIMIT} pieces or fewer at a time.`);
  const visible = await workspacesFor(sql, caller);
  if (!visible.some((space) => space.id === input.workspaceId)) return empty(action, BULK_MISSING);

  const result = empty(action);
  const approvedByDeliverable = new Map<string, string[]>();
  for (const piece of pieces) {
    const row = await sql.get<Row>(
      `SELECT i.id, i.version, i.title, i.status, i.removed_at, i.deliverable_id,
              d.workspace_id, d.kind, d.published_version
       FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
       WHERE i.id = ? AND i.version = ?`,
      [piece.itemId, piece.version],
    );
    const base = { itemId: piece.itemId, version: piece.version };
    if (!row || row.workspace_id !== input.workspaceId) {
      result.outcomes.push({ ...base, title: row?.title ?? piece.itemId, state: "skipped", note: BULK_MISSING });
      continue;
    }
    const outcome = (state: BulkOutcome["state"], note: string | null) => result.outcomes.push({ ...base, title: row.title, state, note });
    const skip = bulkSkipReason(action, row);
    if (skip) {
      // An agent-approved piece (#212) is left exactly as it is: no new approval, feedback, activity or schedule.
      const byAgent = action === "approve" && row.status === "approved" && (await agentApprovedItemIds(sql, row.deliverable_id, row.version)).has(row.id);
      outcome("skipped", byAgent ? BULK_AGENT_APPROVED : skip);
      continue;
    }
    try {
      if (action === "approve") {
        const saved = await recordFeedback(
          sql,
          caller,
          { deliverableId: row.deliverable_id, itemId: row.id, version: row.version, decision: "approve", body: "" },
          now,
        );
        if (!saved.ok) {
          outcome("failed", "Could not be approved. Open it to see why.");
          continue;
        }
        approvedByDeliverable.set(row.deliverable_id, [...(approvedByDeliverable.get(row.deliverable_id) ?? []), row.id]);
        outcome("applied", null);
      } else {
        const saved = await setPieceShelf(
          sql,
          caller,
          { deliverableId: row.deliverable_id, itemId: row.id, version: row.version, removed: action === "remove" },
          now,
        );
        if (saved.ok) outcome("applied", null);
        else if (saved.error.startsWith(SHELF_LIVE)) outcome("skipped", saved.error);
        else outcome("failed", saved.error);
      }
    } catch (error) {
      console.error("bulkLibraryAction: piece failed", row.id, error);
      outcome("failed", "Something went wrong saving this one.");
    }
  }

  if (action === "approve" && !schedule && approvedByDeliverable.size > 0) result.scheduleNotes.push(BULK_NO_SOCIAL);
  if (action === "approve" && schedule) {
    // Only the pieces approved by this request. Pieces approved earlier (by an agent, for example) are never swept up.
    for (const [deliverableId, itemIds] of approvedByDeliverable) {
      try {
        const placed = await schedule({ deliverableId, itemIds });
        result.scheduled += placed.scheduled;
        result.scheduleNotes.push(...placed.failed, ...(placed.skipped ?? []));
      } catch (error) {
        console.error("bulkLibraryAction: scheduling failed", deliverableId, error);
        result.scheduleNotes.push("Cadence could not place some approved pieces. They are approved and wait on Social.");
      }
    }
  }
  for (const outcome of result.outcomes) result[outcome.state === "applied" ? "applied" : outcome.state === "skipped" ? "skipped" : "failed"] += 1;
  result.ok = true;
  return result;
}
