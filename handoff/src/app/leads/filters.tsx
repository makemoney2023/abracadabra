"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Columns3Icon, ListIcon } from "lucide-react";
import { DEAL_STAGES, DEAL_STAGE_LABEL, type DealStage } from "@/db/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { leadsHref, type LeadsView } from "./view";

export function LeadsToolbar({
  view,
  stage,
  owner,
  q,
  sort,
  counts,
  owners,
}: {
  view: LeadsView;
  stage: string;
  owner: string;
  q: string;
  sort?: string;
  counts: Record<DealStage, number>;
  owners: { userId: string; email: string }[];
}) {
  const router = useRouter();
  const shared = { view, owner, q, sort };

  return (
    <div className="flex flex-col gap-3">
      <ToggleGroup type="single" value={stage || "all"} className="max-w-full flex-wrap">
        <ToggleGroupItem value="all" asChild>
          <Link href={leadsHref({ view, owner, q, sort })}>All</Link>
        </ToggleGroupItem>
        {DEAL_STAGES.map((item) => (
          <ToggleGroupItem key={item} value={item} asChild>
            <Link href={leadsHref({ ...shared, stage: item })}>
              {DEAL_STAGE_LABEL[item]}
              <span className="tabular-nums">{counts[item]}</span>
            </Link>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={owner || "all"}
          onValueChange={(value) => {
            router.push(leadsHref({ view, stage, owner: value === "all" ? "" : value, q, sort }));
          }}
        >
          <SelectTrigger aria-label="Owner">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {owners.map((person) => (
              <SelectItem key={person.userId} value={person.userId}>
                {person.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <form action="/leads" className="flex min-w-0 flex-1 items-center gap-2">
          {view === "board" ? <input type="hidden" name="view" value="board" /> : null}
          {stage ? <input type="hidden" name="stage" value={stage} /> : null}
          {owner ? <input type="hidden" name="owner" value={owner} /> : null}
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search leads"
            aria-label="Search leads"
            data-hq-search
            className="max-w-xs"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <ToggleGroup type="single" value={view}>
          <ToggleGroupItem value="list" asChild>
            <Link href={leadsHref({ view: "list", stage, owner, q, sort })} aria-label="List">
              <ListIcon />
              List
            </Link>
          </ToggleGroupItem>
          <ToggleGroupItem value="board" asChild>
            <Link href={leadsHref({ view: "board", stage, owner, q, sort })} aria-label="Board">
              <Columns3Icon />
              Board
            </Link>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
