import { CRM_ERRORS, type CrmError } from "@/db/crm";

/** Sentence for a failed stage move. Lost is its own case. */
export function moveDealMessage(error: CrmError, stage: string): string {
  if (error === "invalid" && stage === "lost") return "Say why this deal was lost.";
  if (error === "invalid") return "Pick a stage.";
  return CRM_ERRORS[error];
}
