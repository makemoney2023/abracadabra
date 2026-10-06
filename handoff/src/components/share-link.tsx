"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl border border-border px-4 py-4">
      <p className="text-sm">Share this link. Anyone with it can add files.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={url}
          aria-label="Share link"
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </section>
  );
}
