import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";

const LIVE_POST = new Set(["draft", "sending", "scheduled", "published", "partial"]);

export const SHELF_MISSING = "That piece is not here.";
export const SHELF_INVALID = "That choice is not valid.";
export const SHELF_LIVE = "Cancel the post on Social before you remove this.";
export const SHELF_REMOVED = "That piece was removed from the Library.";

/** The Library card opens this one piece, not the whole set. */
export function pieceOpenHref(slug: string, deliverableId: string, itemId: string): string {
  return `/w/${slug}/work/${deliverableId}?item=${encodeURIComponent(itemId)}`;
}

/** Social keeps a count and a Library link. It does not list the pieces again. */
export function shelfNote(kind: "waiting" | "ready", count: number): { text: string; status?: string } {
  if (kind === "waiting") {
    if (count === 0) return { text: "Nothing needs a look." };
    return { text: count === 1 ? "1 piece needs a look." : `${count} pieces need a look.`, status: "needs_review" };
  }
  if (count === 0) return { text: "Approved work is on the calendar, or not ready yet." };
  return {
    text: count === 1 ? "1 approved piece is not on the calendar." : `${count} approved pieces are not on the calendar.`,
    status: "ready",
  };
}

/** A post that is still going out has to be cancelled before the piece can leave the shelf. */
export function shelfRemoveBlock(statuses: readonly string[]): string | null {
  return statuses.some((status) => LIVE_POST.has(status)) ? SHELF_LIVE : null;
}

/** Scheduling and posting skip a piece that was taken off the Library. */
export function shelfPostBlock(removedAt: number | null | undefined): string | null {
  return removedAt == null ? null : SHELF_REMOVED;
}

/**
 * Take a finished piece off the Library and off the Social lists, or put it back.
 * The row, the notes, and the files stay. A live post blocks removal.
 */
export async function setPieceShelf(
  sql: Sql,
  caller: Caller,
  input: { deliverableId: string; itemId: string; version: number; removed: boolean },
  now: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!caller.userId) return { ok: false, error: SHELF_MISSING };
  const row = await sql.get<{
    id: string;
    organization_id: string;
    project_id: string | null;
    workspace_id: string;
    published_version: number | null;
  }>(
    `SELECT id, organization_id, project_id, workspace_id, published_version
     FROM deliverables WHERE id = ?`,
    [input.deliverableId],
  );
  if (!row) return { ok: false, error: SHELF_MISSING };
  const visible = await workspacesFor(sql, caller);
  if (!visible.some((space) => space.id === row.workspace_id)) return { ok: false, error: SHELF_MISSING };
  if (row.published_version == null || input.version !== row.published_version) return { ok: false, error: SHELF_INVALID };
  const item = await sql.get<{ id: string; removed_at: number | null }>(
    "SELECT id, removed_at FROM deliverable_items WHERE id = ? AND deliverable_id = ? AND version = ?",
    [input.itemId, input.deliverableId, input.version],
  );
  if (!item) return { ok: false, error: SHELF_MISSING };
  if ((item.removed_at != null) === input.removed) return { ok: true };
  if (input.removed) {
    const posts = await sql.all<{ status: string }>(
      "SELECT status FROM social_posts WHERE item_id = ? AND version = ?",
      [input.itemId, input.version],
    );
    const block = shelfRemoveBlock(posts.map((post) => post.status));
    if (block) return { ok: false, error: block };
  }
  await sql.batch([
    {
      statement: "UPDATE deliverable_items SET removed_at = ? WHERE id = ? AND deliverable_id = ? AND version = ?",
      params: [input.removed ? now : null, input.itemId, input.deliverableId, input.version],
    },
    {
      statement: "UPDATE deliverables SET updated_at = ? WHERE id = ?",
      params: [now, input.deliverableId],
    },
    {
      statement: `INSERT INTO activities (
        id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      params: [
        crypto.randomUUID(),
        row.organization_id,
        row.project_id,
        row.workspace_id,
        input.removed ? "library_item_removed" : "library_item_restored",
        caller.staff ? "staff" : "system",
        caller.userId,
        input.removed ? "Removed from the Library." : "Put back in the Library.",
        now,
      ],
    },
  ]);
  return { ok: true };
}
