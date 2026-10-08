"use client";

export function ActivityTime({ ms }: { ms: number }) {
  return (
    <span className="font-mono text-xs text-muted-foreground">
      {new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(ms)}
    </span>
  );
}
