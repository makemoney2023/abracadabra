"use client";

import * as React from "react";

import { ErrorState } from "@/components/error-state";
import { ExternalLink } from "@/components/external-link";
import { StatusDot } from "@/components/status-dot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { swarmRunHref } from "./swarm-link";

type Phase = "loading" | "live" | "error";

export function SwarmFrame({ origin, executionId }: { origin: string; executionId?: string | null }) {
  const href = swarmRunHref(origin, executionId ?? null) ?? origin;
  const [phase, setPhase] = React.useState<Phase>("loading");
  const [focused, setFocused] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!focused) return;
    document.documentElement.dataset.hqFocus = "true";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocused(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.documentElement.dataset.hqFocus;
      window.removeEventListener("keydown", onKey);
    };
  }, [focused]);

  const status = phase === "live" ? "connected" : phase === "error" ? "error" : "Loading";
  const label = phase === "live" ? "Live" : phase === "error" ? "Error" : "Loading";

  return (
    <div
      className={
        focused ? "fixed inset-0 z-40 flex flex-col gap-3 bg-background p-3" : "flex flex-col gap-3"
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <StatusDot domain="github" value={status} />
        <span className="text-sm text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={focused}
          onClick={() => setFocused((current) => !current)}
        >
          {focused ? "Exit focus" : "Focus"}
        </Button>
        <ExternalLink href={href}>Open</ExternalLink>
      </div>
      <div className="relative min-h-0 flex-1">
        {phase === "error" ? (
          <ErrorState
            title="Swarm did not load."
            detail="Try again, or open it in a new tab."
            onRetry={() => {
              setPhase("loading");
              setAttempt((current) => current + 1);
            }}
          />
        ) : (
          <iframe
            key={attempt}
            title="Swarm"
            src={href}
            className={
              focused
                ? "h-full min-h-0 w-full flex-1 border-0 bg-background"
                : "h-[calc(100svh-12rem)] w-full border-0 bg-background"
            }
            onLoad={() => setPhase("live")}
            onError={() => setPhase("error")}
          />
        )}
        {phase === "loading" ? <Skeleton aria-hidden className="absolute inset-0 h-full min-h-80 w-full" /> : null}
      </div>
    </div>
  );
}
