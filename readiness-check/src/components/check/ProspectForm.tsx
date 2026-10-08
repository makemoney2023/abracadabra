"use client";

import { useState } from "react";

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
      let data: { accepted?: boolean; message?: string; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError(res.ok ? "Invalid server response" : `Server error (${res.status})`);
        return;
      }
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
    <form onSubmit={onSubmit} className="studio-panel space-y-4 p-5">
      <div className="space-y-2">
        <label htmlFor="prospect-objective" className="studio-kicker">
          Sites to check
        </label>
        <textarea
          id="prospect-objective"
          required
          minLength={8}
          rows={5}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          disabled={pending}
          placeholder="Check https://acme.example and northwind.example."
          className="studio-field min-h-36"
        />
        <p className="text-sm text-muted-foreground">
          A site that needs us becomes a lead. A site that is already covered is left alone.
        </p>
      </div>
      <button type="submit" disabled={pending || objective.trim().length < 8} className="studio-cta-primary">
        {pending ? "Starting…" : "Start prospecting"}
      </button>
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
