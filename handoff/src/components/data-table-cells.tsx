import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelative, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const ABSOLUTE = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Toronto",
  timeZoneName: "short",
});

/** "Oct 22, 2026, 9:24 p.m. EDT". Fixed zone, so server and browser agree. */
export function formatAbsolute(at: number | Date): string {
  return ABSOLUTE.format(at);
}

/** "5m" or "Mar 4" in the cell. The full date and time in a tooltip. */
export function RelativeTime({
  at,
  now,
  className,
}: {
  at: number | null | undefined;
  now: number | Date;
  className?: string;
}) {
  if (at == null || !Number.isFinite(at)) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={new Date(at).toISOString()}
          tabIndex={0}
          data-forward-click
          className={cn(
            "rounded-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            className,
          )}
        >
          {formatRelative(at, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{formatAbsolute(at)}</TooltipContent>
    </Tooltip>
  );
}

/** Initials for an email: `ada.lovelace@x.com` → "AL". */
export function emailInitials(email: string | null | undefined): string {
  const local = email?.split("@")[0]?.replace(/[._+-]+/g, " ").trim() ?? "";
  return local.length > 0 ? initials(local) : "?";
}

/** A small round chip with initials, and the name beside it when given. */
export function PersonChip({
  email,
  initials: given,
  name,
  className,
}: {
  email?: string | null;
  initials?: string;
  /** Text shown beside the chip. Defaults to the email's name part. */
  name?: string | null;
  className?: string;
}) {
  const marks = given || emailInitials(email);
  const text = name === undefined ? (email?.split("@")[0] ?? "") : name;
  if (!email && !given && !name) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar size="sm" title={email ?? undefined}>
        <AvatarFallback className="eyebrow text-[10px]">{marks}</AvatarFallback>
      </Avatar>
      {text ? <span className="truncate">{text}</span> : null}
    </span>
  );
}
