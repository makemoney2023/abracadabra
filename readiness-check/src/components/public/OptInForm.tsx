"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPT_IN_COPY } from "@/lib/marketing/copy";

export type OptInFormProps = {
  token: string;
  defaultEmail?: string;
};

export function OptInForm({ token, defaultEmail = "" }: OptInFormProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/scans/${token}/opt-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name: name || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not submit opt-in");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <section className="space-y-2 border-t border-border/70 pt-8">
        <h3 className="font-heading text-2xl tracking-tight">{OPT_IN_COPY.doneTitle}</h3>
        <p className="text-sm text-muted-foreground">{OPT_IN_COPY.doneBody}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 border-t border-border/70 pt-8">
      <div className="space-y-1">
        <h3 className="font-heading text-2xl tracking-tight">{OPT_IN_COPY.title}</h3>
        <p className="max-w-xl text-sm text-muted-foreground">{OPT_IN_COPY.body}</p>
      </div>
      <form onSubmit={onSubmit} className="grid max-w-xl gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="optin-email">Email</Label>
          <Input
            id="optin-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            className="h-11"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="optin-name">Name (optional)</Label>
          <Input
            id="optin-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending}
            className="h-11"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-11 cursor-pointer sm:col-span-2 sm:w-fit">
          {pending ? OPT_IN_COPY.pending : OPT_IN_COPY.button}
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
