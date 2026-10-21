"use client";

import { useState } from "react";

type ViewItem = { resourceKind: "deliverable_item" | "built_work" | "file"; resourceId: string; resourceVersion: number };

export function ViewLinkDialog({ workspaceId, items }: { workspaceId: string; items: ViewItem[] }) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function create(formData: FormData) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/view-links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") ?? ""),
          passcode: String(formData.get("passcode") ?? "") || null,
          allowDownloads: formData.get("allowDownloads") === "on",
          showExternalLinks: formData.get("showExternalLinks") !== "off",
          items,
        }),
      });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) {
        setMessage("Could not create the view link.");
        return;
      }
      setUrl(body.url);
      setMessage("View link ready. Copy it now. It is not shown again.");
    } catch {
      setMessage("Could not create the view link.");
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Copied");
    } catch {
      setMessage("Could not copy");
    }
  }

  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <h2 className="text-sm font-medium">View link</h2>
      <p className="text-sm text-muted-foreground">A view link lets someone look at this work. It does not let them upload.</p>
      <form action={create} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input name="title" className="min-h-11 rounded-md border border-border px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Passcode
          <input name="passcode" type="password" autoComplete="new-password" className="min-h-11 rounded-md border border-border px-3" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="allowDownloads" type="checkbox" />
          Allow downloads
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm" disabled={pending}>
          {pending ? "Creating…" : "Create view link"}
        </button>
      </form>
      {url ? (
        <div className="flex flex-col gap-2">
          <input readOnly value={url} aria-label="View link" className="min-h-11 break-all rounded-md border border-border px-3 text-sm" />
          <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm" onClick={() => void copy()}>
            Copy view link
          </button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </section>
  );
}
