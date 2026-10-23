// Types and words shared by the server action and the Library page. No database code here, so the page can import it.

export const BULK_LIMIT = 100;
export const BULK_ACTIONS = ["approve", "remove", "restore"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export type BulkPiece = { itemId: string; version: number };
export type BulkOutcome = {
  itemId: string;
  version: number;
  title: string;
  state: "applied" | "skipped" | "failed";
  /** Plain words for the staff member. Set for every skipped or failed piece and for notes on an applied one. */
  note: string | null;
};
export type BulkResult = {
  ok: boolean;
  action: BulkAction;
  /** Set when the whole request was refused (not signed in, nothing picked, too many). */
  error?: string;
  outcomes: BulkOutcome[];
  applied: number;
  skipped: number;
  failed: number;
  /** Social pieces Cadence placed on the calendar because of this approval. */
  scheduled: number;
  /** One line per piece Cadence could not place. */
  scheduleNotes: string[];
};

export type BulkScheduler = (input: { deliverableId: string; itemIds: string[] }) => Promise<{ scheduled: number; failed: string[] }>;

/** One sentence per outcome group, for the status line under the bar. */
export function bulkSummary(result: BulkResult): string {
  if (result.error) return result.error;
  const verb = result.action === "approve" ? "Approved" : result.action === "remove" ? "Removed" : "Put back";
  const parts = [`${verb} ${result.applied}`];
  if (result.skipped > 0) parts.push(`skipped ${result.skipped}`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.scheduled > 0) parts.push(`${result.scheduled} placed on the calendar`);
  return `${parts.join(", ")}.`;
}
