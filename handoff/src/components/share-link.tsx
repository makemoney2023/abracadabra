"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareLink({ url }: { url: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border px-4 py-4">
      <p className="text-sm">Anyone with this upload link can add files.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Upload link"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copyStatus === "copied" ? "Copied" : "Copy upload link"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">
        {copyStatus === "copied" ? "Upload link copied." : copyStatus === "failed" ? "Could not copy. Select the link and copy it manually." : ""}
      </p>
    </section>
  );
}
