import type { Caller } from "@/lib/authz";

/**
 * Agent filings land in a client space held: staff (super-admins and the space's operators), Client Services and
 * the client's agents see them; client members do not, in listings, downloads, previews, search or notices, until
 * Client Services approves. A batch is client-visible when it was never held (everything filed before the hold
 * shipped) or was released, and was not hidden later (superseded or withdrawn).
 */
export function clientVisibleBatch(alias = "b"): string {
  return `((${alias}.held_at IS NULL OR ${alias}.released_at IS NOT NULL) AND ${alias}.hidden_at IS NULL)`;
}

/** True when this caller sees held work in this space (staff on it). Client members never do. */
export function seesHeldWork(caller: Caller, workspaceId: string): boolean {
  if (caller.staff?.superAdmin === true) return true;
  return caller.operatorOf.includes(workspaceId);
}

export type HeldState = { held_at: number | null; released_at: number | null; hidden_at: number | null };

export function batchVisibleToClient(row: HeldState): boolean {
  return (row.held_at == null || row.released_at != null) && row.hidden_at == null;
}

export function batchVisibleTo(caller: Caller, workspaceId: string, row: HeldState): boolean {
  return seesHeldWork(caller, workspaceId) || batchVisibleToClient(row);
}

/** Label staff see next to a held, released, or retired filing. */
export function heldLabel(row: HeldState & { discarded_at?: number | null }): "held" | "released" | "hidden" | null {
  if (row.hidden_at != null || row.discarded_at != null) return row.held_at != null || row.hidden_at != null ? "hidden" : null;
  if (row.held_at == null) return null;
  return row.released_at != null ? "released" : "held";
}
