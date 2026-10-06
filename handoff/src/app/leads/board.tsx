"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { DEAL_STAGES, DEAL_STAGE_LABEL, type DealCard, type DealStage } from "@/db/crm";
import { Button } from "@/components/ui/button";
import { moveDealAction, type MoveState } from "./actions";

const initial: MoveState = { message: "", moved: false };

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function DealCardForm({ deal }: { deal: DealCard }) {
  const [state, action, pending] = useActionState(moveDealAction, initial);
  const router = useRouter();
  useEffect(() => {
    if (state.moved) router.refresh();
  }, [state, router]);
  return (
    <article
      id={`deal-${deal.id}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", deal.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
    >
      <div>
        <Link href={`/clients/${deal.organization_id}`} className="text-sm font-medium">
          {deal.organization_name}
        </Link>
        <p className="text-sm">{deal.title}</p>
        <p className="text-xs text-muted-foreground">{deal.source}</p>
        <p className="text-xs text-muted-foreground">
          {deal.score === null ? "No score yet." : `Score ${deal.score}`}
        </p>
        <p className="text-xs text-muted-foreground">{deal.next_step?.trim() ? deal.next_step : "No next step."}</p>
        <p className="text-xs text-muted-foreground">
          {deal.last_touch === null ? "No touch yet." : `Last touch ${day(deal.last_touch)}`}
        </p>
      </div>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="dealId" value={deal.id} />
        <label className="flex flex-col gap-1 text-xs" htmlFor={`stage-${deal.id}`}>
          Stage
          <select
            id={`stage-${deal.id}`}
            name="stage"
            defaultValue={deal.stage}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            {DEAL_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {DEAL_STAGE_LABEL[stage]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs" htmlFor={`lost-${deal.id}`}>
          If lost, say why
          <input
            id={`lost-${deal.id}`}
            name="lostReason"
            maxLength={500}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          />
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Moving" : "Move"}
        </Button>
        {state.message ? (
          <p role="status" className="text-xs text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}

export function DealBoard({ deals, view }: { deals: DealCard[]; view: "board" | "list" }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const byStage = new Map<DealStage, DealCard[]>();
  for (const stage of DEAL_STAGES) byStage.set(stage, []);
  for (const deal of deals) byStage.get(deal.stage)?.push(deal);

  function dropOn(event: DragEvent<HTMLElement>, stage: DealStage) {
    event.preventDefault();
    const dealId = event.dataTransfer.getData("text/plain");
    if (!dealId) return;
    const reason = document.getElementById(`lost-${dealId}`);
    const data = new FormData();
    data.set("dealId", dealId);
    data.set("stage", stage);
    data.set("lostReason", reason instanceof HTMLInputElement ? reason.value : "");
    startTransition(async () => {
      const result = await moveDealAction(initial, data);
      setNotice(result.message);
      if (result.moved) router.refresh();
    });
  }

  if (view === "list") {
    return (
      <div className="flex flex-col gap-3">
        {notice ? <p role="status" className="text-sm">{notice}</p> : null}
        {pending ? <p className="text-sm text-muted-foreground">Moving</p> : null}
        <ul className="flex flex-col gap-3">
          {deals.map((deal) => (
            <li key={deal.id}>
              <DealCardForm deal={deal} />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notice ? <p role="status" className="text-sm">{notice}</p> : null}
      {pending ? <p className="text-sm text-muted-foreground">Moving</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {DEAL_STAGES.map((stage) => (
          <section
            key={stage}
            aria-label={DEAL_STAGE_LABEL[stage]}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => dropOn(event, stage)}
            className="flex w-64 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-2"
          >
            <h2 className="px-1 text-sm font-medium">{DEAL_STAGE_LABEL[stage]}</h2>
            {(byStage.get(stage) ?? []).map((deal) => (
              <DealCardForm key={deal.id} deal={deal} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
