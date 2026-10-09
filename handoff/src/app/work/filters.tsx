"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  group,
  counts,
}: {
  late: boolean;
  week: boolean;
  blocked: boolean;
  group: "person" | "client";
  counts: WorkCount;
}) {
  const router = useRouter();
  const filters = { late, week, blocked, group };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <ToggleGroup type="single" value={activeFilter(late, week, blocked)} className="max-w-full flex-wrap">
        <ToggleGroupItem value="all" asChild>
          <Link href={workHref({ group })}>
            All
            <span className="tabular-nums">{counts.all}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="late" asChild>
          <Link href={workHref({ ...filters, late: true, week: false, blocked: false })}>
            Late
            <span className="tabular-nums">{counts.late}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="week" asChild>
          <Link href={workHref({ ...filters, late: false, week: true, blocked: false })}>
            This week
            <span className="tabular-nums">{counts.thisWeek}</span>
          </Link>
        </ToggleGroupItem>
        <ToggleGroupItem value="blocked" asChild>
          <Link href={workHref({ ...filters, late: false, week: false, blocked: true })}>
            Blocked
            <span className="tabular-nums">{counts.blocked}</span>
          </Link>
        </ToggleGroupItem>
      </ToggleGroup>
      <Select
        value={group}
        onValueChange={(value) => {
          router.push(workHref({ late, week, blocked, group: value === "client" ? "client" : "person" }));
        }}
      >
        <SelectTrigger aria-label="Group by">
          <SelectValue placeholder="Person" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="person">Person</SelectItem>
          <SelectItem value="client">Client</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
