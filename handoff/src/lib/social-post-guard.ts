/**
 * What staff may still do to one post. The server actions and the calendar preview both read this,
 * so the buttons and the refusals can't drift apart.
 */
export type PostActionState = {
  canReschedule: boolean;
  canRemove: boolean;
  /** Why a button is missing. Null when both actions are open. */
  reason: string | null;
};

export const RESCHEDULE_REFUSAL = "Only a scheduled post can move.";
export const REMOVE_REFUSAL = "Only a scheduled post or a draft can be cancelled.";

export function canRescheduleStatus(status: string): boolean {
  return status === "scheduled";
}

export function canRemoveStatus(status: string): boolean {
  return status === "scheduled" || status === "draft";
}

const REASON: Record<string, string> = {
  sending: "This post is going out now, so it can't be moved or removed.",
  published: "This post is already live. It can only be taken down on the network itself.",
  partial: "This post went out to some accounts. It can only be taken down on the network itself.",
  failed: "This post did not go out, so there is nothing scheduled to move or remove.",
};

export function postActionState(post: { status: string; hasScheduledCopy?: boolean }): PostActionState {
  const missing = post.hasScheduledCopy === false;
  const canReschedule = canRescheduleStatus(post.status) && !missing;
  const canRemove = canRemoveStatus(post.status) && !missing;
  if (canReschedule && canRemove) return { canReschedule, canRemove, reason: null };
  if (missing && canRemoveStatus(post.status)) {
    return { canReschedule, canRemove, reason: "This post was never handed to the scheduler, so there is nothing to move or remove." };
  }
  if (post.status === "draft") {
    return { canReschedule, canRemove, reason: "A draft has no send time yet. Schedule it from finished work, or remove it." };
  }
  return { canReschedule, canRemove, reason: REASON[post.status] ?? "This post can't be changed." };
}
