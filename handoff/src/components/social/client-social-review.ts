import { PLATFORM_LABEL } from "@/lib/zernio";

export type ClientReviewInput = {
  title: string;
  caption: string;
  mediaRoles: string[];
  platform: string;
  targetState: string;
  cadenceEnabled: boolean;
  cadenceLabel: string;
  previewSlots: string[];
  fingerprint: string;
  confirmedFingerprint: string;
  role: "owner" | "member";
};

function stateWord(state: string): string {
  if (state === "scheduled") return "Scheduled";
  if (state === "unpublished") return "Not published";
  if (state === "published" || state === "succeeded") return "Published";
  return state.slice(0, 1).toUpperCase() + state.slice(1);
}

/** Client review of one piece. Copy names the network, never the publishing provider. */
export function clientSocialReview(input: ClientReviewInput): {
  title: string;
  caption: string;
  mediaRoles: string[];
  platformState: string;
  actions: string[];
  recommendation: { cadence: string; preview: string[]; valid: boolean };
  canReconnect: boolean;
  calendarReadOnly: boolean;
  canConfirmSchedule: boolean;
} {
  const network = PLATFORM_LABEL[input.platform] ?? input.platform;
  const valid = input.fingerprint === input.confirmedFingerprint;
  return {
    title: input.title,
    caption: input.caption,
    mediaRoles: input.mediaRoles,
    platformState: `${stateWord(input.targetState)} on ${network}`,
    actions: input.cadenceEnabled ? ["approve_with_cadence", "request_changes"] : ["approve", "request_changes"],
    recommendation: { cadence: input.cadenceLabel, preview: input.previewSlots, valid },
    canReconnect: input.role === "owner",
    calendarReadOnly: true,
    canConfirmSchedule: input.cadenceEnabled && valid,
  };
}
