"use client";

import { useActionState } from "react";
import {
  addNoteAction,
  createContactAction,
  createTaskAction,
  logCallAction,
  mergeClientAction,
  type FormState,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: FormState = { message: "" };

const fieldClass = "min-h-24 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Status({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {message}
    </p>
  );
}

export function PersonForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createContactAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="person-name">
        Name
        <Input id="person-name" name="name" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="person-email">
        Email
        <Input id="person-email" name="email" type="email" maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="person-phone">
        Phone
        <Input id="person-phone" name="phone" maxLength={40} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="person-title">
        Job title
        <Input id="person-title" name="title" maxLength={120} />
      </label>
      <label className="flex items-center gap-2 text-sm" htmlFor="person-primary">
        <input id="person-primary" name="primary" type="checkbox" value="1" />
        Main contact
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a person"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function NoteForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(addNoteAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="note-body">
        Add a note
        <textarea id="note-body" name="body" required maxLength={2000} className={fieldClass} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a note"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function CallForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(logCallAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="call-body">
        What happened
        <textarea id="call-body" name="body" required maxLength={2000} className={fieldClass} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Log a call"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function TaskForm({ organizationId }: { organizationId: string }) {
  const [state, action, pending] = useActionState(createTaskAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="task-title">
        Add a task
        <Input id="task-title" name="title" required maxLength={200} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a task"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}

export function MergeForm({
  keepId,
  others,
}: {
  keepId: string;
  others: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(mergeClientAction, initial);
  if (others.length === 0) return null;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="keepId" value={keepId} />
      <p className="text-sm text-muted-foreground">
        Merge another client into this one. This client stays. The other one is closed.
      </p>
      <label className="flex flex-col gap-1 text-sm" htmlFor="merge-drop">
        Merge
        <select
          id="merge-drop"
          name="dropId"
          required
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          defaultValue={others[0]?.id ?? ""}
        >
          {others.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Merging" : "Merge"}
      </Button>
      <Status message={state.message} />
    </form>
  );
}
