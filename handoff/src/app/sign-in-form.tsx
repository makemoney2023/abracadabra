"use client";

import { useFormStatus } from "react-dom";
import { signIn } from "./sign-in-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

export function SignInForm() {
  return (
    <form action={signIn} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="sign-in-username">
        Username
        <Input
          id="sign-in-username"
          name="username"
          autoComplete="username"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="sign-in-password">
        Password
        <Input
          id="sign-in-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <SubmitButton />
    </form>
  );
}
