import * as React from "react";
import Link from "next/link";

import { formatRelative, type DateInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  at?: DateInput;
  title: string;
  body?: string;
  by?: string;
  href?: string;
  dot?: React.ReactNode;
};

function timeValue(value: DateInput): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Left-rail activity list. Pass `now` from the server so the age stays
 * stable for the request.
 */
export function Timeline({
  items,
  now,
  className,
}: {
  items: TimelineItem[];
  now?: DateInput;
  className?: string;
}) {
  return (
    <ol data-slot="timeline" className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const title = item.href ? (
          <Link href={item.href} className="font-medium text-foreground hover:underline">
            {item.title}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{item.title}</span>
        );
        return (
          <li key={item.id} className="flex gap-3">
            <div className="flex w-4 flex-col items-center">
              {item.dot ?? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-optic" aria-hidden />}
              {last ? null : <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
            </div>
            <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-4")}>
              <div className="flex items-baseline justify-between gap-3">
                {title}
                {item.at !== undefined ? (
                  <time
                    dateTime={timeValue(item.at)}
                    className="shrink-0 font-mono text-[11px] text-muted-foreground"
                  >
                    {formatRelative(item.at, now)}
                  </time>
                ) : null}
              </div>
              {item.body ? <p className="mt-0.5 text-sm text-muted-foreground">{item.body}</p> : null}
              {item.by ? (
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{item.by}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
