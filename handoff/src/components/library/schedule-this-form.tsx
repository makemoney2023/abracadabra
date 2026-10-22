"use client";

import { useActionState, useState } from "react";

export type ScheduleState = { message: string; confirm: boolean };

const initial: ScheduleState = { message: "", confirm: false };

export function ScheduleThisForm({
  workspaceId,
  fileId,
  platforms,
  action,
}: {
  workspaceId: string;
  fileId: string;
  platforms: { value: string; label: string }[];
  action: (previous: ScheduleState, formData: FormData) => Promise<ScheduleState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initial);
  if (!open) {
    return (
      <button type="button" className="inline-flex min-h-11 items-center text-sm underline" onClick={() => setOpen(true)}>
        Schedule this
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input type="hidden" name="fileId" value={fileId} />
      <p className="text-xs text-muted-foreground">This copies the file. A later change in the Library leaves this piece as it is.</p>
      {platforms.length === 0 ? <p className="text-sm text-muted-foreground">Connect an account before scheduling this.</p> : null}
      <label className="flex flex-col gap-1 text-sm">
        Network
        <select name="channel" className="min-h-11 rounded-md border border-border bg-background px-3" defaultValue={platforms[0]?.value ?? ""}>
          {platforms.map((platform) => (
            <option key={platform.value} value={platform.value}>{platform.label}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Caption
        <textarea name="caption" required rows={3} className="rounded-md border border-border bg-background px-3 py-2" />
      </label>
      {state.confirm ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="confirmAnother" value="yes" />
          Schedule another copy
        </label>
      ) : null}
      {state.message ? <p role="status" className="text-sm text-muted-foreground">{state.message}</p> : null}
      <button type="submit" className="inline-flex min-h-11 items-center text-sm underline" disabled={pending || platforms.length === 0}>
        {pending ? "Scheduling" : "Schedule this"}
      </button>
    </form>
  );
}
