import * as React from "react";
import { cn } from "@/lib/utils";
import { statusToken, type StatusDomain, type StatusTone } from "@/lib/status-token";

export const TONE_BG: Record<StatusTone, string> = {
  late: "bg-status-late text-status-late-fg",
  blocked: "bg-status-blocked text-status-blocked-fg",
  waiting: "bg-status-waiting text-status-waiting-fg",
  active: "bg-status-active text-status-active-fg",
  complete: "bg-status-complete text-status-complete-fg",
  neutral: "bg-status-neutral text-status-neutral-fg",
};

export function StatusBadge({
  domain,
  value,
  className,
}: {
  domain: StatusDomain;
  value: string;
  className?: string;
}) {
  const token = statusToken(domain, value);
  return (
    <span
      data-slot="status-badge"
      data-tone={token.tone}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-4xl px-2 font-mono text-[11px] font-medium whitespace-nowrap uppercase",
        TONE_BG[token.tone],
        className,
      )}
    >
      {token.label}
    </span>
  );
}
