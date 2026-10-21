"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  composerReview,
  editPriorStep,
  selectAllEligible,
  startComposer,
  canExecute,
  type ComposerPiece,
  type ComposerStep,
} from "./publishing-composer-state";

const STEPS: ComposerStep[] = ["content", "destinations", "timing", "review"];

/** Review beside the staff send form. It never attaches a plan, so it never posts. */
export function PublishingComposer({
  pieces,
  accounts,
}: {
  pieces: ComposerPiece[];
  accounts: { id: string; label: string }[];
}) {
  const [state, setState] = React.useState(() => startComposer(pieces, accounts.map((account) => account.id)));
  const rows = state.pieceIds.flatMap((itemId) => {
    const piece = state.pieces.find((item) => item.id === itemId);
    return state.accountIds.map((accountId) => ({
      itemId,
      accountId,
      postType: piece?.postType ?? "feed",
      blocked: !(piece?.approved && piece.compatible),
      reason: piece?.compatible ? "Not approved" : "Not a social piece",
    }));
  });
  const review = composerReview({ ...state, rows });
  const executable = canExecute(state);
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <p className="text-sm font-medium">Review eligible pieces</p>
      <p className="text-sm text-muted-foreground">Sending still uses the form below. This review does not post.</p>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((step) => (
          <Button
            key={step}
            type="button"
            size="sm"
            variant={state.step === step ? "default" : "outline"}
            onClick={() => setState((current) => (step === "review" ? { ...current, step } : editPriorStep(current, step)))}
          >
            {step}
          </Button>
        ))}
      </div>
      {state.step === "content" ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setState((current) => editPriorStep({ ...current, pieceIds: selectAllEligible(current.pieces) }, "content"))}
          >
            Select all eligible
          </Button>
          {state.pieces.map((piece) => (
            <label key={piece.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.pieceIds.includes(piece.id)}
                onChange={(event) =>
                  setState((current) =>
                    editPriorStep(
                      {
                        ...current,
                        pieceIds: event.target.checked
                          ? [...current.pieceIds, piece.id]
                          : current.pieceIds.filter((id) => id !== piece.id),
                      },
                      "content",
                    ),
                  )
                }
              />
              {piece.title}
              {piece.approved && piece.compatible ? null : <span className="text-muted-foreground">Not eligible</span>}
            </label>
          ))}
        </div>
      ) : null}
      {state.step === "destinations" ? (
        <ul className="flex flex-col gap-1 text-sm">
          {accounts.map((account) => (
            <li key={account.id}>{account.label}</li>
          ))}
        </ul>
      ) : null}
      {state.step === "timing" ? (
        <p className="text-sm text-muted-foreground">Pick the time on the form below. This review does not choose a slot.</p>
      ) : null}
      {state.step === "review" ? (
        <ul className="flex flex-col gap-1 text-sm">
          {review.rows.map((row) => (
            <li key={`${row.itemId}-${row.accountId}`}>
              {row.itemId} · {row.accountId}
              {row.blocked ? ` · ${row.reason ?? "Blocked"}` : ""}
            </li>
          ))}
          {review.rows.length === 0 ? <li>Nothing eligible is selected.</li> : null}
        </ul>
      ) : null}
      <Button type="button" disabled={!executable}>
        Execute plan
      </Button>
    </div>
  );
}
