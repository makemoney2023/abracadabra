"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontalIcon } from "lucide-react";
import { toast } from "sonner";
import { DEAL_STAGES, DEAL_STAGE_LABEL, type DealStage } from "@/db/crm";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { moveDealAction, type MoveState } from "./actions";

const initial: MoveState = { message: "", moved: false };

export type BoardDeal = {
  id: string;
  organizationId: string;
  company: string;
  contact: string;
  score: number | null;
  age: string;
  stage: DealStage;
};

function StageMenu({ deal }: { deal: BoardDeal }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function move(stage: DealStage, lostReason: string) {
    const data = new FormData();
    data.set("dealId", deal.id);
    data.set("stage", stage);
    data.set("lostReason", lostReason);
    startTransition(async () => {
      const result = await moveDealAction(initial, data);
      if (result.moved) {
        toast.success("Moved.");
        router.refresh();
        return;
      }
      toast.error(result.message || "Could not move this deal.");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Move ${deal.company}`} disabled={pending}>
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {DEAL_STAGES.filter((stage) => stage !== deal.stage && stage !== "lost").map((stage) => (
          <DropdownMenuItem key={stage} onSelect={() => move(stage, "")}>
            {DEAL_STAGE_LABEL[stage]}
          </DropdownMenuItem>
        ))}
        {deal.stage === "lost" ? null : (
          <>
            <DropdownMenuSeparator />
            <div className="flex flex-col gap-1.5 px-2 py-1.5">
              <label className="text-xs" htmlFor={`lost-${deal.id}`}>
                Lost
              </label>
              <Input
                id={`lost-${deal.id}`}
                value={reason}
                maxLength={500}
                placeholder="Say why"
                onChange={(event) => setReason(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
              <Button size="sm" type="button" disabled={pending} onClick={() => move("lost", reason)}>
                Mark lost
              </Button>
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DealBoard({ deals, stages }: { deals: BoardDeal[]; stages: DealStage[] }) {
  const byStage = new Map<DealStage, BoardDeal[]>();
  for (const stage of stages) byStage.set(stage, []);
  for (const deal of deals) byStage.get(deal.stage)?.push(deal);
  return (
    <ScrollArea className="w-full">
      <div className="flex w-max gap-3 pb-3">
        {stages.map((stage) => {
          const cards = byStage.get(stage) ?? [];
          return (
            <section
              key={stage}
              aria-label={DEAL_STAGE_LABEL[stage]}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2"
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-medium">
                {DEAL_STAGE_LABEL[stage]}
                <span className="tabular-nums text-muted-foreground">{cards.length}</span>
              </h2>
              {cards.map((deal) => (
                <article key={deal.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/clients/${deal.organizationId}`} className="text-sm font-medium">
                        {deal.company}
                      </Link>
                      {deal.contact ? (
                        <p className="truncate text-sm text-muted-foreground">{deal.contact}</p>
                      ) : null}
                    </div>
                    <StageMenu deal={deal} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {deal.score === null ? (
                      <span />
                    ) : (
                      <span className="rounded-4xl bg-muted px-2 py-0.5 font-mono text-[11px] tabular-nums">
                        {deal.score}
                      </span>
                    )}
                    {deal.age ? <span className="text-xs text-muted-foreground">{deal.age}</span> : null}
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </ScrollArea>
  );
}
