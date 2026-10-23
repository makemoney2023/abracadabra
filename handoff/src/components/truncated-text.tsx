"use client";

import * as React from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One line of text that ends in an ellipsis. The tooltip shows the full text,
 * and only when it was actually cut off.
 */
export function TruncatedText({
  children,
  className,
  maxWidth = "20rem",
}: {
  children: string;
  className?: string;
  /** Any CSS width, for example `16rem`. */
  maxWidth?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [open, setOpen] = React.useState(false);

  return (
    <TooltipProvider>
      <Tooltip
        open={open}
        onOpenChange={(next) => {
          const el = ref.current;
          setOpen(next && el !== null && el.scrollWidth > el.clientWidth);
        }}
      >
        <TooltipTrigger asChild>
          <span
            ref={ref}
            tabIndex={0}
            data-forward-click
            style={{ maxWidth }}
            className={cn(
              "block truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              className,
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-normal break-words">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
