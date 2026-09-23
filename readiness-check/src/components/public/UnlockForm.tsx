"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UNLOCK_COPY } from "@/lib/marketing/copy";

export type UnlockFormProps = {
  token: string;
  onUnlocked: () => void;
};

export function UnlockForm({ token, onUnlocked }: UnlockFormProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/scans/${token}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { unlocked?: boolean; error?: string };
      if (!res.ok || !data.unlocked) {
        setError(data.error ?? "Could not unlock report");
        return;
      }
      onUnlocked();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <section id="unlock" className="space-y-4 border-t border-border/70 pt-8">
      <div className="space-y-1">
        <h3 className="font-heading text-2xl tracking-tight">{UNLOCK_COPY.title}</h3>
        <p className="max-w-xl text-sm text-muted-foreground">{UNLOCK_COPY.body}</p>
      </div>
      <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-2">
          <Label htmlFor="unlock-email">Work email</Label>
          <Input
            id="unlock-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="h-11"
            aria-invalid={error ? true : undefined}
          />
        </div>
        <Button type="submit" disabled={pending} className="h-11 cursor-pointer">
          {pending ? UNLOCK_COPY.pending : UNLOCK_COPY.button}
        </Button>
      </form>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
