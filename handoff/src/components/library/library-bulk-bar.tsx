"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LibraryArtifact } from "@/lib/library-artifacts";
import { bulkSummary, type BulkAction, type BulkResult } from "@/lib/library-bulk-shared";
import { bulkConfirmCopy, bulkPreview, type BulkCadence } from "./library-bulk-view";

export type BulkConfig = {
  slug: string;
  /** In the Removed list the only action is Put back. */
  removedView: boolean;
  cadence: BulkCadence;
  action: (input: { slug: string; action: string; pieces: { itemId: string; version: number }[] }) => Promise<BulkResult>;
};

export function BulkResultNote({ result, onDismiss }: { result: BulkResult; onDismiss: () => void }) {
  const notable = result.outcomes.filter((outcome) => outcome.state !== "applied" || outcome.note);
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{bulkSummary(result)}</p>
        <Button type="button" size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
      </div>
      {result.scheduleNotes.length > 0 ? (
        <ul className="list-disc pl-5 text-muted-foreground">
          {result.scheduleNotes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      ) : null}
      {notable.length > 0 ? (
        <details open={result.failed > 0}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center underline">
            {notable.length === 1 ? "1 piece needs a note" : `${notable.length} pieces need a note`}
          </summary>
          <ul className="flex flex-col gap-1">
            {notable.map((outcome) => (
              <li key={`${outcome.itemId}:${outcome.version}`}>
                <span className="font-medium">{outcome.title}</span>
                {" · "}
                <span className={outcome.state === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {outcome.state === "failed" ? "Failed" : outcome.state === "skipped" ? "Skipped" : "Done"}
                  {outcome.note ? `: ${outcome.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function LibraryBulkBar({
  config,
  chosen,
  onDone,
  onClear,
}: {
  config: BulkConfig;
  chosen: LibraryArtifact[];
  onDone: (result: BulkResult) => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState<BulkAction | null>(null);
  const [pending, startTransition] = useTransition();
  const count = chosen.length;
  const copy = confirming ? bulkConfirmCopy(confirming, count, bulkPreview(confirming, chosen), config.cadence) : null;

  function run(action: BulkAction) {
    const pieces = chosen.flatMap((artifact) => (artifact.version == null ? [] : [{ itemId: artifact.sourceId, version: artifact.version }]));
    setConfirming(null);
    startTransition(async () => {
      let result: BulkResult;
      try {
        result = await config.action({ slug: config.slug, action, pieces });
      } catch {
        result = { ok: false, action, error: "Nothing was saved. Try again.", outcomes: [], applied: 0, skipped: 0, failed: 0, scheduled: 0, scheduleNotes: [] };
      }
      onDone(result);
    });
  }

  return (
    <>
      <div
        role="region"
        aria-label="Bulk actions"
        className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg"
      >
        <p aria-live="polite" className="text-sm tabular-nums">
          {count === 0 ? "Pick pieces to approve or remove." : count === 1 ? "1 piece selected" : `${count} pieces selected`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {config.removedView ? (
            <Button type="button" disabled={count === 0 || pending} onClick={() => setConfirming("restore")}>
              {pending ? "Saving…" : "Put back selected"}
            </Button>
          ) : (
            <>
              <Button type="button" disabled={count === 0 || pending} onClick={() => setConfirming("approve")}>
                {pending ? "Saving…" : "Approve selected"}
              </Button>
              <Button type="button" variant="destructive" disabled={count === 0 || pending} onClick={() => setConfirming("remove")}>
                Remove selected
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" disabled={count === 0 || pending} onClick={onClear}>
            Clear selection
          </Button>
        </div>
      </div>
      <AlertDialog open={confirming != null} onOpenChange={(open) => { if (!open) setConfirming(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="flex flex-col gap-2">
                {copy?.body.map((line) => <p key={line}>{line}</p>)}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "remove" ? "destructive" : "default"}
              onClick={() => { if (confirming) run(confirming); }}
            >
              {copy?.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
