"use client";

import Link from "next/link";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { workHref, type WorkCount } from "./query";

function activeFilter(late: boolean, week: boolean, blocked: boolean, review: boolean): "all" | "late" | "week" | "blocked" | "review" {
  const on = [late, week, blocked, review].filter(Boolean).length;
  if (on !== 1) return "all";
  if (late) return "late";
  if (week) return "week";
  if (blocked) return "blocked";
  return "review";
}

export function WorkToolbar({
  late,
  week,
  blocked,
  review = false,
  client,
  project,
  agent,
  counts,
}: {
  late: boolean;
  week: boolean;
  blocked: boolean;
  review?: boolean;
  client?: string;
  project?: string;
  agent?: string;
  counts: WorkCount;
}) {
  const scope = { client, project, agent };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <ToggleGroup type="single" value={activeFilter(late, week, blocked, review)} className="max-w-full flex-wrap">
        <ToggleGroupItem value="all" asChild>
          <Link href={workHref(scope)}>
            All
            <span className="tabular-nums">{counts.all}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="late" asChild>
          <Link href={workHref({ ...scope, late: true })}>
            Late
            <span className="tabular-nums">{counts.late}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="week" asChild>
          <Link href={workHref({ ...scope, week: true })}>
            This week
            <span className="tabular-nums">{counts.thisWeek}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="blocked" asChild>
          <Link href={workHref({ ...scope, blocked: true })}>
            Blocked
            <span className="tabular-nums">{counts.blocked}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="review" asChild>
          <Link href={workHref({ ...scope, review: true })}>
            Waiting on Client Services
            <span className="tabular-nums">{counts.review}</span>
          </Link>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
