"use client";

import { useActionState } from "react";
import { ActionField, ActionForm } from "@/components/action-form";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClientAction, createClientDrawerAction, type FormState } from "./actions";

const initial: FormState = { message: "" };

const selectClass = "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function ClientFields() {
  return (
    <>
      <ActionField name="name" label="Company name">
        <Input name="name" required maxLength={200} />
      </ActionField>
      <ActionField name="website" label="Website">
        <Input name="website" placeholder="https://example.com" />
      </ActionField>
      <ActionField name="kind" label="Kind">
        <select name="kind" className={selectClass} defaultValue="client">
          <option value="lead">Lead</option>
          <option value="client">Client</option>
          <option value="past_client">Past client</option>
          <option value="partner">Partner</option>
        </select>
      </ActionField>
    </>
  );
}

export function NewClientDrawer() {
  return (
    <FormDrawer
      title="New client"
      description="Add the company. You can link a file space after that."
      trigger={<Button>New client</Button>}
    >
      <ActionForm action={createClientDrawerAction} submitLabel="Add a client" pendingLabel="Adding">
        <ClientFields />
      </ActionForm>
    </FormDrawer>
  );
}

export function ClientForm() {
  const [state, action, pending] = useActionState(createClientAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="client-name">
        Company name
        <Input id="client-name" name="name" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="client-website">
        Website
        <Input id="client-website" name="website" placeholder="https://example.com" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="client-kind">
        Kind
        <select id="client-kind" name="kind" className={selectClass} defaultValue="client">
          <option value="lead">Lead</option>
          <option value="client">Client</option>
          <option value="past_client">Past client</option>
          <option value="partner">Partner</option>
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a client"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
