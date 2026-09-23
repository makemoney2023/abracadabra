"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SCAN_CTA } from "@/lib/marketing/copy";

export function ScanForm() {
  const router = useRouter();
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      let data: { token?: string; error?: string; message?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError(res.ok ? "Invalid server response" : `Server error (${res.status})`);
        return;
      }
      if (!res.ok || !data.token) {
        setError(data.message ?? data.error ?? "Could not start scan");
        return;
      }
      router.push(`/scan/${data.token}`);
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor={inputId} className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
          Website URL
        </Label>
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          disabled={pending}
          className="h-12 rounded-md border-border/80 bg-background/80 px-3 text-base shadow-none"
          aria-invalid={error ? true : undefined}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={pending || !url.trim()}
        className="h-12 cursor-pointer rounded-md px-5 text-sm font-medium tracking-wide"
      >
        {pending ? "Starting…" : SCAN_CTA}
      </Button>
      {error ? (
        <p className="basis-full text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
