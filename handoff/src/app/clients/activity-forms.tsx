"use client";

import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  addNoteAction,
  createContactAction,
  createTaskAction,
  logCallAction,
  mergeClientAction,
} from "./actions";

const selectClass = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function PersonForm({ organizationId }: { organizationId: string }) {
  return (
    <FormDrawer
      title="Add a person"
      description="A person who works at this company."
      trigger={
        <Button variant="outline" size="sm">
          Add a person
        </Button>
      }
    >
      <ActionForm action={createContactAction} submitLabel="Add a person" pendingLabel="Adding">
        <input type="hidden" name="organizationId" value={organizationId} />
        <ActionField name="name" label="Name">
          <Input name="name" required maxLength={200} />
        </ActionField>
        <ActionField name="email" label="Email">
          <Input name="email" type="email" maxLength={200} />
        </ActionField>
        <ActionField name="phone" label="Phone">
          <Input name="phone" maxLength={40} />
        </ActionField>
        <ActionField name="title" label="Job title">
          <Input name="title" maxLength={120} />
        </ActionField>
        <label className="flex items-center gap-2 text-sm" htmlFor={`person-primary-${organizationId}`}>
          <input id={`person-primary-${organizationId}`} name="primary" type="checkbox" value="1" />
          Main contact
        </label>
      </ActionForm>
    </FormDrawer>
  );
}

export function NoteForm({ organizationId }: { organizationId: string }) {
  return (
    <FormDrawer
      title="Add a note"
      description="A note stays on this client's activity."
      trigger={
        <Button variant="outline" size="sm">
          Add a note
        </Button>
      }
    >
      <ActionForm action={addNoteAction} submitLabel="Add a note" pendingLabel="Adding">
        <input type="hidden" name="organizationId" value={organizationId} />
        <ActionField name="body" label="Note">
          <Textarea name="body" required maxLength={2000} />
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}

export function CallForm({ organizationId }: { organizationId: string }) {
  return (
    <FormDrawer
      title="Log a call"
      description="What you talked about."
      trigger={
        <Button variant="outline" size="sm">
          Log a call
        </Button>
      }
    >
      <ActionForm action={logCallAction} submitLabel="Log a call" pendingLabel="Saving">
        <input type="hidden" name="organizationId" value={organizationId} />
        <ActionField name="body" label="What happened">
          <Textarea name="body" required maxLength={2000} />
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}

export function TaskForm({
  organizationId,
  label = "New task",
  variant = "default",
}: {
  organizationId: string;
  label?: string;
  variant?: "default" | "outline";
}) {
  return (
    <FormDrawer
      title="New task"
      description="Work that still needs doing for this client."
      trigger={
        <Button variant={variant} size={variant === "outline" ? "sm" : "default"}>
          {label}
        </Button>
      }
    >
      <ActionForm action={createTaskAction} submitLabel="Add a task" pendingLabel="Adding">
        <input type="hidden" name="organizationId" value={organizationId} />
        <ActionField name="title" label="Task">
          <Input name="title" required maxLength={200} />
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}

export function MergeForm({
  keepId,
  others,
}: {
  keepId: string;
  others: { id: string; name: string }[];
}) {
  if (others.length === 0) return null;
  return (
    <FormDrawer
      title="Merge a client"
      description="This client stays. The other one is closed."
      trigger={
        <Button variant="outline" size="sm">
          Merge
        </Button>
      }
    >
      <ActionForm action={mergeClientAction} submitLabel="Merge" pendingLabel="Merging">
        <input type="hidden" name="keepId" value={keepId} />
        <p className="text-sm text-muted-foreground">
          Merge another client into this one. This client stays. The other one is closed.
        </p>
        <ActionField name="dropId" label="Merge">
          <select name="dropId" required className={selectClass} defaultValue={others[0]?.id ?? ""}>
            {others.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </ActionField>
      </ActionForm>
    </FormDrawer>
  );
}
