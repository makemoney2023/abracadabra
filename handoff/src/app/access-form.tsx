"use client";

import { useActionState } from "react";
import { requestAccess } from "./access-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial = { message: "" };

export function AccessForm() {
  const [state, action, pending] = useActionState(requestAccess, initial);

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="invite-email">
        Your email
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@client.com"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Send me a link"}
      </Button>
      {state.message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
