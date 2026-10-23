import { zonedToUtc } from "./social-calendar";

export type PostPreviewAccount = { id: string; platform: string; name: string; label: string };

/** Everything the calendar preview shows for one post. Built on the server, safe to send to the browser. */
export type PostPreviewData = {
  postId: string;
  itemId: string;
  deliverableId: string;
  deliverableTitle: string;
  title: string;
  status: string;
  postType: string;
  format: string;
  scheduledFor: number | null;
  timezone: string;
  accounts: PostPreviewAccount[];
  /** The piece text. Per-network text, when there is some, is in `captions`. */
  caption: string;
  captions: Record<string, string>;
  media: { role: string; video: boolean; contentType: string }[];
  /** Approval state of the piece itself, when the piece is still in the Library. */
  pieceStatus: string | null;
  /** True when the post has a copy waiting at the scheduler that a move or cancel can reach. */
  hasScheduledCopy: boolean;
  /** Why it failed. Staff only. */
  error: string | null;
  /** Networks that were skipped when the post was made. Staff only. */
  skipped: string | null;
  publishedLinks: { platform: string; url: string }[];
};

/** How close two posts to the same account can be before we say so. */
export const SLOT_WINDOW_MINUTES = 60;

const LIVE = new Set(["scheduled", "sending", "draft"]);

export type RescheduleCheck =
  | { ok: false; error: string }
  | { ok: true; at: number; warnings: string[] };

function clock(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at));
}

/**
 * Checks a typed time before it goes to the server. The server checks again, so this only saves a round trip.
 * Another live post to the same account near the new time is a warning, not a block.
 */
export function rescheduleCheck(input: {
  local: string;
  timeZone: string;
  now: number;
  current: Pick<PostPreviewData, "postId" | "scheduledFor" | "accounts">;
  others: Pick<PostPreviewData, "postId" | "title" | "status" | "scheduledFor" | "accounts">[];
}): RescheduleCheck {
  if (!input.local.trim()) return { ok: false, error: "Pick a date and time." };
  const at = zonedToUtc(input.local, input.timeZone || "UTC");
  if (at == null) return { ok: false, error: "That date and time is not valid." };
  if (at < input.now + 60_000) return { ok: false, error: "Pick a time at least one minute from now." };
  if (input.current.scheduledFor != null && Math.abs(at - input.current.scheduledFor) < 60_000) {
    return { ok: false, error: "That is the time it already has. Pick a different one." };
  }
  const mine = new Set(input.current.accounts.map((account) => account.id));
  const window = SLOT_WINDOW_MINUTES * 60_000;
  const warnings = input.others
    .filter((other) => other.postId !== input.current.postId && LIVE.has(other.status) && other.scheduledFor != null)
    .filter((other) => other.accounts.some((account) => mine.has(account.id)))
    .filter((other) => Math.abs((other.scheduledFor as number) - at) < window)
    .sort((left, right) => (left.scheduledFor as number) - (right.scheduledFor as number))
    .map((other) => {
      const shared = other.accounts.find((account) => mine.has(account.id));
      return `“${other.title}” is already set for ${clock(other.scheduledFor as number, input.timeZone)} on ${shared?.label ?? "the same account"}.`;
    });
  return { ok: true, at, warnings };
}

/** One line naming where the post goes. */
export function accountsLine(accounts: PostPreviewAccount[]): string {
  if (accounts.length === 0) return "No account";
  return accounts.map((account) => account.label).join(", ");
}

/** The scheduled time as staff read it, in the post's own zone. */
export function whenLabel(at: number | null, timeZone: string): string {
  if (at == null) return "No time set";
  try {
    return `${new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at))} (${timeZone})`;
  } catch {
    return `${new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(at))} (UTC)`;
  }
}
