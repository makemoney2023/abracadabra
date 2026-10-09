"use client";

import { useState } from "react";
import { signIn } from "./sign-in-action";
import { ActionField, ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <ActionForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in" className="gap-3">
      <ActionField name="username" label="Username">
        <Input
          name="username"
          defaultValue="admin"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </ActionField>
      <ActionField name="password" label="Password">
        <Input
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </ActionField>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit"
        onClick={() => setShowPassword((current) => !current)}
      >
        {showPassword ? "Hide password" : "Show password"}
      </Button>
    </ActionForm>
  );
}
