"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RetentionControls({
  slug,
  status,
  purgeOn,
  canArchive,
  canExport,
  canPurge,
}: {
  slug: string;
  status: string;
  purgeOn: string | null;
  canArchive: boolean;
  canExport: boolean;
  canPurge: boolean;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function archive() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${slug}/archive`, { method: "POST" });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "You can't do that.");
        return;
      }
      setMessage("Archived.");
      router.refresh();
    } catch {
      setMessage("We couldn't archive this space. Please try again in a bit.");
    } finally {
      setPending(false);
    }
  }

  async function downloadExport() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${slug}/export`);
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setMessage(body.message ?? "You can't do that.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${slug}-handoff.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Export ready.");
    } catch {
      setMessage("We couldn't make the export. Please try again in a bit.");
    } finally {
      setPending(false);
    }
  }

  async function purge() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${slug}/purge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "You can't do that.");
        return;
      }
      setMessage("Deleted.");
      router.refresh();
    } catch {
      setMessage("We couldn't delete this space. Please try again in a bit.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "archived" && purgeOn ? (
        <p className="text-sm text-muted-foreground">Everything will be deleted on {purgeOn}. You can still download files until then.</p>
      ) : null}
      {status === "purged" ? <p className="text-sm text-muted-foreground">This space has been deleted.</p> : null}
      {status === "active" && canArchive ? (
        <Button type="button" disabled={pending} onClick={() => void archive()}>
          Archive this workspace
        </Button>
      ) : null}
      {canExport ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => void downloadExport()}>
          Export a list of files
        </Button>
      ) : null}
      {canPurge && status === "archived" ? (
        <label className="flex flex-col gap-1 text-sm" htmlFor="purge-reason">
          Why are you deleting it?
          <textarea
            id="purge-reason"
            className="min-h-24 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <Button type="button" disabled={pending} onClick={() => void purge()}>
            Delete everything
          </Button>
        </label>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
