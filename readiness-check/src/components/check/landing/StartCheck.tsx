"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { config } from "@/lib/assessment/config";

export function StartCheck() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      for (const [key, value] of params) {
        if (key.startsWith("utm_")) utm[key] = value;
      }
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ utm }),
      });
      const data = (await res.json()) as { token?: string; error?: string; message?: string };
      if (!res.ok || !data.token) {
        setError(data.message ?? data.error ?? "Could not start the check.");
        return;
      }
      router.push(`/check/${data.token}`);
    } catch {
      setError("Could not start the check.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={pending}
        className="studio-cta-primary"
      >
        {pending ? "Starting…" : config.copy.start}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
