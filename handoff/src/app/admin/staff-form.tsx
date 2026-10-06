"use client";

import { useActionState } from "react";
import { addStaffAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: FormState = { message: "" };

export function StaffForm({ workspaces }: { workspaces: { id: string; displayName: string }[] }) {
  const [state, action, pending] = useActionState(addStaffAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="staff-email">
        Staff email
        <Input id="staff-email" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="staff-workspace">
        Assign to
        <select id="staff-workspace" name="workspaceId" className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm" defaultValue="">
          <option value="">Staff only</option>
          {workspaces.map((workspace) => (
            <option key={workspace.id} value={workspace.id}>
              {workspace.displayName}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Add staff"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
