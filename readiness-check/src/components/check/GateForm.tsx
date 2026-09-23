"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/lib/assessment/config";

export function GateForm({
  token,
  bandLabel,
}: {
  token: string;
  bandLabel: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${token}/opt-in`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name: name.trim() || undefined }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Could not send the report. Try again.");
        return;
      }
      router.refresh();
      window.location.assign(`/check/${token}`);
    } catch {
      setError("Could not send the report. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-5">
      <div className="space-y-2">
        <h1 className="font-heading text-4xl tracking-tight">{config.copy.gateHeadline}</h1>
        <p className="text-muted-foreground">{config.copy.gatePrompt}</p>
        <p className="text-sm text-muted-foreground" aria-hidden>
          {bandLabel}
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="gate-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="gate-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="gate-name" className="text-sm font-medium">
          Name <span className="text-muted-foreground">(optional)</span>
        </label>
        <input
          id="gate-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground min-h-11 w-full cursor-pointer rounded-md px-4 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Sending…" : "Show my results"}
      </button>
      <p className="text-xs text-muted-foreground">{config.copy.consent}</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
