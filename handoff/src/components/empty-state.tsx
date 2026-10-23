import * as React from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * The one empty state for every HQ list. Plain words, one next step.
 * Built on the shadcn `Empty` pieces.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Empty
      data-slot="empty-state"
      className={cn("rounded-lg border border-dashed border-border py-12", className)}
    >
      <EmptyHeader>
        {icon ? (
          <EmptyMedia variant="icon" aria-hidden>
            {icon}
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-base">{title}</EmptyTitle>
        {body ? <EmptyDescription>{body}</EmptyDescription> : null}
      </EmptyHeader>
      {action ? <EmptyContent className="flex-row justify-center">{action}</EmptyContent> : null}
    </Empty>
  );
}
