"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function HeldReview({
  file,
}: {
  file: {
    id: string;
    relativePath: string;
    scanReason: string | null;
    workspaceName: string;
    workspaceSlug: string;
  };
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function send(action: "release" | "reject") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/held/${file.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = (await response.json()) as { message?: string; status?: string };
      if (!response.ok) {
        setMessage(body.message ?? "You can't do that.");
        return;
      }
      setMessage(body.status === "clean" ? "Released." : "Rejected.");
      router.refresh();
    } catch {
      setMessage("We couldn't save that. Please try again in a bit.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <p className="text-sm">
        <span className="font-medium">{file.workspaceName}</span>
        <span className="ml-2 font-mono text-xs text-muted-foreground">{file.workspaceSlug}</span>
      </p>
      <p className="font-mono text-sm">{file.relativePath}</p>
      {file.scanReason ? <p className="text-sm text-muted-foreground">{file.scanReason}</p> : null}
      <label className="flex flex-col gap-1 text-sm" htmlFor={`reason-${file.id}`}>
        Reason
        <Textarea
          id={`reason-${file.id}`}
          name="reason"
          required
          maxLength={2000}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={() => void send("release")}>
          Release
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => void send("reject")}>
          Reject
        </Button>
      </div>
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </form>
  );
}
