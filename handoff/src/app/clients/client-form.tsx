"use client";

import { useActionState } from "react";
import { createClientAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: FormState = { message: "" };

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
        <select
          id="client-kind"
          name="kind"
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          defaultValue="client"
        >
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
