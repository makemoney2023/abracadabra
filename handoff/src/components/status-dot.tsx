import * as React from "react";
import { cn } from "@/lib/utils";
import { statusToken, type StatusDomain } from "@/lib/status-token";
import { TONE_BG } from "@/components/status-badge";

export function StatusDot({
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
      data-slot="status-dot"
      data-tone={token.tone}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", TONE_BG[token.tone])}
      />
      <span className="sr-only">{token.label}</span>
    </span>
  );
}
