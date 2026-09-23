"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

function OpsLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/ops";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setPending(true);
    try {
      const supabase = createClient();
      if (mode === "password") {
        const { error: signError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signError) {
          setError(signError.message);
          return;
        }
        router.replace(next);
        router.refresh();
        return;
      }

      const origin = window.location.origin;
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${origin}/ops` },
      });
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setMessage("Check your email for the magic link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="font-heading text-2xl tracking-tight">Ops login</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff only. Requires a `staff_profiles` row with role `ops`.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ops-email">Email</Label>
          <Input
            id="ops-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
          />
        </div>

        {mode === "password" ? (
          <div className="space-y-2">
            <Label htmlFor="ops-password">Password</Label>
            <Input
              id="ops-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
            />
          </div>
        ) : null}

        <Button type="submit" disabled={pending} className="w-full cursor-pointer">
          {pending
            ? "Working…"
            : mode === "password"
              ? "Sign in"
              : "Send magic link"}
        </Button>
      </form>

      <button
        type="button"
        className="cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() =>
          setMode((m) => (m === "password" ? "magic" : "password"))
        }
      >
        {mode === "password" ? "Use magic link instead" : "Use password instead"}
      </button>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export default function OpsLoginPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <OpsLoginForm />
    </Suspense>
  );
}
