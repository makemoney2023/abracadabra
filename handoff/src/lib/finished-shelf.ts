import { workspacesFor } from "@/db/records";
import type { Sql } from "@/db/sql";
import type { Caller } from "./authz";

const LIVE_POST = new Set(["draft", "sending", "scheduled", "published", "partial"]);

export const SHELF_MISSING = "That piece is not here.";
export const SHELF_INVALID = "That choice is not valid.";
export const SHELF_LIVE = "Cancel the post on Social before you remove this.";
export const SHELF_REMOVED = "That piece was removed from the Library.";
export const PIECE_REMOVED_ERROR = "Piece removed.";

export type ShelfPost = { status: string; id: string };

/** Pieces still on the shelf, and the titles left out of Post to social. */
export function piecesOnShelf<T extends { id: string; title: string }>(
  pieces: readonly T[],
  removedIds: ReadonlySet<string>,
): { shown: T[]; skipped: string[] } {
  const shown: T[] = [];
  const skipped: string[] = [];
  for (const piece of pieces) {
    if (removedIds.has(piece.id)) skipped.push(piece.title);
    else shown.push(piece);
  }
  return { shown, skipped };
}

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
export function shelfRemoveBlock(posts: readonly ShelfPost[], organizationId: string): string | null {
  const live = posts.find((post) => LIVE_POST.has(post.status));
  if (!live) return null;
  return `${SHELF_LIVE} Post ${live.id} is on /clients/${organizationId}?tab=social.`;
}

/** What the proof says about who took a piece off the shelf. Clients never see an agent id. */
export function removalLine(input: {
  viewer: "staff" | "client";
  actorKind: string;
  actorId: string;
  at: number;
}): string {
  const who = input.viewer === "staff" && input.actorKind === "agent" ? input.actorId : "Studio";
  const when = new Date(input.at).toLocaleString("en-CA", { timeZone: "America/Toronto", hour12: false });
  return `Removed by ${who} on ${when}.`;
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
  actor?: { kind: "staff" | "agent" | "system"; id: string; workspaceId: string },
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
  if (actor) {
    if (actor.workspaceId !== row.workspace_id) return { ok: false, error: SHELF_MISSING };
  } else {
    const visible = await workspacesFor(sql, caller);
    if (!visible.some((space) => space.id === row.workspace_id)) return { ok: false, error: SHELF_MISSING };
  }
  if (row.published_version == null || input.version !== row.published_version) return { ok: false, error: SHELF_INVALID };
  const item = await sql.get<{ id: string; removed_at: number | null }>(
    "SELECT id, removed_at FROM deliverable_items WHERE id = ? AND deliverable_id = ? AND version = ?",
    [input.itemId, input.deliverableId, input.version],
  );
  if (!item) return { ok: false, error: SHELF_MISSING };
  if ((item.removed_at != null) === input.removed) return { ok: true };
  if (input.removed) {
    const posts = await sql.all<ShelfPost>(
      "SELECT id, status FROM social_posts WHERE item_id = ? AND version = ?",
      [input.itemId, input.version],
    );
    const block = shelfRemoveBlock(posts, row.organization_id);
    if (block) return { ok: false, error: block };
  }
  const actorKind = actor?.kind ?? (caller.staff ? "staff" : "system");
  const actorId = actor?.id ?? caller.userId;
  const writes: { statement: string; params: unknown[] }[] = [
    {
      statement: "UPDATE deliverable_items SET removed_at = ? WHERE id = ? AND deliverable_id = ? AND version = ?",
      params: [input.removed ? now : null, input.itemId, input.deliverableId, input.version],
    },
    {
      statement: "UPDATE deliverables SET updated_at = ? WHERE id = ?",
      params: [now, input.deliverableId],
    },
  ];
  if (input.removed) {
    writes.push({
      statement: `UPDATE social_posts SET error = ?, updated_at = ?
        WHERE item_id = ? AND version = ? AND status = 'failed' AND COALESCE(error, '') != 'Cancelled.'`,
      params: [PIECE_REMOVED_ERROR, now, input.itemId, input.version],
    });
  }
  writes.push({
    statement: `INSERT INTO activities (
      id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      crypto.randomUUID(),
      row.organization_id,
      row.project_id,
      row.workspace_id,
      input.removed ? "library_item_removed" : "library_item_restored",
      actorKind,
      actorId,
      input.removed ? "Removed from the Library." : "Put back in the Library.",
      JSON.stringify({ itemId: input.itemId, version: input.version }),
      now,
    ],
  });
  await sql.batch(writes);
  return { ok: true };
}
