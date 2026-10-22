"use client";

import { useState } from "react";
import { copyLinkFeedback } from "./library-view";

export function CopyLinkButton({ url, workspaceId }: { url: string; workspaceId?: string }) {
  const [feedback, setFeedback] = useState<{ message: string; showUrl: boolean } | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback(copyLinkFeedback(true));
      if (workspaceId) {
        void fetch(`/api/workspaces/${workspaceId}/library-metrics`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "library_link_copied" }),
        }).catch(() => undefined);
      }
    } catch {
      setFeedback(copyLinkFeedback(false));
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="min-h-11 rounded-md border border-border px-3 text-sm" onClick={() => void copy()}>
        Copy link
      </button>
      <p role="status" aria-live="polite" className="text-sm">{feedback?.message ?? ""}</p>
      {feedback?.showUrl ? <input readOnly value={url} aria-label="Article link" className="w-full break-all text-sm" /> : null}
    </div>
  );
}
