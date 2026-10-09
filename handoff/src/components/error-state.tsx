"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown when a page or panel fails to load. Says what broke in plain words
 * and gives one way out: retry, or go somewhere that works.
 */
export function ErrorState({
  title = "Something went wrong.",
  detail,
  onRetry,
  href,
  hrefLabel = "Go back",
  className,
}: {
  title?: string;
  detail?: string;
  onRetry?: () => void;
  href?: string;
  hrefLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-status-late/40 bg-status-late/5 px-6 py-12 text-center",
        className,
      )}
    >
      <div
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-status-late/15 text-status-late"
      >
        <AlertTriangleIcon className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="font-heading text-base font-medium text-foreground">{title}</p>
        {detail ? (
          <p className="mx-auto max-w-sm font-mono text-xs break-words text-muted-foreground">
            {detail}
          </p>
        ) : null}
      </div>
      {onRetry || href ? (
        <div className="flex items-center gap-2">
          {onRetry ? (
            <Button type="button" size="sm" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
          {href ? (
            <Button asChild size="sm" variant={onRetry ? "ghost" : "outline"}>
              <Link href={href}>{hrefLabel}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
