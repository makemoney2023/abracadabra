"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { decideRequestAction, replyToThreadAction, type FormState } from "./actions";

const initial: FormState = { message: "" };

function Status({ message }: { message: string }) {
  if (!message) return null;
  return <p role="status" className="text-sm text-muted-foreground">{message}</p>;
}

export function RequestDecisionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(decideRequestAction, initial);
  return (
    <form action={action} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="kind" placeholder="Piece type, such as page" aria-label="Piece type" />
      <Input name="outcome" placeholder="What it should achieve" aria-label="Outcome" />
      <Textarea name="body" placeholder="Reason, if you are declining" aria-label="Decline reason" />
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approved" size="sm" disabled={pending}>Approve</Button>
        <Button type="submit" name="decision" value="declined" size="sm" variant="outline" disabled={pending}>Decline</Button>
      </div>
      <Status message={state.message} />
    </form>
  );
}

export function ThreadReplyForm({
  organizationId,
  threadId,
  channel,
  sender,
}: {
  organizationId: string;
  threadId: string;
  channel: string;
  sender: string;
}) {
  const [state, action, pending] = useActionState(replyToThreadAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="threadId" value={threadId} />
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="sender" value={sender} />
      <Textarea name="body" required maxLength={2000} placeholder="Reply as yourself" aria-label="Reply" />
      <Button type="submit" size="sm" disabled={pending}>{pending ? "Sending…" : "Reply"}</Button>
      <Status message={state.message} />
    </form>
  );
}
