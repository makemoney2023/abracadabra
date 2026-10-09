import * as React from "react";

import { cn } from "@/lib/utils";

/** A link that leaves HQ. The arrow and the screen-reader text travel together. */
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-slot="external-link"
      className={cn("inline-flex items-center gap-1 underline-offset-4 hover:underline", className)}
    >
      {children}
      <span aria-hidden>↗</span>
      <span className="sr-only">opens in new tab</span>
    </a>
  );
}
