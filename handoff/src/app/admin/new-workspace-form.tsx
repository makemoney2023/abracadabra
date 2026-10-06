"use client";

import { useActionState } from "react";
import { createWorkspaceAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: FormState = { message: "" };

export function NewWorkspaceForm({ templates }: { templates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createWorkspaceAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="workspace-name">
        Client name
        <Input id="workspace-name" name="name" required />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="workspace-slug">
        Link name
        <Input id="workspace-slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="workspace-display">
        Name on the folder
        <Input id="workspace-display" name="displayName" required />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="workspace-sender">
        Your name on the files
        <Input id="workspace-sender" name="senderName" required />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="workspace-profile">
        File rules
        <select id="workspace-profile" name="policyProfile" className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm" defaultValue="standard">
          <option value="standard">Standard</option>
          <option value="software">Software</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="workspace-template">
        File ask
        <select id="workspace-template" name="templateId" className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm" defaultValue="">
          <option value="">None</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding" : "Add space"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
