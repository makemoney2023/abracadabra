"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createLeadAction, type LeadFormState } from "./actions";

const initial: LeadFormState = { message: "" };

export function LeadForm() {
  const [state, action, pending] = useActionState(createLeadAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="lead-name">
        Company
        <Input id="lead-name" name="name" required maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="lead-website">
        Website
        <Input id="lead-website" name="website" placeholder="https://example.com" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="lead-contact">
        Contact
        <Input id="lead-contact" name="contactName" maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="lead-email">
        Email
        <Input id="lead-email" name="email" type="email" maxLength={200} />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a lead"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
