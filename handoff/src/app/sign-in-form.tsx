"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn } from "./sign-in-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

export function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={signIn} className="flex flex-col gap-3" autoComplete="off">
      <input type="hidden" name="username" value="admin" />
      <p className="text-sm">Username: admin</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-in-password">Password</Label>
        <Input
          id="sign-in-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setShowPassword((current) => !current)}
      >
        {showPassword ? "Hide password" : "Show password"}
      </Button>
      <SubmitButton />
    </form>
  );
}
