"use server";

import { revalidatePath } from "next/cache";
import { workspacesFor } from "@/db/records";
import { openSession } from "@/lib/current";
import { BULK_ACTIONS, type BulkAction, type BulkPiece, type BulkResult, type BulkScheduler } from "@/lib/library-bulk-shared";
import { bulkLibraryAction } from "@/lib/library-bulk";
import { autoScheduleApproved } from "@/lib/social-autopost";
import { openObjectStore } from "@/lib/store/objects";
import { openZernio } from "@/lib/zernio";

const NONE: BulkResult = { ok: false, action: "approve", outcomes: [], applied: 0, skipped: 0, failed: 0, scheduled: 0, scheduleNotes: [] };

/**
 * Approve, remove or put back the picked Library pieces in one go. Staff only. The work happens in `bulkLibraryAction`,
 * which reuses the single-piece approve and remove functions for each piece.
 */
export async function libraryBulkAction(input: { slug: string; action: string; pieces: { itemId: string; version: number }[] }): Promise<BulkResult> {
  const action = BULK_ACTIONS.find((candidate) => candidate === input?.action) as BulkAction | undefined;
  if (!action || !Array.isArray(input.pieces)) return { ...NONE, error: "That choice is not valid." };
  const pieces: BulkPiece[] = input.pieces.flatMap((piece) =>
    piece && typeof piece.itemId === "string" && Number.isInteger(piece.version) ? [{ itemId: piece.itemId, version: piece.version }] : [],
  );
  const { sql, caller } = await openSession();
  const workspace = (await workspacesFor(sql, caller)).find((row) => row.slug === String(input.slug));
  if (!workspace) return { ...NONE, action, error: "That workspace is not available." };
  const zernio = action === "approve" ? openZernio() : null;
  const schedule: BulkScheduler | null = zernio
    ? ({ deliverableId, itemIds }) => autoScheduleApproved(sql, zernio, openObjectStore(), { deliverableId, itemIds }, Date.now())
    : null;
  const result = await bulkLibraryAction(sql, caller, { workspaceId: workspace.id, action, pieces }, Date.now(), schedule);
  if (result.ok && result.applied > 0) {
    revalidatePath(`/w/${workspace.slug}/library`);
    revalidatePath(`/w/${workspace.slug}/social`);
    revalidatePath(`/w/${workspace.slug}/work`);
    const deliverables = await sql.all<{ deliverable_id: string }>(
      `SELECT DISTINCT deliverable_id FROM deliverable_items WHERE id IN (${pieces.map(() => "?").join(", ")})`,
      pieces.map((piece) => piece.itemId),
    );
    for (const row of deliverables) revalidatePath(`/w/${workspace.slug}/work/${row.deliverable_id}`);
    const owner = await sql.get<{ organization_id: string | null }>("SELECT organization_id FROM workspaces WHERE id = ?", [workspace.id]);
    if (owner?.organization_id) revalidatePath(`/clients/${owner.organization_id}`);
  }
  return result;
}
