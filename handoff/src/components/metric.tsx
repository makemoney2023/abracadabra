import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/status-token";

const TONE_TEXT: Record<StatusTone, string> = {
  late: "text-status-late",
  blocked: "text-status-blocked",
  waiting: "text-status-waiting",
  active: "text-status-active",
  complete: "text-status-complete",
  neutral: "text-foreground",
};

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: StatusTone;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <p className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={cn(
          "font-heading text-2xl leading-none font-medium tabular-nums lg:text-3xl",
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  const classes = cn(
    "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-card p-4",
    href && "transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
    className,
  );

  if (href) {
    return (
      <Link data-slot="metric" data-tone={tone} href={href} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <div data-slot="metric" data-tone={tone} className={classes}>
      {body}
    </div>
  );
}
