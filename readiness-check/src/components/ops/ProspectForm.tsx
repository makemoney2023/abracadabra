"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function ProspectForm() {
  const [objective, setObjective] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const res = await fetch("/api/ops/prospect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective }),
      });
      const data = (await res.json()) as {
        accepted?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.accepted) {
        setError(data.error ?? "Could not start prospecting");
        return;
      }
      setMessage(data.message ?? "Prospecting started.");
      setObjective("");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <div className="space-y-2">
        <Label htmlFor="prospect-objective">FindAll objective</Label>
        <textarea
          id="prospect-objective"
          required
          minLength={8}
          rows={5}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          disabled={pending}
          placeholder="e.g. Mid-market B2B SaaS companies in the US that sell analytics tools"
          className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Runs asynchronously via Parallel FindAll + enrich, then enqueues an ops
          scan per company. Results show up in the inbox — this may take a few
          minutes.
        </p>
      </div>
      <Button type="submit" disabled={pending || objective.trim().length < 8} className="cursor-pointer">
        {pending ? "Starting…" : "Start prospecting"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
