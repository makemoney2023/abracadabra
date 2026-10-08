"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { feedbackAction, type FormState } from "./actions";

const initial: FormState = { message: "" };

function Status({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function ApproveForm({
  slug,
  deliverableId,
  itemId,
  version,
  label,
}: {
  slug: string;
  deliverableId: string;
  itemId: string;
  version: number;
  label: string;
}) {
  const [state, action, pending] = useActionState(feedbackAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="decision" value="approve" />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function ChangesForm({
  slug,
  deliverableId,
  itemId,
  version,
  label = "Ask for changes",
  placeholder = "What should change?",
}: {
  slug: string;
  deliverableId: string;
  itemId: string;
  version: number;
  label?: string;
  placeholder?: string;
}) {
  const [state, action, pending] = useActionState(feedbackAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="decision" value="changes" />
      <Textarea name="body" required maxLength={2000} placeholder={placeholder} aria-label={placeholder} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Sending…" : label}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function NoteForm({
  slug,
  deliverableId,
  version,
}: {
  slug: string;
  deliverableId: string;
  version: number;
}) {
  const [state, action, pending] = useActionState(feedbackAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="decision" value="comment" />
      <Textarea name="body" required maxLength={2000} placeholder="A note for the studio" aria-label="A note for the studio" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Add a note"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function ApproveAllForm({
  slug,
  deliverableId,
  version,
  label = "Approve all",
}: {
  slug: string;
  deliverableId: string;
  version: number;
  label?: string;
}) {
  const [state, action, pending] = useActionState(feedbackAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="deliverableId" value={deliverableId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="decision" value="approve" />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : label}
      </Button>
      <Status message={state.message} />
    </form>
  );
}
