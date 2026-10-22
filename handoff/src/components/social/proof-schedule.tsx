"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { preparePieceScheduleAction, type ScheduleFormState } from "@/app/w/[slug]/work/schedule-action";

const initial: ScheduleFormState = { message: "" };

/** Staff prepare one plan for this piece. The client only sees that it will go on the calendar. */
export function ProofSchedule({
  staff,
  approved,
  deliverableId,
  itemId,
  version,
  organizationId,
  accounts,
}: {
  staff: boolean;
  approved: boolean;
  deliverableId: string;
  itemId: string;
  version: number;
  organizationId: string;
  accounts: { id: string; label: string }[];
}) {
  if (!approved) return null;
  if (!staff) return <p className="text-sm text-muted-foreground">Approved. It will go on the calendar.</p>;
  return (
    <ScheduleForm
      deliverableId={deliverableId}
      itemId={itemId}
      version={version}
      organizationId={organizationId}
      accounts={accounts}
    />
  );
}

function ScheduleForm({
  deliverableId,
  itemId,
  version,
  organizationId,
  accounts,
}: {
  deliverableId: string;
  itemId: string;
  version: number;
  organizationId: string;
  accounts: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(preparePieceScheduleAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <p className="text-sm font-medium">Schedule this piece</p>
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="version" value={String(version)} />
      <input type="hidden" name="organizationId" value={organizationId} />
      {accounts.length === 0 ? <p className="text-sm text-muted-foreground">Connect an account on Social first.</p> : null}
      <ul className="flex flex-col gap-1 text-sm">
        {accounts.map((account) => (
          <li key={account.id}>
            <label className="inline-flex min-h-11 items-center gap-2">
              <input type="checkbox" name="accountId" value={account.id} />
              {account.label}
            </label>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1 text-sm">
        Time
        <input name="startAt" type="datetime-local" className="min-h-11 rounded-md border border-border bg-background px-3" />
      </label>
      <Button type="submit" size="sm" disabled={pending || accounts.length === 0}>
        {pending ? "Preparing…" : "Prepare the plan"}
      </Button>
      {state.message ? <p role="status" className="text-sm">{state.message}</p> : null}
      {state.rows?.map((row) => (
        <p key={`${row.accountId}-${row.scheduleAt ?? "now"}`} className="text-sm text-muted-foreground">
          {row.platform} · {row.postType} · {row.scheduleAt ?? "now"}
        </p>
      ))}
      <p className="text-sm text-muted-foreground">Nothing is sent until that plan is executed.</p>
    </form>
  );
}
