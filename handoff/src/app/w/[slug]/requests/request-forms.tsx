"use client";

import { useActionState } from "react";
import { FILE_TAGS } from "@/lib/policy/limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  closeRequestAction,
  createRequestAction,
  reopenRequestAction,
  updateRequestAction,
  type RequestState,
} from "./actions";

const initial: RequestState = { message: "" };

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm";

function TagSelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <select id={id} name="suggestedTag" className={selectClass} defaultValue={defaultValue}>
      <option value="">No label</option>
      {FILE_TAGS.map((tag) => (
        <option key={tag} value={tag}>
          {tag}
        </option>
      ))}
    </select>
  );
}

export function CreateRequestForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(createRequestAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="request-title">
        Name of the request
        <Input id="request-title" name="title" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="request-guidance">
        What should they send?
        <textarea
          id="request-guidance"
          name="guidance"
          maxLength={2000}
          rows={3}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="request-tag">
        Label to use
        <TagSelect id="request-tag" defaultValue="" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="request-due">
        Due date
        <Input id="request-due" name="dueOn" type="date" />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Add request"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function EditRequestForm({
  slug,
  requestId,
  title,
  guidance,
  suggestedTag,
  dueOn,
}: {
  slug: string;
  requestId: string;
  title: string;
  guidance: string;
  suggestedTag: string;
  dueOn: string;
}) {
  const [state, action, pending] = useActionState(updateRequestAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="requestId" value={requestId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor={`title-${requestId}`}>
        Name of the request
        <Input id={`title-${requestId}`} name="title" required maxLength={200} defaultValue={title} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`guidance-${requestId}`}>
        What should they send?
        <textarea
          id={`guidance-${requestId}`}
          name="guidance"
          maxLength={2000}
          rows={3}
          defaultValue={guidance}
          className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`tag-${requestId}`}>
        Label to use
        <TagSelect id={`tag-${requestId}`} defaultValue={suggestedTag} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor={`due-${requestId}`}>
        Due date
        <Input id={`due-${requestId}`} name="dueOn" type="date" defaultValue={dueOn} />
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function CloseRequestForm({ slug, requestId }: { slug: string; requestId: string }) {
  const [state, action, pending] = useActionState(closeRequestAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Closing..." : "Close"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function ReopenRequestForm({ slug, requestId }: { slug: string; requestId: string }) {
  const [state, action, pending] = useActionState(reopenRequestAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Reopening..." : "Reopen"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
