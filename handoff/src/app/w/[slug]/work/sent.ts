import type { FeedbackDecision } from "@/db/deliverables";

/** What the client reads when saving failed for a reason they can't fix. Never the raw error. */
export const FEEDBACK_SAVE_FAILED = "That didn't go through. Please try again in a minute.";

/** ?sent= on the piece's page after a save, so the client sees a confirmation instead of a silent reload. */
export const SENT: Record<FeedbackDecision, string> = { approve: "approved", changes: "changes", comment: "note" };

/** The confirmation for ?sent=, or null for anything else. */
export function sentConfirmation(value: string | undefined): { title: string; body: string } | null {
  if (value === "changes") {
    return {
      title: "Thanks, we have your change request.",
      body: "The team is on it. You'll see the updated version here when it's ready.",
    };
  }
  if (value === "approved") return { title: "Thanks, that's approved.", body: "We'll take it from here." };
  if (value === "note") return { title: "Your note is saved.", body: "The team will see it." };
  if (value === "removed") {
    return {
      title: "Removed from the Library.",
      body: "It is off the Social list too. The files stay. Put it back any time.",
    };
  }
  if (value === "restored") return { title: "It's back in the Library.", body: "Open Social when you want it on the calendar." };
  return null;
}
