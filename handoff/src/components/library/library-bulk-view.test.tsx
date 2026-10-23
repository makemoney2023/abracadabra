import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BulkResult } from "@/lib/library-bulk-shared";
import { LibraryBulkBar, BulkResultNote, type BulkConfig } from "./library-bulk-bar";
import { bulkConfirmCopy, bulkPreview, bulkSelectable } from "./library-bulk-view";
import { LibraryGallery } from "./library-gallery";
import { projectLibraryArtifact } from "@/lib/library-artifacts";

const artifact = (id: string, over: Partial<Parameters<typeof projectLibraryArtifact>[0]> = {}) =>
  projectLibraryArtifact({
    sourceKind: "deliverable_item", sourceId: id, version: 1, workspaceId: "ws-1", organizationId: "org-1", title: `Piece ${id}`,
    format: "static", channel: "instagram", approval: "needs_review", publication: "not_published", updatedAt: 1, audience: "staff", ...over,
  });

const config: BulkConfig = {
  slug: "acme",
  removedView: false,
  cadence: { enabled: true, line: "Slots: Mon at 09:00 (America/Toronto)." },
  action: async () => { throw new Error("not called"); },
};

describe("library bulk view", () => {
  it("only deliverable pieces are selectable", () => {
    expect(bulkSelectable(artifact("a"))).toBe(true);
    expect(bulkSelectable(artifact("a", { sourceKind: "built_work", version: null }))).toBe(false);
    expect(bulkSelectable(artifact("a", { sourceKind: "file", version: null }))).toBe(false);
  });

  it("sizes the approve confirmation from what is waiting and says plainly when Cadence will schedule", () => {
    const chosen = [artifact("a"), artifact("b", { approval: "approved" }), artifact("c", { approval: "changes_requested" })];
    // "Changes asked" on the page does not rule a piece out, because every piece of a set wears it while one is sent back.
    expect(bulkPreview("approve", chosen)).toEqual({ applies: 2, skipped: 1 });
    expect(bulkPreview("remove", chosen)).toEqual({ applies: 3, skipped: 0 });
    const on = bulkConfirmCopy("approve", 2, { applies: 1, skipped: 1 }, { enabled: true, line: "Slots: Mon at 09:00 (America/Toronto)." });
    expect(on.title).toBe("Approve 2 pieces?");
    expect(on.body.join(" ")).toContain("Cadence is on for this client");
    expect(on.body.join(" ")).toContain("go on the calendar right away");
    expect(on.body.join(" ")).toContain("1 piece will be skipped because it is already approved");
    expect(on.body.join(" ")).toContain("sent back for changes");
    expect(on.confirm).toBe("Approve");
    const off = bulkConfirmCopy("approve", 1, { applies: 1, skipped: 0 }, { enabled: false, line: "" });
    expect(off.body.join(" ")).toContain("nothing is scheduled");
    const remove = bulkConfirmCopy("remove", 3, { applies: 3, skipped: 0 }, { enabled: false, line: "" });
    expect(remove.body.join(" ")).toContain("The files stay");
    expect(remove.body.join(" ")).toContain("Cancel that post on Social first");
  });

  it("shows Select only when bulk is on, with no checkboxes until Select is pressed", () => {
    const withBulk = renderToStaticMarkup(<LibraryGallery artifacts={[artifact("a")]} empty="None" bulk={config} />);
    expect(withBulk).toContain(">Select<");
    expect(withBulk).not.toContain('role="checkbox"');
    const without = renderToStaticMarkup(<LibraryGallery artifacts={[artifact("a")]} empty="None" />);
    expect(without).not.toContain(">Select<");
  });

  it("the action bar offers Approve and Remove, or only Put back in the Removed list, disabled with nothing picked", () => {
    const bar = renderToStaticMarkup(<LibraryBulkBar config={config} chosen={[]} onDone={() => undefined} onClear={() => undefined} />);
    expect(bar).toContain("Approve selected");
    expect(bar).toContain("Remove selected");
    expect(bar).toContain('aria-label="Bulk actions"');
    expect(bar).toContain("Pick pieces to approve or remove.");
    expect(bar).toMatch(/<button[^>]*disabled=""[^>]*>Approve selected/);
    const removed = renderToStaticMarkup(<LibraryBulkBar config={{ ...config, removedView: true }} chosen={[artifact("a")]} onDone={() => undefined} onClear={() => undefined} />);
    expect(removed).toContain("Put back selected");
    expect(removed).not.toContain("Approve selected");
    expect(removed).toContain("1 piece selected");
  });

  it("lists skipped and failed pieces with their reasons", () => {
    const result: BulkResult = {
      ok: true, action: "approve", applied: 1, skipped: 1, failed: 1, scheduled: 1, scheduleNotes: ["No slot."],
      outcomes: [
        { itemId: "a", version: 1, title: "Alpha", state: "applied", note: null },
        { itemId: "b", version: 1, title: "Beta", state: "skipped", note: "Already approved." },
        { itemId: "c", version: 1, title: "Gamma", state: "failed", note: "Could not be approved." },
      ],
    };
    const html = renderToStaticMarkup(<BulkResultNote result={result} onDismiss={() => undefined} />);
    expect(html).toContain("Approved 1, skipped 1, 1 failed, 1 placed on the calendar.");
    expect(html).toContain("Beta");
    expect(html).toContain("Skipped: Already approved.");
    expect(html).toContain("Failed: Could not be approved.");
    expect(html).not.toContain("Alpha");
    expect(html).toContain("No slot.");
  });
});
