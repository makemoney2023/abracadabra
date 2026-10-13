import { checkSpecialist, type SpecialistKind } from "../ai/check";

export type SettleAction =
  | { action: "retry"; note: string }
  | { action: "question"; questions: string[]; page: string }
  | { action: "check_failed"; receipt: { tools: { server: string; tool: string }[]; check: { ok: false; errors: string[] }; missing: string[] }; page: string }
  | { action: "completed"; page: string; receipt: { tools: { server: string; tool: string }[]; check: { ok: true; errors: [] }; missing: string[] } };

export function settleSpecialist(input: {
  kind: SpecialistKind;
  draft: string;
  handoff?: string;
  shape?: string;
  attempt: number;
  tools?: { server: string; tool: string }[];
}): SettleAction {
  const checked = checkSpecialist(input.kind, input.draft, input.handoff ?? "", input.shape ?? "");
  if (checked.questions && checked.questions.length > 0) {
    return { action: "question", questions: checked.questions, page: checked.page };
  }
  if (checked.ok) {
    return {
      action: "completed",
      page: checked.page,
      receipt: { tools: input.tools ?? [], check: { ok: true, errors: [] }, missing: checked.notes ?? [] },
    };
  }
  if (input.attempt < 2) return { action: "retry", note: checked.errors.join("; ") };
  return {
    action: "check_failed",
    page: input.draft,
    receipt: { tools: input.tools ?? [], check: { ok: false, errors: checked.errors }, missing: checked.errors },
  };
}
