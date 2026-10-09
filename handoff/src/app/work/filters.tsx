"use client";

import Link from "next/link";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { workHref, type WorkCount } from "./query";

function activeFilter(late: boolean, week: boolean, blocked: boolean): "all" | "late" | "week" | "blocked" {
  if (late && !week && !blocked) return "late";
  if (week && !late && !blocked) return "week";
  if (blocked && !late && !week) return "blocked";
  return "all";
}

export function WorkToolbar({
  late,
  week,
  blocked,
  client,
  project,
  counts,
}: {
  late: boolean;
  week: boolean;
  blocked: boolean;
  client?: string;
  project?: string;
  counts: WorkCount;
}) {
  const scope = { client, project };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <ToggleGroup type="single" value={activeFilter(late, week, blocked)} className="max-w-full flex-wrap">
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
      </ToggleGroup>
    </div>
  );
}
