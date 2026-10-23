export type ApprovalTone = "needs_review" | "changes" | "scheduled" | "posted" | "failed" | "draft";

const STATUS_LABEL: Record<string, string> = {
  sending: "Sending",
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Posted",
  partial: "Posted to some",
  failed: "Failed",
};

/** Client-facing status. Never names the publishing provider. */
export function calendarStatusLabel(state: string): string {
  return STATUS_LABEL[state] ?? state.slice(0, 1).toUpperCase() + state.slice(1);
}

/** Failed beats a pending decision. A cancelled post is not a calendar event. */
export function approvalTone(input: { state: string; approval?: string; cancelled?: boolean }): ApprovalTone | null {
  if (input.cancelled) return null;
  if (input.state === "failed") return "failed";
  if (input.approval === "changes_requested") return "changes";
  if (input.approval === "pending") return "needs_review";
  if (input.state === "published" || input.state === "partial") return "posted";
  if (input.state === "draft") return "draft";
  return "scheduled";
}

export function postOnCalendar(post: { status: string; error: string | null; scheduledFor: number | null }): boolean {
  if (post.error === "Cancelled." || post.error === "Piece removed.") return false;
  if (post.scheduledFor == null && post.status === "draft") return false;
  return post.status === "scheduled" || post.status === "published" || post.status === "partial" || post.status === "failed" || post.status === "sending" || post.status === "draft";
}

/**
 * Pieces that already have a post on the calendar: going out, sent, or a dated draft.
 * Approving a piece puts it on the next free slot, which writes one of these rows,
 * so this is what takes it off the side rail. A failed or cancelled post does not count.
 */
export function scheduledItemIds(
  posts: readonly { item_id: string; status: string; scheduled_for: number | null }[],
): Set<string> {
  return new Set(
    posts
      .filter((post) =>
        post.status === "sending" ||
        post.status === "scheduled" ||
        post.status === "published" ||
        post.status === "partial" ||
        (post.status === "draft" && post.scheduled_for != null))
      .map((post) => post.item_id),
  );
}

/** Pending first, then change requests. Approved work is not waiting. */
export function boardLists<T extends { id: string; status: string }>(
  pieces: T[],
  liveItemIds: Set<string>,
  heldItemIds: Set<string> = new Set(),
): { waiting: T[]; ready: T[] } {
  const waiting = pieces.filter((piece) => piece.status === "pending" || piece.status === "changes_requested");
  const pending = waiting.filter((piece) => piece.status === "pending");
  const changes = waiting.filter((piece) => piece.status === "changes_requested");
  const ready = pieces.filter((piece) => piece.status === "approved" && !liveItemIds.has(piece.id) && !heldItemIds.has(piece.id));
  return { waiting: [...pending, ...changes], ready };
}

/** A piece with no network yet stays visible, so a filter cannot hide work that still needs a look. */
export function visibleReview<T extends { platforms: string[] }>(pieces: T[], platform: string): T[] {
  if (!platform) return pieces;
  return pieces.filter((piece) => piece.platforms.length === 0 || piece.platforms.includes(platform));
}
