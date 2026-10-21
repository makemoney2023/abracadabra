export type ComposerStep = "content" | "destinations" | "timing" | "review";

export type ComposerPiece = {
  id: string;
  title: string;
  approved: boolean;
  compatible: boolean;
  postType: string;
};

export type ComposerRow = {
  itemId: string;
  accountId: string;
  postType: string;
  blocked: boolean;
  reason?: string;
};

export type ComposerState = {
  step: ComposerStep;
  pieces: ComposerPiece[];
  accountIds: string[];
  pieceIds: string[];
  planId: string | null;
  planHash: string | null;
  rows?: ComposerRow[];
};

/** Approved and compatible only. This is not the staff form's select-all, and not an empty id list. */
export function selectAllEligible(pieces: ComposerPiece[]): string[] {
  return pieces.filter((piece) => piece.approved && piece.compatible).map((piece) => piece.id);
}

export function startComposer(pieces: ComposerPiece[], accountIds: string[]): ComposerState {
  return {
    step: "content",
    pieces,
    accountIds,
    pieceIds: selectAllEligible(pieces),
    planId: null,
    planHash: null,
  };
}

export function composerReview(state: ComposerState & { rows: ComposerRow[] }): ComposerState & {
  rows: ComposerRow[];
  blocked: { itemId: string; accountId: string; reason: string }[];
  whollySuccessful: boolean;
} {
  const blocked = state.rows.flatMap((row) =>
    row.blocked ? [{ itemId: row.itemId, accountId: row.accountId, reason: row.reason ?? "Blocked" }] : [],
  );
  return { ...state, blocked, whollySuccessful: blocked.length === 0 && state.rows.length > 0 };
}

export function canExecute(state: ComposerState): boolean {
  return state.step === "review" && state.planId != null && state.planId !== "" && state.planHash != null && state.planHash !== "";
}

export function attachPlan(state: ComposerState, plan: { planId: string; planHash: string }): ComposerState {
  return { ...state, planId: plan.planId, planHash: plan.planHash };
}

export function editPriorStep(state: ComposerState, step: ComposerStep): ComposerState {
  return { ...state, step, planId: null, planHash: null };
}
