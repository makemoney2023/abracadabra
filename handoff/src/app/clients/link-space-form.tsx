"use client";

import { useActionState } from "react";
import { linkSpaceAction, type FormState } from "./actions";
import { Button } from "@/components/ui/button";

const initial: FormState = { message: "" };

export function LinkSpaceForm({
  organizationId,
  spaces,
}: {
  organizationId: string;
  spaces: { id: string; display_name: string; slug: string }[];
}) {
  const [state, action, pending] = useActionState(linkSpaceAction, initial);
  if (spaces.length === 0) {
    return <p className="text-sm text-muted-foreground">Every space is already linked.</p>;
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="link-space">
        Link a space
        <select
          id="link-space"
          name="workspaceId"
          required
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          defaultValue={spaces[0]?.id ?? ""}
        >
          {spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.display_name} ({space.slug})
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Linking" : "Link a space"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
