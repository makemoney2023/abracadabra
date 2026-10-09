"use client";

import { formatRelative } from "@/lib/format";

const FULL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function ActivityTime({ ms }: { ms: number }) {
  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={FULL.format(ms)}
      suppressHydrationWarning
      className="font-mono text-xs text-muted-foreground"
    >
      {formatRelative(ms)}
    </time>
  );
}
