import * as React from "react";
import { cn } from "@/lib/utils";

const WIDTHS = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-none",
} as const;

export type PageFrameWidth = keyof typeof WIDTHS;

export function PageFrame({
  title,
  kicker,
  description,
  actions,
  width = "default",
  className,
  children,
}: {
  title: React.ReactNode;
  kicker?: string;
  description?: string;
  actions?: React.ReactNode;
  width?: PageFrameWidth;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-slot="page-frame"
      data-width={width}
      className={cn("mx-auto w-full px-4 py-6 lg:px-8 lg:py-8", WIDTHS[width], className)}
    >
      <header
        data-slot="page-header"
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0 space-y-1">
          {kicker ? (
            <p className="font-mono text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              {kicker}
            </p>
          ) : null}
          <h1 className="font-heading text-2xl leading-tight font-medium text-foreground lg:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div
            data-slot="page-actions"
            className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"
          >
            {actions}
          </div>
        ) : null}
      </header>
      <div data-slot="page-body" className="space-y-6">
        {children}
      </div>
    </div>
  );
}
