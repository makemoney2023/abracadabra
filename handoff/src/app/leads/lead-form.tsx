"use client";

import { useActionState, useEffect } from "react";
import { ACTION_EVENT, SetPaletteActions } from "@/components/context-bar";
import { FormDrawer } from "@/components/form-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLeadAction, type LeadFormState } from "./actions";

const initial: LeadFormState = { message: "" };
const NEW_LEAD = "new-lead";

export function NewLeadDrawer() {
  useEffect(() => {
    function onAction(event: Event) {
      if (!(event instanceof CustomEvent) || event.detail !== NEW_LEAD) return;
      document.getElementById(NEW_LEAD)?.click();
    }
    window.addEventListener(ACTION_EVENT, onAction);
    return () => window.removeEventListener(ACTION_EVENT, onAction);
  }, []);

  return (
    <>
      <SetPaletteActions actions={[{ label: "New lead", run: NEW_LEAD }]} />
      <FormDrawer
        title="New lead"
        description="Type the company. A finished schema scan fills the blank details."
        trigger={<Button id={NEW_LEAD}>New lead</Button>}
      >
        <LeadFields />
      </FormDrawer>
    </>
  );
}

function LeadFields() {
  const [state, action, pending] = useActionState(createLeadAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-name">Company</Label>
        <Input id="lead-name" name="name" required maxLength={200} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-website">Website</Label>
        <Input id="lead-website" name="website" placeholder="https://example.com" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-contact">Contact</Label>
        <Input id="lead-contact" name="contactName" maxLength={200} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lead-email">Email</Label>
        <Input id="lead-email" name="email" type="email" maxLength={200} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add a lead"}
      </Button>
      {state.message ? (
        <p role="alert" className="text-sm text-status-late">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
