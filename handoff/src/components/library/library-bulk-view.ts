import type { LibraryArtifact } from "@/lib/library-artifacts";
import type { BulkAction } from "@/lib/library-bulk-shared";

/** Only a deliverable piece can be approved or removed. Websites and files have no approval or shelf here. */
export function bulkSelectable(artifact: Pick<LibraryArtifact, "sourceKind" | "version">): boolean {
  return artifact.sourceKind === "deliverable_item" && artifact.version != null;
}

const ALREADY_APPROVED = new Set(["approved", "ready", "scheduled", "publishing", "published", "partially_published", "needs_attention"]);

/**
 * The page's own guess at what an action will do, to size the confirmation. It is an upper bound: the Library shows
 * "Changes asked" on every piece of a set while any one piece has changes requested, so that label alone does not
 * rule a piece out. The server decides again for each piece from the database, so a stale page can only change the
 * count in the dialog, never what gets approved.
 */
export function bulkPreview(
  action: BulkAction,
  chosen: readonly Pick<LibraryArtifact, "primaryStatus">[],
): { applies: number; skipped: number } {
  const applies = chosen.filter((artifact) => {
    if (action === "approve") return !ALREADY_APPROVED.has(artifact.primaryStatus);
    return true;
  }).length;
  return { applies, skipped: chosen.length - applies };
}

export type BulkCadence = { enabled: boolean; line: string };

export function bulkConfirmCopy(action: BulkAction, chosen: number, preview: { applies: number; skipped: number }, cadence: BulkCadence): { title: string; body: string[]; confirm: string } {
  const pieces = (count: number) => (count === 1 ? "1 piece" : `${count} pieces`);
  if (action === "approve") {
    const body = [
      `This approves up to ${pieces(preview.applies)} for the client. It is the same as pressing Approve on each one.`,
      cadence.enabled
        ? `Cadence is on for this client. ${cadence.line} Approved social pieces go on the calendar right away, in the next open slots.`
        : "Cadence is off for this client, so nothing is scheduled. Approved pieces wait on Social.",
    ];
    if (preview.skipped > 0) body.push(`${pieces(preview.skipped)} will be skipped because ${preview.skipped === 1 ? "it is" : "they are"} already approved.`);
    body.push("Anything the client sent back for changes is skipped too. Open it to approve once the changes are made.");
    return { title: `Approve ${pieces(chosen)}?`, body, confirm: "Approve" };
  }
  if (action === "remove") {
    return {
      title: `Remove ${pieces(chosen)}?`,
      body: [
        "Removing takes them off the Library and off Social. The files stay, and each one can be put back from the Removed list.",
        "A piece with a live post (sending, scheduled or published) is skipped. Cancel that post on Social first.",
      ],
      confirm: `Remove ${chosen}`,
    };
  }
  return {
    title: `Put back ${pieces(chosen)}?`,
    body: ["They return to the Library and to Social. Nothing is approved or scheduled by putting them back."],
    confirm: `Put back ${chosen}`,
  };
}
