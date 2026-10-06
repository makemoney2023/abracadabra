"use client";

import { useActionState } from "react";
import { invitePersonAction, removeMemberAction, resendInviteAction, type PeopleState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: PeopleState = { message: "" };

export function InviteForm({ slug, canInviteOwner }: { slug: string; canInviteOwner: boolean }) {
  const [state, action, pending] = useActionState(invitePersonAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <label className="flex flex-col gap-1 text-sm" htmlFor="person-email">
        Email
        <Input id="person-email" name="email" type="email" required autoComplete="email" />
      </label>
      {canInviteOwner ? (
        <label className="flex flex-col gap-1 text-sm" htmlFor="person-role">
          Role
          <select
            id="person-role"
            name="role"
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            defaultValue="client_member"
          >
            <option value="client_member">Client member</option>
            <option value="client_owner">Client owner</option>
          </select>
        </label>
      ) : (
        <input type="hidden" name="role" value="client_member" />
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Send invite"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function ResendForm({ slug, inviteId }: { slug: string; inviteId: string }) {
  const [state, action, pending] = useActionState(resendInviteAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="inviteId" value={inviteId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Sending" : "Send again"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function RemoveForm({ slug, membershipId }: { slug: string; membershipId: string }) {
  const [state, action, pending] = useActionState(removeMemberAction, initial);
  return (
    <form action={action} className="flex items-center gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Removing" : "Remove"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
