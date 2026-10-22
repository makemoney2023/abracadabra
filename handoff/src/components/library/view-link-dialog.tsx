"use client";

import { useState } from "react";

type ViewItem = { resourceKind: "deliverable_item" | "built_work" | "file"; resourceId: string; resourceVersion: number };
type ShareSummary = { id: string; title: string | null; expiresAt: number | null; revokedAt: number | null };

const EXPIRY = [
  { value: "", label: "No expiry" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
];

export function ViewLinkDialog({
  workspaceId,
  items,
  shares = [],
}: {
  workspaceId: string;
  items: ViewItem[];
  shares?: ShareSummary[];
}) {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [created, setCreated] = useState<ShareSummary[]>([]);
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const live = [...shares, ...created].filter((share) => share.revokedAt == null && !gone[share.id]);

  async function create(formData: FormData) {
    setPending(true);
    setMessage("");
    const days = Number(formData.get("expiry") ?? 0);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/view-links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: String(formData.get("title") ?? ""),
          passcode: String(formData.get("passcode") ?? "") || null,
          allowDownloads: formData.get("allowDownloads") === "on",
          showExternalLinks: formData.get("showExternalLinks") === "on",
          expiresAt: days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null,
          items,
        }),
      });
      const body = (await response.json()) as { url?: string; id?: string; error?: string };
      if (!response.ok || !body.url) {
        setMessage("Could not create the view link.");
        return;
      }
      setUrl(body.url);
      if (body.id) setCreated((current) => [...current, { id: body.id ?? "", title: String(formData.get("title") ?? "") || null, expiresAt: days > 0 ? Date.now() + days * 24 * 60 * 60 * 1000 : null, revokedAt: null }]);
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

  async function revoke(shareId: string) {
    setMessage("");
    const response = await fetch(`/api/workspaces/${workspaceId}/view-links/${shareId}`, { method: "DELETE" });
    setMessage(response.ok ? "View link revoked." : "Could not revoke the view link.");
    if (response.ok) setGone((current) => ({ ...current, [shareId]: true }));
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-medium">View link</h2>
      <p className="text-sm text-muted-foreground">A view link lets someone look at the selected work. It does not let them upload.</p>
      <form action={create} className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input name="title" className="min-h-11 rounded-md border border-border bg-background px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Expiry
          <select name="expiry" defaultValue="7" className="min-h-11 rounded-md border border-border bg-background px-3">
            {EXPIRY.map((option) => (
              <option key={option.label} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          Passcode
          <input name="passcode" type="password" autoComplete="new-password" className="min-h-11 rounded-md border border-border bg-background px-3" />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="allowDownloads" type="checkbox" />
          Allow downloads
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input name="showExternalLinks" type="checkbox" defaultChecked />
          Show article and site links
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-3 text-sm text-primary-foreground sm:col-span-2" disabled={pending || items.length === 0}>
          {pending ? "Creating…" : items.length === 0 ? "Select work first" : `Create view link (${items.length})`}
        </button>
      </form>
      {url ? (
        <div className="flex flex-col gap-2">
          <input readOnly value={url} aria-label="View link" className="min-h-11 break-all rounded-md border border-border bg-background px-3 text-sm" />
          <button type="button" className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm" onClick={() => void copy()}>
            Copy view link
          </button>
        </div>
      ) : null}
      {live.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {live.map((share) => (
            <li key={share.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{share.title || "Untitled view link"}{share.expiresAt ? ` · expires ${new Date(share.expiresAt).toLocaleDateString("en-CA")}` : ""}</span>
              <button type="button" className="inline-flex min-h-11 items-center underline" onClick={() => void revoke(share.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </section>
  );
}
