"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: AcceptState = { message: "" };

export function AcceptForm({ inviteId }: { inviteId: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining" : "Accept invite"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
